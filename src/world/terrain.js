import * as THREE from 'three';
import { fbm, smoothstep, lerp } from './noise.js';
import { LAKE, CITY, PATH_POINTS, TURBINES } from './layout.js';

export const TERRAIN_SIZE = 640;
const SEGMENTS = 320;

export const pathCurve = new THREE.CatmullRomCurve3(
  PATH_POINTS.map((p) => new THREE.Vector3(p.x, 0, p.y)),
  false,
  'centripetal',
);
const pathSamples = pathCurve.getSpacedPoints(400);

export function distanceToPath(x, z) {
  let best = Infinity;
  for (const p of pathSamples) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
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
  let h = 1.5 + (fbm(x * 0.012 + 3.1, z * 0.012 - 7.4) - 0.5) * 16;
  h += (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 1.2;

  // Soft rolling hills that rise into distant mountains.
  const ridge = fbm(x * 0.006 - 11, z * 0.006 + 5, 5);
  h += smoothstep(120, 280, dist) * (30 + ridge * 70);

  // Small hills under the wind turbines.
  for (const [tx, tz] of TURBINES) {
    const d = Math.hypot(x - tx, z - tz);
    h += Math.exp(-(d * d) / 900) * 9;
  }

  const lakeD = distanceToLake(x, z);
  h = lerp(-3.6, h, smoothstep(LAKE.r * 0.5, LAKE.r * 1.3, lakeD));

  const cityD = distanceToCity(x, z);
  h = lerp(CITY.height, h, smoothstep(CITY.r, CITY.r + 28, cityD));

  // Keep the walking area around the spawn gentle.
  const spawnD = Math.hypot(x, z - 50);
  h = lerp(2.2 + (h - 2.2) * 0.35, h, smoothstep(10, 45, spawnD));

  return h;
}

const SAND = new THREE.Color(0xf6ecc9);
const SEABED = new THREE.Color(0x8fe0d2);
const GRASS_A = new THREE.Color(0x4fc236);
const GRASS_B = new THREE.Color(0xa6e85a);
const GRASS_DEEP = new THREE.Color(0x2e9e44);
const MOUNTAIN = new THREE.Color(0x6fb86a);
const PEAK = new THREE.Color(0xe8f6ff);
const PLAZA = new THREE.Color(0xf2f7fb);

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    const n = fbm(x * 0.03, z * 0.03, 3);
    c.copy(GRASS_A).lerp(GRASS_B, smoothstep(0.35, 0.7, n));
    c.lerp(GRASS_DEEP, smoothstep(0.55, 0.8, fbm(x * 0.011 + 40, z * 0.011, 3)) * 0.6);
    c.lerp(MOUNTAIN, smoothstep(14, 40, h));
    c.lerp(PEAK, smoothstep(55, 85, h));
    c.lerp(SAND, 1 - smoothstep(0.4, 1.6, h));
    c.lerp(SEABED, 1 - smoothstep(-1.2, 0.2, h));
    c.lerp(PLAZA, 1 - smoothstep(CITY.r - 6, CITY.r, distanceToCity(x, z)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// A glossy white walkway ribbon that hugs the terrain.
export function createPath() {
  const samples = pathCurve.getSpacedPoints(260);
  const width = 2.6;
  const positions = [];
  const uvs = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  samples.forEach((p, i) => {
    tangent.copy(pathCurve.getTangentAt(i / (samples.length - 1)));
    side.crossVectors(up, tangent).normalize().multiplyScalar(width / 2);
    for (const s of [-1, 1]) {
      const x = p.x + side.x * s;
      const z = p.z + side.z * s;
      positions.push(x, heightAt(x, z) + 0.08, z);
      uvs.push(s < 0 ? 0 : 1, i * 0.5);
    }
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
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    map: tileTexture(),
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function tileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#cfe6f5';
  g.fillRect(0, 0, 64, 3);
  g.fillRect(0, 0, 3, 64);
  g.fillRect(61, 0, 3, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
