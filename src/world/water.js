import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { createRng } from './noise.js';
import { LAKE, WATER_LEVEL, FAR_SIZE } from './layout.js';
import { heightAt } from './terrain.js';
import { loadTexture } from './assets.js';
import { SUN_DIRECTION } from './sky.js';

// Mirror-reflective water for every hollow below sea level (lake, bays, distant sea).
export function createWater() {
  const normals = loadTexture('waternormals.jpg', { srgb: false });
  const water = new Water(new THREE.PlaneGeometry(FAR_SIZE, FAR_SIZE), {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals: normals,
    sunDirection: SUN_DIRECTION.clone(),
    sunColor: 0xfff6e0,
    waterColor: 0x0aa8c8,
    distortionScale: 1.6,
    alpha: 0.86,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.material.transparent = true;
  water.material.uniforms.size.value = 3.5;
  water.renderOrder = 2;
  water.name = 'water';
  water.userData.update = (t) => {
    water.material.uniforms.time.value = t * 0.35;
  };
  return water;
}

function fishMesh(color, stripe) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), bodyMat);
  body.scale.set(1.2, 0.75, 0.4);
  g.add(body);
  const stripeMesh = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 20), new THREE.MeshStandardMaterial({ color: stripe }));
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
  for (let i = 0; i < 30; i++) {
    const [c, s] = palettes[i % palettes.length];
    const f = fishMesh(c, s);
    const r = 4 + rng() * LAKE.r * 0.75;
    const a = rng() * Math.PI * 2;
    const depth = -0.5 - rng() * 1.2;
    f.userData = { r, a, depth, speed: 0.15 + rng() * 0.25 };
    f.scale.setScalar(0.5 + rng() * 0.5);
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
