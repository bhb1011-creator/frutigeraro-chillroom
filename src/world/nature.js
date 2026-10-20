import * as THREE from 'three';
import { createRng } from './noise.js';
import { materials as M } from './materials.js';
import { heightAt, distanceToPath, distanceToCity, distanceToLake } from './terrain.js';
import { CITY, LAKE } from './layout.js';

function freeSpot(x, z, { pathGap = 4, cityGap = 6 } = {}) {
  const h = heightAt(x, z);
  if (h < 0.9 || h > 34) return null;
  if (distanceToPath(x, z) < pathGap) return null;
  if (distanceToCity(x, z) < CITY.r + cityGap) return null;
  if (Math.hypot(x, z - 58) < 7) return null;
  return h;
}

// Round, glossy "lollipop" trees: two instanced meshes keep this cheap.
export function createTrees(seed = 21) {
  const rng = createRng(seed);
  const count = 420;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 1, 8);
  trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.SphereGeometry(1, 20, 14);
  const trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, count);
  const crowns = new THREE.InstancedMesh(crownGeo, M.leaf.clone(), count * 2);
  crowns.material.color.set(0xffffff);
  const palette = [0x46c43a, 0x6fd93c, 0x9be84a, 0x34b04a, 0x7ad35e].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let t = 0;
  let c = 0;
  for (let i = 0; i < count * 6 && t < count; i++) {
    // Mix of clustered groves and scattered single trees.
    const grove = rng() < 0.6;
    const r = grove ? 30 + rng() * 170 : 20 + rng() * 220;
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r + (grove ? Math.sin(a * 5) * 25 : 0);
    const z = Math.sin(a) * r;
    const h = freeSpot(x, z);
    if (h === null) continue;
    if (distanceToLake(x, z) < LAKE.r * 1.05) continue;
    const height = 2.5 + rng() * 4;
    p.set(x, h - 0.1, z);
    s.set(1, height, 1);
    m.compose(p, q.identity(), s);
    trunks.setMatrixAt(t++, m);
    const crownR = height * (0.38 + rng() * 0.12);
    const color = palette[Math.floor(rng() * palette.length)];
    p.set(x, h + height + crownR * 0.25, z);
    s.set(crownR, crownR * 1.05, crownR);
    m.compose(p, q, s);
    crowns.setMatrixAt(c, m);
    crowns.setColorAt(c++, color);
    if (rng() < 0.45) {
      const r2 = crownR * 0.65;
      p.set(x + (rng() - 0.5) * crownR, h + height + crownR * 0.9, z + (rng() - 0.5) * crownR);
      s.set(r2, r2, r2);
      m.compose(p, q, s);
      crowns.setMatrixAt(c, m);
      crowns.setColorAt(c++, palette[(palette.indexOf(color) + 1) % palette.length]);
    }
  }
  trunks.count = t;
  crowns.count = c;
  for (const im of [trunks, crowns]) {
    im.castShadow = true;
    im.receiveShadow = true;
  }
  const group = new THREE.Group();
  group.name = 'trees';
  group.add(trunks, crowns);
  return group;
}

// Little flower heads sprinkled through the meadow.
export function createFlowers(seed = 33) {
  const rng = createRng(seed);
  const count = 5000;
  const geo = new THREE.SphereGeometry(0.12, 8, 6);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const colors = [0xffffff, 0xffe14d, 0xff7ab8, 0x8fd8ff, 0xffffff].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < count * 4 && n < count; i++) {
    const r = 120 * Math.pow(rng(), 0.7);
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r + 15;
    const h = freeSpot(x, z, { pathGap: 1.8, cityGap: -2 });
    if (h === null) continue;
    m.makeTranslation(x, h + 0.55 + rng() * 0.35, z);
    mesh.setMatrixAt(n, m);
    mesh.setColorAt(n++, colors[Math.floor(rng() * colors.length)]);
  }
  mesh.count = n;
  mesh.name = 'flowers';
  return mesh;
}
