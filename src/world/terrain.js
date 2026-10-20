import * as THREE from 'three';
import { fbm, smoothstep, lerp } from './noise.js';
import { LAKE, CITY, PATH_POINTS, TURBINES, NEAR_SIZE, FAR_SIZE } from './layout.js';
import { loadTexture } from './assets.js';

export const TERRAIN_SIZE = NEAR_SIZE;

export const pathCurve = new THREE.CatmullRomCurve3(
  PATH_POINTS.map((p) => new THREE.Vector3(p.x, 0, p.y)),
  false,
  'centripetal',
);
const pathSamples = pathCurve.getSpacedPoints(400);

function exactDistanceToPath(x, z) {
  let best = Infinity;
  for (const p of pathSamples) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// Distances are cached on a 0.5 m grid around the path; far away we only need "far".
const GRID_PAD = 24;
const GRID_RES = 0.5;
const gridBox = new THREE.Box2().setFromPoints(PATH_POINTS).expandByScalar(GRID_PAD);
const gridW = Math.ceil((gridBox.max.x - gridBox.min.x) / GRID_RES) + 1;
const gridH = Math.ceil((gridBox.max.y - gridBox.min.y) / GRID_RES) + 1;
let grid = null;

export function distanceToPath(x, z) {
  if (x < gridBox.min.x || x > gridBox.max.x || z < gridBox.min.y || z > gridBox.max.y) return GRID_PAD;
  if (!grid) {
    grid = new Float32Array(gridW * gridH).fill(-1);
  }
  const gx = Math.round((x - gridBox.min.x) / GRID_RES);
  const gz = Math.round((z - gridBox.min.y) / GRID_RES);
  const i = gz * gridW + gx;
  if (grid[i] < 0) grid[i] = exactDistanceToPath(gridBox.min.x + gx * GRID_RES, gridBox.min.y + gz * GRID_RES);
  return grid[i];
}

export function distanceToLake(x, z) {
  return Math.hypot(x - LAKE.x, z - LAKE.z);
}

export function distanceToCity(x, z) {
  return Math.hypot(x - CITY.x, z - CITY.z);
}

// Pure height function: the single source of truth for ground height.
export function heightAt(x, z) {
  const dist = Math.hypot(x, z);
  let h = 1.6 + (fbm(x * 0.01 + 3.1, z * 0.01 - 7.4) - 0.5) * 15;
  h += (fbm(x * 0.045, z * 0.045, 2) - 0.5) * 1.4;

  // Gentle hills that keep rolling to the horizon instead of tall mountains.
  const far = smoothstep(150, 700, dist);
  h += far * (6 + fbm(x * 0.004 - 11, z * 0.004 + 5, 4) * 26);
  h += smoothstep(500, 2500, dist) * (fbm(x * 0.0012 + 2, z * 0.0012 - 9, 3) - 0.35) * 70;

  for (const [tx, tz] of TURBINES) {
    const d = Math.hypot(x - tx, z - tz);
    h += Math.exp(-(d * d) / 1400) * 9;
  }

  const lakeD = distanceToLake(x, z);
  h = lerp(-3.8, h, smoothstep(LAKE.r * 0.5, LAKE.r * 1.3, lakeD));

  const cityD = distanceToCity(x, z);
  h = lerp(CITY.height, h, smoothstep(CITY.r, CITY.r + 32, cityD));

  // Keep the walking area around the spawn gentle.
  const spawnD = Math.hypot(x, z - 55);
  h = lerp(2.2 + (h - 2.2) * 0.35, h, smoothstep(12, 50, spawnD));

  return h;
}

// Ground shader: photo grass texture sampled at two scales and blended with noise so the
// tiling disappears, plus sand on the shores and dirt patches.
function createGroundMaterial() {
  const grassA = loadTexture('grasslight-big.jpg');
  const grassB = loadTexture('ground_grass.jpg');
  const dirt = loadTexture('dirt_color.jpg');
  const dirtNormal = loadTexture('dirt_normal.jpg', { srgb: false });

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    normalMap: dirtNormal,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
  // Normal map needs UVs; world-space UVs are provided below so this keeps the define on.
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrassA = { value: grassA };
    shader.uniforms.tGrassB = { value: grassB };
    shader.uniforms.tDirt = { value: dirt };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aSplat;
        varying vec3 vSplat;
        varying vec3 vGroundPos;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vSplat = aSplat;
        vGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGrassA, tGrassB, tDirt;
        varying vec3 vSplat;
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
        grass = mix(grass, gB * vec3(1.35, 1.6, 0.9), 0.25 * smoothstep(0.4, 0.9, gNoise(wp * 0.06 + 7.0)));
        vec3 dirtC = texture2D(tDirt, wp / 6.0).rgb;
        float grain = dot(dirtC, vec3(0.333));
        vec3 sand = vec3(0.9, 0.8, 0.6) * (0.75 + grain * 0.8);
        vec3 seabed = vec3(0.28, 0.62, 0.6) * (0.85 + grain * 0.5);
        vec3 albedo = grass;
        albedo = mix(albedo, dirtC * 1.15, vSplat.z * smoothstep(0.25, 0.6, n));
        albedo = mix(albedo, sand, vSplat.y);
        albedo = mix(albedo, seabed, vSplat.x);
        // Lift the photo grass towards a brighter, more saturated Aero green.
        diffuseColor.rgb *= albedo * mix(vec3(1.0), vec3(1.08, 1.22, 0.86), 1.0 - max(vSplat.x, vSplat.y));
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
        // Only bumpy where sand or dirt shows; grass stays smooth and bright.
        vec3 mapN = texture2D(normalMap, vGroundPos.xz / 6.0).xyz * 2.0 - 1.0;
        mapN.xy *= normalScale * max(vSplat.y, vSplat.z);
        normal = normalize(tbn * mapN);
        `,
      );
  };
  mat.customProgramCacheKey = () => 'ground-v4';
  return mat;
}

const TINT_A = new THREE.Color(0xffffff);
const TINT_B = new THREE.Color(0xd8f0a0);
const TINT_DEEP = new THREE.Color(0xa6d6a0);
const TINT_FAR = new THREE.Color(0xc4e6c8);

function buildGround(size, segments, hideInside = 0) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const splat = new Float32Array(pos.count * 3);
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

    const seabed = 1 - smoothstep(-1.4, 0.1, h);
    const sand = 1 - smoothstep(0.25, 1.0, h);
    const pathD = distanceToPath(x, z);
    const dirt = Math.max(1 - smoothstep(1.4, 3.2, pathD), smoothstep(0.62, 0.78, fbm(x * 0.03 + 9, z * 0.03, 3)) * 0.8);
    splat.set([seabed, sand, dirt], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 3));
  geo.computeVertexNormals();
  return geo;
}

export function createTerrain() {
  const mat = createGroundMaterial();
  const group = new THREE.Group();
  group.name = 'terrain';

  const near = new THREE.Mesh(buildGround(NEAR_SIZE, 380), mat);
  near.receiveShadow = true;
  near.name = 'terrain-near';
  group.add(near);

  const far = new THREE.Mesh(buildGround(FAR_SIZE, 180, NEAR_SIZE / 2 - 1), mat);
  far.receiveShadow = false;
  far.name = 'terrain-far';
  group.add(far);
  return group;
}

// A glossy white walkway ribbon that hugs the terrain, with raised rounded curbs.
export function createPath() {
  const samples = pathCurve.getSpacedPoints(300);
  const width = 2.8;
  const positions = [];
  const uvs = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const curbPoints = [[], []];

  samples.forEach((p, i) => {
    tangent.copy(pathCurve.getTangentAt(i / (samples.length - 1)));
    side.crossVectors(up, tangent).normalize().multiplyScalar(width / 2);
    [-1, 1].forEach((s, k) => {
      const x = p.x + side.x * s;
      const z = p.z + side.z * s;
      const y = heightAt(x, z) + 0.1;
      positions.push(x, y, z);
      uvs.push(s < 0 ? 0 : 1, i * 0.45);
      curbPoints[k].push(new THREE.Vector3(x, y + 0.04, z));
    });
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xf7fbff,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    map: tileTexture(),
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const group = new THREE.Group();
  const road = new THREE.Mesh(geo, mat);
  road.receiveShadow = true;
  group.add(road);

  const curbMat = new THREE.MeshPhysicalMaterial({ color: 0xe9f4fb, roughness: 0.25, clearcoat: 1 });
  for (const pts of curbPoints) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const curb = new THREE.Mesh(new THREE.TubeGeometry(curve, 600, 0.09, 6), curbMat);
    curb.castShadow = true;
    curb.receiveShadow = true;
    group.add(curb);
  }
  return group;
}

function tileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#d6e9f5';
  g.fillRect(0, 0, 128, 3);
  g.fillRect(0, 64, 128, 2);
  g.fillRect(63, 0, 2, 64);
  g.fillRect(0, 0, 4, 128);
  g.fillRect(124, 0, 4, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
