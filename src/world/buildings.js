import * as THREE from 'three';
import { materials as M } from './materials.js';
import { CITY, TURBINES } from './layout.js';
import { heightAt } from './terrain.js';

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function rooftopGarden(radius) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(radius, radius, 0.5, 32), M.leaf));
  const count = Math.max(3, Math.round(radius * 1.4));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = radius * 0.6;
    const s = 0.6 + (i % 3) * 0.25;
    const bush = mesh(new THREE.SphereGeometry(s, 16, 12), i % 2 ? M.leaf : M.leafLight);
    bush.position.set(Math.cos(a) * r, 0.25 + s * 0.7, Math.sin(a) * r);
    g.add(bush);
  }
  return g;
}

// Round glass tower with white floor bands and a green roof.
function glassTower(height, radius) {
  const g = new THREE.Group();
  const core = mesh(new THREE.CylinderGeometry(radius * 0.86, radius * 0.86, height, 32), M.glassCore);
  core.position.y = height / 2;
  g.add(core);
  const shell = mesh(new THREE.CylinderGeometry(radius, radius, height, 48, 1, true), M.glass, { cast: false });
  shell.position.y = height / 2;
  g.add(shell);
  const bandGeo = new THREE.CylinderGeometry(radius + 0.12, radius + 0.12, 0.28, 48);
  for (let y = 3.2; y < height; y += 3.2) {
    const band = mesh(bandGeo, M.white);
    band.position.y = y;
    g.add(band);
  }
  const cap = mesh(new THREE.CylinderGeometry(radius + 0.4, radius + 0.2, 0.9, 48), M.white);
  cap.position.y = height + 0.45;
  g.add(cap);
  const garden = rooftopGarden(radius * 0.92);
  garden.position.y = height + 0.9;
  g.add(garden);
  return g;
}

// Pill-shaped tower with vertical white fins and an antenna orb.
function capsuleTower(height, radius) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(radius, height - radius * 2, 12, 32), M.glassCore);
  body.position.y = height / 2;
  g.add(body);
  const shell = mesh(new THREE.CapsuleGeometry(radius + 0.3, height - radius * 2, 12, 48), M.glass, { cast: false });
  shell.position.y = height / 2;
  g.add(shell);
  const finGeo = new THREE.BoxGeometry(0.35, height - radius * 1.2, 0.9);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fin = mesh(finGeo, M.white);
    fin.position.set(Math.cos(a) * (radius + 0.35), height / 2, Math.sin(a) * (radius + 0.35));
    fin.rotation.y = -a;
    g.add(fin);
  }
  const mast = mesh(new THREE.CylinderGeometry(0.15, 0.25, 8, 12), M.silver);
  mast.position.y = height + 3.5;
  g.add(mast);
  const orb = mesh(new THREE.SphereGeometry(0.8, 24, 16), M.aqua);
  orb.position.y = height + 7.8;
  g.add(orb);
  return g;
}

// Stacked, gently twisting floor plates alternating glass and white.
function twistTower(floors, size) {
  const g = new THREE.Group();
  const slab = new THREE.BoxGeometry(size, 2.6, size * 0.62);
  const rim = new THREE.BoxGeometry(size + 0.5, 0.35, size * 0.62 + 0.5);
  for (let i = 0; i < floors; i++) {
    const rot = i * 0.07;
    const f = mesh(slab, M.glassCore);
    f.position.y = i * 3 + 1.3;
    f.rotation.y = rot;
    g.add(f);
    const r = mesh(rim, M.white);
    r.position.y = i * 3 + 2.8;
    r.rotation.y = rot;
    g.add(r);
  }
  const garden = rooftopGarden(size * 0.32);
  garden.position.y = floors * 3 + 3;
  g.add(garden);
  return g;
}

// Glass greenhouse dome with white ribs and trees inside.
function biodome(radius) {
  const g = new THREE.Group();
  const glass = mesh(
    new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    M.glass,
    { cast: false },
  );
  g.add(glass);
  const ribGeo = new THREE.TorusGeometry(radius, 0.18, 8, 48, Math.PI);
  for (let i = 0; i < 6; i++) {
    const rib = mesh(ribGeo, M.white);
    rib.rotation.y = (i / 6) * Math.PI;
    g.add(rib);
  }
  const ring = mesh(new THREE.TorusGeometry(radius, 0.35, 12, 64), M.white);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    const r = i === 0 ? 0 : radius * 0.5;
    const tree = simpleTree(2.5 + (i % 3));
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.add(tree);
  }
  return g;
}

export function simpleTree(height = 4) {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.28, height, 8), M.trunk);
  trunk.position.y = height / 2;
  g.add(trunk);
  const crown = mesh(new THREE.SphereGeometry(height * 0.42, 20, 14), M.leaf);
  crown.position.y = height;
  g.add(crown);
  return g;
}

// Central plaza: a glossy globe on a fountain.
function fountainGlobe() {
  const g = new THREE.Group();
  const basin = mesh(new THREE.CylinderGeometry(9, 9.5, 1.2, 64), M.white);
  basin.position.y = 0.6;
  g.add(basin);
  const water = mesh(new THREE.CylinderGeometry(8.4, 8.4, 0.2, 64), M.fountainWater, { cast: false });
  water.position.y = 1.15;
  g.add(water);
  const pedestal = mesh(new THREE.CylinderGeometry(1.2, 2, 4, 32), M.white);
  pedestal.position.y = 3;
  g.add(pedestal);
  const globe = mesh(new THREE.SphereGeometry(3.2, 48, 32), M.aqua);
  globe.position.y = 8;
  g.add(globe);
  // Green "continents": flattened blobs stuck onto the globe surface.
  const continents = new THREE.Group();
  continents.position.y = 8;
  const blobGeo = new THREE.SphereGeometry(1, 16, 12);
  const spots = [
    [0.4, 0.3, 1.3], [0.9, -0.2, 1.0], [2.2, 0.5, 1.4], [2.6, -0.4, 0.9],
    [3.9, 0.2, 1.2], [4.6, 0.7, 0.8], [5.4, -0.5, 1.1], [1.6, 0.9, 0.7],
  ];
  for (const [lon, lat, size] of spots) {
    const blob = mesh(blobGeo, M.leafLight, { cast: false });
    blob.position.setFromSphericalCoords(3.05, Math.PI / 2 - lat, lon);
    blob.lookAt(0, 0, 0);
    blob.scale.set(size, size * 0.7, 0.35);
    continents.add(blob);
  }
  g.add(continents);
  for (let i = 0; i < 2; i++) {
    const ring = mesh(new THREE.TorusGeometry(4.6 + i * 0.9, 0.12, 8, 80), M.silver);
    ring.position.y = 8;
    ring.rotation.set(Math.PI / 2 + 0.35 * (i ? -1 : 1), 0.3 * i, 0);
    g.add(ring);
  }
  g.userData.update = (t) => {
    globe.rotation.y = t * 0.2;
    continents.rotation.y = t * 0.2;
  };
  return g;
}

// Lawn rings and trees in round white planters so the plaza feels green.
function plazaGreens() {
  const g = new THREE.Group();
  const lawn = mesh(new THREE.RingGeometry(11, 15, 64), M.leaf, { cast: false });
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = 0.06;
  g.add(lawn);
  const planterGeo = new THREE.CylinderGeometry(1.6, 1.3, 1, 32);
  const soilGeo = new THREE.CylinderGeometry(1.45, 1.45, 0.1, 32);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const r = i % 2 ? 22 : 19;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const planter = mesh(planterGeo, M.white);
    planter.position.set(x, 0.5, z);
    g.add(planter);
    const soil = mesh(soilGeo, M.leaf);
    soil.position.set(x, 1.02, z);
    g.add(soil);
    const tree = simpleTree(3 + (i % 3) * 0.8);
    tree.position.set(x, 1, z);
    g.add(tree);
  }
  return g;
}

// Elevated monorail ring around the city, with a glossy capsule train.
function monorail(radius, height) {
  const g = new THREE.Group();
  const track = mesh(new THREE.TorusGeometry(radius, 0.5, 12, 160), M.white);
  track.rotation.x = Math.PI / 2;
  track.position.y = height;
  g.add(track);
  const pillarGeo = new THREE.CylinderGeometry(0.45, 0.7, height, 12);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const p = mesh(pillarGeo, M.white);
    p.position.set(Math.cos(a) * radius, height / 2, Math.sin(a) * radius);
    g.add(p);
  }
  const train = new THREE.Group();
  for (let c = 0; c < 3; c++) {
    const car = new THREE.Group();
    const body = mesh(new THREE.CapsuleGeometry(1.1, 4.2, 8, 20), M.white);
    body.rotation.z = Math.PI / 2;
    car.add(body);
    const windows = mesh(new THREE.CapsuleGeometry(1.12, 3.6, 8, 20), M.glassCore);
    windows.rotation.z = Math.PI / 2;
    windows.scale.set(0.55, 1, 1.01);
    windows.position.y = 0.35;
    car.add(windows);
    const stripe = mesh(new THREE.CylinderGeometry(1.13, 1.13, 0.4, 20), M.aqua);
    stripe.rotation.z = Math.PI / 2;
    stripe.position.x = 2.4;
    car.add(stripe);
    car.userData.offset = c * 0.105;
    train.add(car);
  }
  g.add(train);
  g.userData.update = (t) => {
    train.children.forEach((car) => {
      const a = t * 0.08 - car.userData.offset;
      car.position.set(Math.cos(a) * radius, height + 1.6, Math.sin(a) * radius);
      car.rotation.y = -a - Math.PI / 2;
    });
  };
  g.userData.update(0);
  return g;
}

// White pebble-shaped eco house with round windows and a grass roof.
function ecoPod(scale = 1) {
  const g = new THREE.Group();
  const shell = mesh(new THREE.SphereGeometry(3, 40, 24), M.white);
  shell.scale.set(1.4, 0.8, 1);
  shell.position.y = 1.2;
  g.add(shell);
  const roof = mesh(new THREE.SphereGeometry(3.05, 40, 16, 0, Math.PI * 2, 0, Math.PI / 4), M.leaf);
  roof.scale.set(1.4, 0.8, 1);
  roof.position.y = 1.25;
  g.add(roof);
  const winGeo = new THREE.SphereGeometry(0.75, 20, 14);
  for (let i = 0; i < 3; i++) {
    const w = mesh(winGeo, M.glassCore);
    w.scale.set(1, 1, 0.35);
    w.position.set(-2.2 + i * 2.2, 1.5, 2.65 - Math.abs(i - 1) * 0.35);
    g.add(w);
  }
  const door = mesh(new THREE.CapsuleGeometry(0.55, 1, 6, 16), M.aqua);
  door.scale.z = 0.4;
  door.position.set(3.65, 0.9, 0.6);
  door.rotation.y = Math.PI / 2;
  g.add(door);
  g.scale.setScalar(scale);
  return g;
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

export function createBuildings() {
  const group = new THREE.Group();
  group.name = 'buildings';
  const animated = [];
  const at = (obj, x, z, rotY = 0, y = null) => {
    obj.position.set(x, y ?? heightAt(x, z) - 0.05, z);
    obj.rotation.y = rotY;
    group.add(obj);
    if (obj.userData.update) animated.push(obj);
    return obj;
  };

  const cx = CITY.x;
  const cz = CITY.z;
  const base = CITY.height;
  at(fountainGlobe(), cx, cz, 0, base);
  at(plazaGreens(), cx, cz, 0, base);
  at(glassTower(46, 5.5), cx - 6, cz - 26, 0, base);
  at(capsuleTower(38, 4.2), cx + 18, cz - 16, 0, base);
  at(glassTower(30, 4.5), cx + 24, cz + 6, 0, base);
  at(twistTower(13, 11), cx - 24, cz - 8, 0.4, base);
  at(capsuleTower(26, 3.4), cx + 6, cz - 34, 0, base);
  at(glassTower(22, 3.6), cx - 20, cz + 18, 0, base);
  at(biodome(12), cx - 30, cz + 32);
  at(monorail(31, 12), cx, cz, 0, base);

  at(ecoPod(1), -14, 40, 0.5);
  at(ecoPod(0.85), 16, 30, -2.4);
  at(ecoPod(1.1), 15, 8, 1.2);
  at(ecoPod(0.9), 22, 54, -1.7);

  for (const [x, z] of TURBINES) {
    at(windTurbine(26), x, z, Math.atan2(-x, -z) * 0.2 + 0.4);
  }

  group.userData.update = (t) => {
    for (const a of animated) a.userData.update(t);
  };
  return group;
}
