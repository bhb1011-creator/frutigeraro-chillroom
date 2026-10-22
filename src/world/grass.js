import * as THREE from 'three';
import { createRng } from './noise.js';
import { heightAt, distanceToTower } from './terrain.js';
import { NEAR_SIZE } from './layout.js';
import { loadModel } from './assets.js';

// Dense grass that travels with the camera. Each layer is a fixed, jittered grid of clumps that
// tiles the world every `size` metres; the vertex shader wraps every clump into the square
// around the camera, so clumps stay put in the world and only reappear on the far side when
// left behind. Heights (and where grass may grow) come from a heightmap texture.
//
//   near layer: very dense, small clumps up to ~32 m
//   far layer:  coarser, bigger clumps from ~18 m to ~115 m (overlaps the near layer's fade)
// Beyond that the neon ground texture carries the meadow.

// Bright neon greens for the dream meadow.
const GREENS = [0x6dff1e, 0x86ff30, 0x5cf614, 0x9cff44, 0x7af826, 0xb0ff58].map((c) => new THREE.Color(c));

const LAYERS = [
  { size: 66, spacing: 0.17, scale: 0.16, fadeIn: 0, fadeOut: 32 },
  { size: 240, spacing: 0.5, scale: 0.26, fadeIn: 18, fadeOut: 115 },
];

const HEIGHTMAP_RES = 2; // metres per texel, matches the terrain mesh

function loadClump() {
  return loadModel('grass.glb').then((gltf) => {
    let mesh = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh) mesh = o;
    });
    return { geometry: mesh.geometry, map: mesh.material.map };
  });
}

// R: ground height, G: 1 where grass may grow (not inside tower footprints).
function createHeightmap() {
  const n = Math.round(NEAR_SIZE / HEIGHTMAP_RES) + 1;
  const half = NEAR_SIZE / 2;
  const data = new Float32Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + i * HEIGHTMAP_RES;
      const z = -half + j * HEIGHTMAP_RES;
      const k = (j * n + i) * 4;
      data[k] = heightAt(x, z);
      data[k + 1] = distanceToTower(x, z) > 0.8 ? 1 : 0;
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { tex, n, half };
}

function grassMaterial(map, layer, shared) {
  const mat = new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, {
      uSize: { value: layer.size },
      uFade: { value: new THREE.Vector2(layer.fadeIn, layer.fadeOut) },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime, uSize, uHalf, uTexels;
        uniform vec2 uFade;
        uniform vec3 uCam;
        uniform sampler2D tHeight;
        attribute vec2 aOffset;
        attribute vec4 aRand;
        attribute vec3 aColor;
        varying float vH;
        varying vec3 vGrassColor;

        // Manual bilinear filtering: float textures are not filterable everywhere.
        vec4 heightSample(vec2 xz) {
          vec2 t = (xz + uHalf) / (uHalf * 2.0) * (uTexels - 1.0);
          vec2 i = floor(t);
          vec2 f = t - i;
          vec2 px = vec2(1.0 / uTexels);
          vec2 uv = (i + 0.5) * px;
          vec4 a = texture2D(tHeight, uv);
          vec4 b = texture2D(tHeight, uv + vec2(px.x, 0.0));
          vec4 c = texture2D(tHeight, uv + vec2(0.0, px.y));
          vec4 d = texture2D(tHeight, uv + px);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `
        // Wrap this clump into the square around the camera.
        vec2 rel = mod(aOffset - uCam.xz + uSize * 0.5, uSize) - uSize * 0.5;
        vec2 wxz = uCam.xz + rel;
        float dist = length(rel);
        vec4 hs = heightSample(wxz);
        float inside = step(abs(wxz.x), uHalf - 1.0) * step(abs(wxz.y), uHalf - 1.0);
        float fade = smoothstep(uFade.y, uFade.y * 0.8, dist);
        if (uFade.x > 0.0) fade *= smoothstep(uFade.x, uFade.x * 1.25, dist);
        float sc = aRand.y * fade * step(0.5, hs.g) * inside;

        vH = position.y / 2.0;
        vGrassColor = aColor;
        vec3 transformed = position * vec3(sc * aRand.z, sc * aRand.w, sc * aRand.z);
        float cr = cos(aRand.x);
        float sr = sin(aRand.x);
        transformed.xz = mat2(cr, -sr, sr, cr) * transformed.xz;
        float sway = sin(uTime * 1.7 + wxz.x * 0.21 + wxz.y * 0.13) * 0.18 + sin(uTime * 3.3 + wxz.x * 0.9 + wxz.y) * 0.05;
        transformed.x += sway * vH * vH * sc;
        transformed.z += sway * 0.5 * vH * vH * sc;
        transformed += vec3(wxz.x, hs.r - 0.03, wxz.y);`,
      )
      // Light the clumps like a lawn surface, which reads much softer than per-card normals.
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;\nvarying vec3 vGrassColor;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= vGrassColor * mix(1.05, 1.9, smoothstep(0.0, 0.9, vH));`,
      );
  };
  mat.customProgramCacheKey = () => `grass-travel-${layer.size}`;
  return mat;
}

function createLayer(clump, map, layer, shared, rng) {
  const cells = Math.round(layer.size / layer.spacing);
  const count = cells * cells;
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = clump.index;
  for (const name of ['position', 'normal', 'uv']) geo.setAttribute(name, clump.attributes[name]);
  const offset = new Float32Array(count * 2);
  const rand = new Float32Array(count * 4);
  const color = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let j = 0, k = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++, k++) {
      offset[k * 2] = (i + rng()) * layer.spacing;
      offset[k * 2 + 1] = (j + rng()) * layer.spacing;
      rand[k * 4] = rng() * Math.PI * 2;
      rand[k * 4 + 1] = layer.scale * (0.7 + rng() * 0.6);
      rand[k * 4 + 2] = 0.9 + rng() * 0.5;
      rand[k * 4 + 3] = 0.8 + rng() * 0.5;
      c.copy(GREENS[Math.floor(rng() * GREENS.length)]).multiplyScalar(0.9 + rng() * 0.25);
      color.set([c.r, c.g, c.b], k * 3);
    }
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 2));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 4));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
  geo.instanceCount = count;
  const mesh = new THREE.Mesh(geo, grassMaterial(map, layer, shared));
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return mesh;
}

export async function createGrass({ seed = 3 } = {}) {
  const rng = createRng(seed);
  const { geometry, map } = await loadClump();
  const heightmap = createHeightmap();
  const shared = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    tHeight: { value: heightmap.tex },
    uHalf: { value: heightmap.half },
    uTexels: { value: heightmap.n },
  };
  const group = new THREE.Group();
  group.name = 'grass';
  for (const layer of LAYERS) group.add(createLayer(geometry, map, layer, shared, rng));
  group.userData.update = (t, camera) => {
    shared.uTime.value = t;
    if (camera) shared.uCam.value.copy(camera.position);
  };
  return group;
}
