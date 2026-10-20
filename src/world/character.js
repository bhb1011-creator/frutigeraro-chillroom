import * as THREE from 'three';
import { materials as M } from './materials.js';

// A small, round explorer: glossy white suit, aqua visor and a leaf sprout on the helmet.
export function createCharacter() {
  const g = new THREE.Group();
  g.name = 'character';
  const shade = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const body = shade(new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.45, 8, 24), M.white));
  body.position.y = 0.85;
  g.add(body);

  const belt = shade(new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.06, 8, 32), M.aqua));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.72;
  g.add(belt);

  const head = shade(new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), M.white));
  head.position.y = 1.72;
  g.add(head);

  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a7fc4,
    metalness: 0.4,
    roughness: 0.05,
    clearcoat: 1,
    iridescence: 0.6,
    envMapIntensity: 2,
  });
  const visor = shade(
    new THREE.Mesh(new THREE.SphereGeometry(0.51, 32, 16, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.3, Math.PI * 0.32), visorMat),
  );
  visor.position.set(0, 1.72, 0.02);
  g.add(visor);

  const stem = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.35, 8), M.leaf));
  stem.position.set(0, 2.36, 0);
  g.add(stem);
  const leafGeo = new THREE.SphereGeometry(0.16, 16, 10);
  for (const side of [-1, 1]) {
    const leaf = shade(new THREE.Mesh(leafGeo, M.leafLight));
    leaf.scale.set(1.3, 0.3, 0.65);
    leaf.position.set(side * 0.16, 2.52, 0);
    leaf.rotation.z = side * 0.5;
    g.add(leaf);
  }

  const limbGeo = new THREE.CapsuleGeometry(0.11, 0.38, 6, 12);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = shade(new THREE.Mesh(limbGeo, M.white));
    arm.position.set(side * 0.55, 0.95, 0);
    arm.rotation.z = side * 0.25;
    g.add(arm);
    arms.push(arm);
  }
  const legs = [];
  const footGeo = new THREE.SphereGeometry(0.17, 16, 10);
  for (const side of [-1, 1]) {
    const foot = shade(new THREE.Mesh(footGeo, M.aqua));
    foot.scale.set(1, 0.7, 1.35);
    foot.position.set(side * 0.2, 0.12, 0.05);
    g.add(foot);
    legs.push(foot);
  }

  const pack = shade(new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.3, 6, 16), M.glass));
  pack.position.set(0, 1.0, -0.42);
  g.add(pack);
  const packCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x7dff9a, emissive: 0x3dff6a, emissiveIntensity: 1.6 }),
  );
  packCore.position.copy(pack.position);
  g.add(packCore);

  // Walk cycle hook for the future game; stride 0 is standing still.
  g.userData.animate = (t, stride = 0) => {
    const s = Math.sin(t * 9) * stride;
    legs[0].position.z = 0.05 + s * 0.25;
    legs[1].position.z = 0.05 - s * 0.25;
    arms[0].rotation.x = s * 0.6;
    arms[1].rotation.x = -s * 0.6;
    body.position.y = 0.85 + Math.abs(s) * 0.05;
  };
  return g;
}
