import * as THREE from 'three';
import { materials as M } from './materials.js';
import { TURBINES } from './layout.js';
import { heightAt } from './terrain.js';

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function windTurbine(height = 26) {
  const g = new THREE.Group();
  const tower = mesh(new THREE.CylinderGeometry(0.35, 0.9, height, 16), M.white);
  tower.position.y = height / 2;
  g.add(tower);
  const nacelle = mesh(new THREE.CapsuleGeometry(0.8, 2.2, 8, 16), M.white);
  nacelle.rotation.x = Math.PI / 2;
  nacelle.position.set(0, height + 0.5, -0.4);
  g.add(nacelle);
  const rotor = new THREE.Group();
  rotor.position.set(0, height + 0.5, 1.2);
  const hub = mesh(new THREE.SphereGeometry(0.75, 16, 12), M.aqua);
  rotor.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.9, 12, 0.18);
  bladeGeo.translate(0, 6.2, 0);
  for (let i = 0; i < 3; i++) {
    const b = mesh(bladeGeo, M.white);
    b.rotation.z = (i / 3) * Math.PI * 2;
    rotor.add(b);
  }
  g.add(rotor);
  g.userData.update = (t) => {
    rotor.rotation.z = t * 0.9 + g.id;
  };
  return g;
}

// Wind turbines on the hills around the meadow.
export function createBuildings() {
  const group = new THREE.Group();
  group.name = 'countryside';
  const animated = [];
  const at = (obj, x, z, rotY = 0) => {
    obj.position.set(x, heightAt(x, z) - 0.05, z);
    obj.rotation.y = rotY;
    group.add(obj);
    if (obj.userData.update) animated.push(obj);
    return obj;
  };

  for (const [x, z] of TURBINES) {
    at(windTurbine(30), x, z, Math.atan2(-x, -z) * 0.2 + 0.4);
  }

  group.userData.update = (t) => {
    for (const a of animated) a.userData.update(t);
  };
  return group;
}
