import * as THREE from 'three';
import { createRng } from './noise.js';
import { LAKE, WATER_LEVEL } from './layout.js';
import { heightAt } from './terrain.js';

function rippleNormalMap(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const h = (x, y) => {
    const u = (x / size) * Math.PI * 2;
    const v = (y / size) * Math.PI * 2;
    return (
      Math.sin(u * 3 + v * 2) * 0.5 +
      Math.sin(u * 7 - v * 5) * 0.25 +
      Math.sin(u * 13 + v * 11) * 0.12 +
      Math.cos(u * 5 + v * 9) * 0.2
    );
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 48);
  tex.needsUpdate = true;
  return tex;
}

export function createWater() {
  const normalMap = rippleNormalMap();
  // One sheet of water for the whole map: every hollow below sea level becomes a lake or bay.
  const geo = new THREE.PlaneGeometry(640, 640, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x1fc4e8,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.74,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    clearcoatNormalMap: normalMap,
    clearcoatNormalScale: new THREE.Vector2(0.12, 0.12),
    normalMap,
    normalScale: new THREE.Vector2(0.08, 0.08),
    envMapIntensity: 1.1,
    depthWrite: false,
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = WATER_LEVEL;
  water.renderOrder = 2;
  water.name = 'water';
  water.userData.update = (t) => {
    normalMap.offset.set(t * 0.01, t * 0.006);
  };
  return water;
}

function fishMesh(color, stripe) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), bodyMat);
  body.scale.set(1.2, 0.75, 0.4);
  g.add(body);
  const stripeMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.06, 6, 20),
    new THREE.MeshStandardMaterial({ color: stripe }),
  );
  stripeMesh.rotation.y = Math.PI / 2;
  stripeMesh.scale.set(0.45, 0.85, 1);
  g.add(stripeMesh);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 3), bodyMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.75;
  tail.scale.z = 0.3;
  g.add(tail);
  return g;
}

export function createFish(seed = 11) {
  const rng = createRng(seed);
  const group = new THREE.Group();
  group.name = 'fish';
  const palettes = [
    [0xff8a1f, 0xffffff],
    [0xffd21f, 0x1f6dff],
    [0x2fd6ff, 0xffe36b],
    [0xff4f8b, 0xffffff],
  ];
  const fish = [];
  for (let i = 0; i < 26; i++) {
    const [c, s] = palettes[i % palettes.length];
    const f = fishMesh(c, s);
    const r = 4 + rng() * LAKE.r * 0.75;
    const a = rng() * Math.PI * 2;
    const depth = -0.6 - rng() * 1.4;
    f.userData = { r, a, depth, speed: 0.15 + rng() * 0.25 };
    f.scale.setScalar(0.6 + rng() * 0.6);
    group.add(f);
    fish.push(f);
  }
  group.userData.update = (t) => {
    for (const f of fish) {
      const { r, a, depth, speed } = f.userData;
      const ang = a + t * speed;
      const x = LAKE.x + Math.cos(ang) * r;
      const z = LAKE.z + Math.sin(ang) * r;
      const floor = heightAt(x, z) + 0.4;
      f.position.set(x, Math.max(depth, floor), z);
      f.rotation.y = -ang;
    }
  };
  group.userData.update(0);
  return group;
}

// Iridescent soap bubbles drifting over the lake and meadow.
export function createBubbles(seed = 5) {
  const rng = createRng(seed);
  const group = new THREE.Group();
  group.name = 'bubbles';
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [200, 900],
    clearcoat: 1,
    envMapIntensity: 2.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.SphereGeometry(1, 32, 24);
  const bubbles = [];
  for (let i = 0; i < 70; i++) {
    const b = new THREE.Mesh(geo, mat);
    const nearLake = i < 45;
    const x = nearLake ? LAKE.x + (rng() - 0.3) * LAKE.r * 1.6 : (rng() - 0.5) * 50;
    const z = nearLake ? LAKE.z + (rng() - 0.5) * LAKE.r * 1.6 : 20 + rng() * 40;
    const base = Math.max(heightAt(x, z), 0) + 1.5 + rng() * 9;
    b.scale.setScalar(0.25 + Math.pow(rng(), 2.5) * 1.6);
    b.position.set(x, base, z);
    b.userData = { base, phase: rng() * 10 };
    b.renderOrder = 3;
    group.add(b);
    bubbles.push(b);
  }
  group.userData.update = (t) => {
    for (const b of bubbles) {
      b.position.y = b.userData.base + Math.sin(t * 0.6 + b.userData.phase) * 0.6;
    }
  };
  return group;
}
