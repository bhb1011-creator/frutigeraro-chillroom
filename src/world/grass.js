import * as THREE from 'three';
import { createRng } from './noise.js';
import { heightAt, distanceToPath, distanceToCity } from './terrain.js';
import { CITY } from './layout.js';
import { loadModel } from './assets.js';

const GREENS = [0x7ee83e, 0x96f04e, 0x6cdc3a, 0xaaf45c, 0x62d23c, 0xb8f86c].map((c) => new THREE.Color(c));

let clumpPromise = null;
function loadClump() {
  clumpPromise ??= loadModel('grass.glb').then((gltf) => {
    let mesh = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh) mesh = o;
    });
    return { geometry: mesh.geometry, map: mesh.material.map };
  });
  return clumpPromise;
}

function grassMaterial(map, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vH;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vH = position.y / 2.0;
        vec4 iw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.7 + iw.x * 0.21 + iw.z * 0.13) * 0.18 + sin(uTime * 3.3 + iw.x * 0.9 + iw.z) * 0.05;
        transformed.x += sway * vH * vH;
        transformed.z += sway * 0.5 * vH * vH;`,
      )
      // Light the clumps like a lawn surface, which reads much softer than per-card normals.
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(0.6, 1.35, smoothstep(0.0, 0.9, vH));`,
      );
  };
  mat.customProgramCacheKey = () => 'grass-clump-v2';
  return mat;
}

const CHUNK = 32;
const VIEW_DISTANCE = 240;

/**
 * Instanced textured grass clumps, split into 32 m chunks so the renderer can skip
 * chunks outside the view or farther than VIEW_DISTANCE.
 * areas: [{ x, z, r, count, scale?, even? }] — each area scatters clumps (densest in the middle unless even).
 * accept(x, z, h): optional extra filter.
 */
export async function createGrass({ areas, accept = defaultAccept, seed = 3, heightFn = heightAt }) {
  const rng = createRng(seed);
  const { geometry, map } = await loadClump();
  const uniforms = { uTime: { value: 0 } };
  const material = grassMaterial(map, uniforms);
  const chunks = new Map();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);

  for (const area of areas) {
    let n = 0;
    let tries = 0;
    while (n < area.count && tries < area.count * 3) {
      tries++;
      const r = area.r * Math.sqrt(rng()) * (area.even ? 1 : 0.35 + 0.65 * Math.sqrt(rng()));
      const a = rng() * Math.PI * 2;
      const x = area.x + Math.cos(a) * r;
      const z = area.z + Math.sin(a) * r;
      const h = heightFn(x, z);
      if (!accept(x, z, h)) continue;
      p.set(x, h - 0.03, z);
      q.setFromAxisAngle(yAxis, rng() * Math.PI * 2);
      const size = (area.scale ?? 0.16) * (0.7 + rng() * 0.6);
      s.set(size * (0.9 + rng() * 0.4), size * (0.8 + rng() * 0.5), size * (0.9 + rng() * 0.4));
      m.compose(p, q, s);
      c.copy(GREENS[Math.floor(rng() * GREENS.length)]).multiplyScalar(0.9 + rng() * 0.25);
      const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = { matrices: [], colors: [] };
        chunks.set(key, chunk);
      }
      chunk.matrices.push(m.clone());
      chunk.colors.push(c.clone());
      n++;
    }
  }

  const group = new THREE.Group();
  group.name = 'grass';
  for (const { matrices, colors } of chunks.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((mm, i) => {
      mesh.setMatrixAt(i, mm);
      mesh.setColorAt(i, colors[i]);
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.update = (t, camera) => {
    uniforms.uTime.value = t;
    if (!camera) return;
    for (const mesh of group.children) {
      mesh.visible = mesh.boundingSphere.center.distanceTo(camera.position) < VIEW_DISTANCE + mesh.boundingSphere.radius;
    }
  };
  return group;
}

function defaultAccept(x, z, h) {
  if (h < 0.9 || h > 40) return false;
  if (distanceToPath(x, z) < 1.75) return false;
  if (distanceToCity(x, z) < CITY.r + 1) return false;
  return true;
}
