import * as THREE from 'three';
import { fbm, smoothstep, lerp } from './noise.js';
import { SPAWN, CLUSTER, TOWER_SITES, TURBINES, NEAR_SIZE, FAR_SIZE } from './layout.js';
import { loadTexture } from './assets.js';

const SITES = Object.values(TOWER_SITES);

export function distanceToTower(x, z) {
  let best = Infinity;
  for (const s of SITES) best = Math.min(best, Math.hypot(x - s.x, z - s.z) - s.r);
  return best;
}

function baseHeight(x, z) {
  const dist = Math.hypot(x, z);
  // Few, broad octaves only: long soft swells instead of bumpy or steep terrain.
  let h = 2 + (fbm(x * 0.006 + 3.1, z * 0.006 - 7.4, 2) - 0.5) * 14;
  h += (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 0.8;

  // Rolling hills that flow out to the horizon; they also hide the feet of the far towers.
  h += smoothstep(140, 650, dist) * (4 + fbm(x * 0.0024 - 11, z * 0.0024 + 5, 2) * 48);
  h += smoothstep(600, 2600, dist) * (fbm(x * 0.0011 + 2, z * 0.0011 - 9, 2) - 0.3) * 80;

  for (const [tx, tz] of TURBINES) {
    const d = Math.hypot(x - tx, z - tz);
    h += Math.exp(-(d * d) / 2200) * 8;
  }

  // Keep the area around the spawn gentle.
  const spawnD = Math.hypot(x - SPAWN.x, z - SPAWN.z);
  return lerp(2.2 + (h - 2.2) * 0.35, h, smoothstep(12, 50, spawnD));
}

// Pure height function: the single source of truth for ground height.
// The tower cluster stands on one level area that blends softly into the meadow.
export const CLUSTER_Y = baseHeight(CLUSTER.x, CLUSTER.z);
export function heightAt(x, z) {
  const d = Math.hypot(x - CLUSTER.x, z - CLUSTER.z);
  return lerp(CLUSTER_Y, baseHeight(x, z), smoothstep(CLUSTER.r, CLUSTER.r + 32, d));
}

// Ground shader: photo grass texture sampled at two scales and blended with noise so the
// tiling disappears, pushed to a bright, dreamy neon green.
function createGroundMaterial() {
  const grassA = loadTexture('grasslight-big.jpg');
  const grassB = loadTexture('ground_grass.jpg');

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrassA = { value: grassA };
    shader.uniforms.tGrassB = { value: grassB };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGrassA, tGrassB;
        varying vec3 vGroundPos;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 wp = vGroundPos.xz;
        float n = gNoise(wp * 0.035) * 0.65 + gNoise(wp * 0.11) * 0.35;
        vec3 gA = texture2D(tGrassA, wp / 9.0).rgb;
        vec3 gA2 = texture2D(tGrassA, mat2(0.8, -0.6, 0.6, 0.8) * wp / 21.0).rgb;
        vec3 gB = texture2D(tGrassB, wp / 5.0).rgb;
        vec3 grass = mix(gA, gA2, smoothstep(0.3, 0.7, n));
        grass = mix(grass, gB, 0.2 * smoothstep(0.4, 0.9, gNoise(wp * 0.06 + 7.0)));
        // Keep the texture's light and shade but recolour it a saturated neon green.
        float lum = dot(grass, vec3(0.3, 0.59, 0.11));
        // The texture's detail calms down with distance, so tiling and LOD changes don't show.
        float calm = smoothstep(40.0, 400.0, distance(vGroundPos, cameraPosition));
        lum = mix(lum, 0.13, calm * 0.75);
        vec3 neon = vec3(0.28, 1.0, 0.04) * (0.35 + lum * 2.6);
        diffuseColor.rgb *= mix(mix(grass * vec3(1.0, 1.6, 0.4), neon, 0.75), neon, calm);
        `,
      );
  };
  mat.customProgramCacheKey = () => 'ground-dream-v2';
  return mat;
}

const TINT_A = new THREE.Color(0xffffff);
const TINT_B = new THREE.Color(0xf0ffb0);
const TINT_DEEP = new THREE.Color(0xc8f0b0);
const TINT_FAR = new THREE.Color(0xd8f8d0);

function buildGround(size, segments, hideInside = 0) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const uvs = geo.attributes.uv;
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let h = heightAt(x, z);
    // The far ring tucks under the detailed near terrain.
    if (hideInside && Math.abs(x) < hideInside && Math.abs(z) < hideInside) h -= 4;
    pos.setY(i, h);
    uvs.setXY(i, x / 6, z / 6);

    const n = fbm(x * 0.02, z * 0.02, 3);
    c.copy(TINT_A).lerp(TINT_B, smoothstep(0.45, 0.75, n) * 0.7);
    c.lerp(TINT_DEEP, smoothstep(0.55, 0.8, fbm(x * 0.008 + 40, z * 0.008, 3)) * 0.5);
    c.lerp(TINT_FAR, smoothstep(300, 1500, Math.hypot(x, z)) * 0.6);
    colors.set([c.r, c.g, c.b], i * 3);

  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export function createTerrain() {
  const mat = createGroundMaterial();
  const group = new THREE.Group();
  group.name = 'terrain';

  const near = new THREE.Mesh(buildGround(NEAR_SIZE, NEAR_SIZE / 2), mat);
  near.receiveShadow = true;
  near.name = 'terrain-near';
  group.add(near);

  const far = new THREE.Mesh(buildGround(FAR_SIZE, 180, NEAR_SIZE / 2 - 1), mat);
  far.receiveShadow = false;
  far.name = 'terrain-far';
  group.add(far);
  return group;
}
