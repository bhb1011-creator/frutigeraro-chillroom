import * as THREE from 'three';
import { CITY } from '../layout.js';
import { heightAt } from '../terrain.js';
import { createRng } from '../noise.js';
import { loadTexture } from '../assets.js';
import { buildTower, PODIUM_H } from './tower.js';
import { CM, mesh, box, circle, roundedRect, slab, prismWall, balustrade } from './parts.js';
import { pavingTextures } from './textures.js';
import { streetLamp, bench, trashBin, bollard, infoKiosk, treePlanter, fountainGlobe, biodome, solarArray, waterMaterial } from './props.js';
import { mergeStatic } from './merge.js';

// Lawn patches on the plaza (local coordinates); grass clumps are scattered on these.
export const LAWNS = [
  { x: 0, z: 0, r0: 11.5, r1: 15 },
  { x: -21, z: 12, r0: 0, r1: 6.5 },
  { x: 21, z: 12, r0: 0, r1: 6.5 },
  { x: -15, z: -20, r0: 0, r1: 5.5 },
  { x: 15, z: -20, r0: 0, r1: 5.5 },
];

export function onLawn(x, z) {
  const lx = x - CITY.x;
  const lz = z - CITY.z;
  return LAWNS.some((l) => {
    const d = Math.hypot(lx - l.x, lz - l.z);
    return d > l.r0 + 0.3 && d < l.r1 - 0.3;
  });
}

const MONORAIL_R = 74;
const MONORAIL_H = 17;

// ---------- Tower crowns ----------

function spireCrown({ group, topY }) {
  const ring = mesh(new THREE.CylinderGeometry(4.5, 6.5, 4, 48, 1, true), CM.tintedGlass, { cast: false });
  ring.position.y = topY + 2;
  const cap = mesh(new THREE.CylinderGeometry(2.2, 4.5, 2.5, 48), CM.white);
  cap.position.y = topY + 5.2;
  const spire = mesh(new THREE.ConeGeometry(0.6, 18, 24), CM.silver);
  spire.position.y = topY + 15.5;
  const orb = mesh(new THREE.SphereGeometry(1.1, 32, 24), CM.aquaGlow);
  orb.position.y = topY + 8;
  for (let i = 0; i < 3; i++) {
    const halo = mesh(new THREE.TorusGeometry(2.4 - i * 0.5, 0.08, 8, 64), CM.aquaGlow, { cast: false });
    halo.rotation.x = Math.PI / 2;
    halo.position.y = topY + 10 + i * 2.5;
    group.add(halo);
  }
  group.add(ring, cap, spire, orb);
}

function gardenCrown({ group, topY, roofOutline, plant, rng }) {
  group.add(mesh(slab(roofOutline.map(([x, z]) => [x * 0.88, z * 0.88]), topY - 0.6, 0.15), CM.lawn));
  const pav = mesh(new THREE.CylinderGeometry(3, 3.4, 3, 32), CM.tintedGlass, { cast: false });
  pav.position.y = topY + 0.9;
  const pavRoof = mesh(new THREE.CylinderGeometry(3.8, 3.6, 0.3, 32), CM.white);
  pavRoof.position.y = topY + 2.5;
  group.add(pav, pavRoof);
  for (const [x, z] of roofOutline.filter((_, i) => i % 5 === 0)) {
    plant(rng() < 0.5 ? 'oakSmall' : 'bush', new THREE.Vector3(x * 0.68, topY - 0.45, z * 0.68), rng() < 0.5 ? 0.35 : 0.6);
  }
}

function orbCrown({ group, topY }) {
  const dome = mesh(new THREE.SphereGeometry(6, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), CM.tintedGlass, { cast: false });
  dome.position.y = topY - 0.6;
  dome.scale.y = 0.6;
  const mast = mesh(new THREE.CylinderGeometry(0.18, 0.35, 12, 12), CM.silver);
  mast.position.y = topY + 7;
  const orb = mesh(new THREE.SphereGeometry(1.4, 32, 24), CM.aqua);
  orb.position.y = topY + 13.5;
  const orbGlow = mesh(new THREE.TorusGeometry(1.9, 0.07, 8, 48), CM.aquaGlow, { cast: false });
  orbGlow.rotation.x = Math.PI / 2;
  orbGlow.position.y = topY + 13.5;
  group.add(dome, mast, orb, orbGlow);
}

function solarCrown({ group, topY }) {
  const arr = solarArray(3, 4);
  arr.position.y = topY - 0.6;
  group.add(arr);
  const mast = mesh(new THREE.CylinderGeometry(0.1, 0.15, 6, 8), CM.silver);
  mast.position.set(3, topY + 2.4, -3);
  const light = mesh(new THREE.SphereGeometry(0.25, 12, 8), CM.aquaGlow);
  light.position.set(3, topY + 5.5, -3);
  group.add(mast, light);
}

// ---------- City ----------

export function createCity(trees) {
  const city = new THREE.Group();
  city.name = 'city';
  city.position.set(CITY.x, CITY.height, CITY.z);
  city.updateMatrixWorld(true);
  const rng = createRng(404);
  const animated = [];
  const toWorld = (x, y, z) => city.localToWorld(new THREE.Vector3(x, y, z));
  const plantLocal = (species, x, y, z, scale = 1) => {
    const w = toWorld(x, y, z);
    trees.add(species, w.x, w.y, w.z, { scale, rotation: rng() * Math.PI * 2 });
  };
  const put = (obj, x, z, rotY = 0, y = 0) => {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    city.add(obj);
    if (obj.userData.update) animated.push(obj);
    return obj;
  };
  const faceCenter = (x, z) => Math.atan2(-x, -z);

  // Paving with inlaid rings, a white curb and a stepped edge.
  const paving = pavingTextures();
  const pavMat = new THREE.MeshPhysicalMaterial({ map: paving.map, roughnessMap: paving.roughnessMap, clearcoat: 0.15, clearcoatRoughness: 0.35 });
  const plaza = mesh(new THREE.CircleGeometry(CITY.r, 160), pavMat, { cast: false });
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.04;
  plaza.geometry.attributes.uv.array.forEach((_, i, arr) => {
    arr[i] = (arr[i] - 0.5) * ((CITY.r * 2) / 9);
  });
  city.add(plaza);
  for (const r of [17, 31, 47]) {
    const ring = mesh(new THREE.RingGeometry(r - 0.12, r + 0.12, 160), CM.aqua, { cast: false });
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    city.add(ring);
  }
  city.add(mesh(prismWall(circle(CITY.r, 160), -0.6, 0.12), CM.white));
  const curbTop = mesh(new THREE.RingGeometry(CITY.r - 0.5, CITY.r, 160), CM.white, { cast: false });
  curbTop.rotation.x = -Math.PI / 2;
  curbTop.position.y = 0.12;
  city.add(curbTop);

  // Lawns with a white edge.
  const lawnTex = loadTexture('grasslight-big.jpg');
  const lawnMat = new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 0.9 });
  for (const l of LAWNS) {
    const geo = l.r0 > 0 ? new THREE.RingGeometry(l.r0, l.r1, 96) : new THREE.CircleGeometry(l.r1, 64);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 6, p.getZ(i) / 6);
    const lawn = mesh(geo, lawnMat, { cast: false });
    lawn.position.set(l.x, 0.14, l.z);
    city.add(lawn);
    for (const r of [l.r0, l.r1]) {
      if (!r) continue;
      const edge = mesh(new THREE.TorusGeometry(r, 0.12, 8, 96), CM.white);
      edge.rotation.x = Math.PI / 2;
      edge.position.set(l.x, 0.12, l.z);
      city.add(edge);
    }
  }
  for (const l of LAWNS.slice(1)) plantLocal(rng() < 0.5 ? 'oak' : 'ash', l.x, 0.1, l.z, 0.55);

  // Fountain.
  put(fountainGlobe(), 0, 0);

  // ---------- Towers ----------
  const towers = [
    {
      at: [0, -44],
      spec: {
        name: 'Aqua Tower',
        outline: circle(10, 72),
        floors: 21,
        facade: { hue: 198, seed: 3, lit: 0.22 },
        setbacks: [{ floor: 14, outline: circle(7.6, 72) }],
        fins: 1.7,
        crown: spireCrown,
      },
    },
    {
      at: [-41, -14],
      spec: {
        name: 'Wave Residences',
        outline: roundedRect(24, 15, 6.5, 10),
        floors: 14,
        facade: { hue: 186, seed: 7, lit: 0.35, cols: 10, rows: 5 },
        balconies: true,
        crown: gardenCrown,
      },
    },
    {
      at: [41, -14],
      spec: {
        name: 'Capsula',
        outline: roundedRect(15, 12, 5.9, 10),
        floors: 17,
        facade: { hue: 205, seed: 11, lit: 0.2 },
        fins: 1.4,
        crown: orbCrown,
      },
    },
    {
      at: [-40, 30],
      spec: {
        name: 'Terra Terraces',
        outline: roundedRect(22, 22, 4, 6),
        floors: 15,
        facade: { hue: 170, seed: 13, lit: 0.3 },
        setbacks: [
          { floor: 5, outline: roundedRect(18, 18, 3.5, 6) },
          { floor: 9, outline: roundedRect(14, 14, 3, 6) },
          { floor: 12, outline: roundedRect(10, 10, 2.5, 6) },
        ],
        crown: solarCrown,
      },
    },
    {
      at: [26, -40],
      spec: {
        name: 'Helix',
        outline: roundedRect(17, 12, 4, 8),
        floors: 19,
        facade: { hue: 210, seed: 17, lit: 0.25 },
        twist: 0.045,
        crown: solarCrown,
      },
    },
    {
      at: [-25, -40],
      spec: {
        name: 'Nimbus',
        outline: circle(7.4, 56),
        floors: 12,
        facade: { hue: 192, seed: 19, lit: 0.3 },
        fins: 1.2,
        crown: gardenCrown,
      },
    },
  ];
  for (const { at, spec } of towers) {
    const [x, z] = at;
    // Rotate so the local entrance (angle π/2 → +z) points at the fountain.
    const rotY = Math.atan2(-x, -z);
    spec.entrance = Math.PI / 2;
    const w = toWorld(x, 0, z);
    const t = buildTower(spec, { x: w.x - CITY.x, y: 0, z: w.z - CITY.z, rotY }, {
      add: (species, wx, wy, wz, opts) => trees.add(species, wx + CITY.x, wy + CITY.height, wz + CITY.z, opts),
    });
    city.add(t);
  }

  // Twin towers with sky bridges.
  const twins = [
    [34, 31],
    [48, 17],
  ];
  for (const [x, z] of twins) {
    const t = buildTower(
      {
        name: 'Twin Aero',
        outline: circle(6.2, 48),
        floors: 16,
        facade: { hue: 200, seed: 23 + x, lit: 0.28 },
        fins: 1.3,
        coreScale: 0.36,
        crown: orbCrown,
        entrance: Math.PI / 2,
      },
      { x, y: 0, z, rotY: Math.atan2(-x, -z) },
      { add: (species, wx, wy, wz, opts) => trees.add(species, wx + CITY.x, wy + CITY.height, wz + CITY.z, opts) },
    );
    city.add(t);
  }
  const [a, b] = twins.map(([x, z]) => new THREE.Vector3(x, 0, z));
  for (const h of [PODIUM_H + 22, PODIUM_H + 40]) {
    const mid = a.clone().lerp(b, 0.5).setY(h);
    const len = a.distanceTo(b) - 11;
    const bridge = new THREE.Group();
    bridge.position.copy(mid);
    bridge.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    const tube = mesh(new THREE.CylinderGeometry(1.8, 1.8, len, 32, 1, true), CM.tintedGlass, { cast: false });
    tube.rotation.x = Math.PI / 2;
    const floor = box(2.6, 0.25, len, CM.white);
    floor.position.y = -1.2;
    bridge.add(tube, floor);
    for (let i = 0; i <= 6; i++) {
      const rib = mesh(new THREE.TorusGeometry(1.85, 0.1, 8, 32), CM.white);
      rib.position.z = -len / 2 + (i / 6) * len;
      bridge.add(rib);
    }
    city.add(bridge);
  }

  // ---------- Boulevard from the south entrance to the fountain ----------
  for (let z = 20; z <= 58; z += 7.5) {
    for (const s of [-1, 1]) {
      put(streetLamp(), s * 6.5, z, s > 0 ? Math.PI : 0);
      const tp = put(treePlanter(1.3), s * 10, z + 3.7);
      plantLocal(rng() < 0.5 ? 'oak' : 'ash', s * 10, tp.userData.plantY, z + 3.7, 0.5);
      put(bench(), s * 7.6, z + 3.7, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  for (let x = -5; x <= 5; x += 2) put(bollard(), x, 60.5);
  put(infoKiosk('Willkommen in Aero City', 1), -3, 55, 0);
  put(infoKiosk('Plaza · Fontäne', 2), 14, 20, faceCenter(14, 20));
  put(infoKiosk('Wave Residences', 3), -26, 2, faceCenter(-26, 2));

  // Ring of lamps, benches and bins around the fountain lawn.
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + 0.13;
    const x = Math.cos(ang) * 19;
    const z = Math.sin(ang) * 19;
    if (i % 2) put(streetLamp(), x, z, Math.atan2(x, z) + Math.PI / 2);
    else put(bench(), x * 0.92, z * 0.92, faceCenter(x, z));
    if (i % 4 === 1) put(trashBin(), x * 0.92 + 1.4, z * 0.92);
  }
  // Planters with trees on the outer ring.
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const x = Math.cos(ang) * 27;
    const z = Math.sin(ang) * 27;
    if (z > 15 && Math.abs(x) < 12) continue;
    const tp = put(treePlanter(1.4), x, z);
    plantLocal(i % 3 ? 'ashSmall' : 'oakSmall', x, tp.userData.plantY, z, 0.42);
  }

  // Reflecting pools either side of the boulevard.
  const poolMat = waterMaterial(0x2ec8f2, 0.8);
  for (const s of [-1, 1]) {
    const outline = roundedRect(16, 4.5, 2.2, 8);
    const pool = new THREE.Group();
    pool.position.set(s * 22, 0, 30);
    pool.add(mesh(prismWall(outline, 0, 0.55), CM.white));
    pool.add(mesh(slab(outline, 0.55, 0.08), CM.white));
    pool.add(mesh(slab(outline.map(([x, z]) => [x * 0.93, z * 0.85]), 0.56, 0.08), CM.aqua));
    const water = mesh(slab(outline.map(([x, z]) => [x * 0.93, z * 0.85]), 0.6, 0.02), poolMat, { cast: false });
    pool.add(water);
    for (let k = -2; k <= 2; k++) {
      const jet = mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.4, 8), new THREE.MeshPhysicalMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.6, roughness: 0, emissive: 0x8fe8ff, emissiveIntensity: 0.3 }), { cast: false });
      jet.position.set(k * 2.8, 1.3, 0);
      pool.add(jet);
    }
    city.add(pool);
  }

  // ---------- Monorail ring around the city with a station on the south side ----------
  const track = mesh(new THREE.TorusGeometry(MONORAIL_R, 0.65, 14, 240), CM.white);
  track.rotation.x = Math.PI / 2;
  track.position.y = MONORAIL_H;
  city.add(track);
  const guide = mesh(new THREE.TorusGeometry(MONORAIL_R, 0.18, 8, 240), CM.aquaGlow, { cast: false });
  guide.rotation.x = Math.PI / 2;
  guide.position.y = MONORAIL_H + 0.62;
  city.add(guide);
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2;
    const x = Math.cos(ang) * MONORAIL_R;
    const z = Math.sin(ang) * MONORAIL_R;
    const w = toWorld(x, 0, z);
    const ground = heightAt(w.x, w.z) - CITY.height - 0.3;
    const h = MONORAIL_H - ground;
    const pillar = mesh(new THREE.CylinderGeometry(0.55, 0.9, h, 20), CM.white);
    pillar.position.set(x, ground + h / 2, z);
    city.add(pillar);
    const head = mesh(new THREE.CylinderGeometry(1.2, 0.55, 1.2, 20), CM.white);
    head.position.set(x, MONORAIL_H - 0.9, z);
    city.add(head);
  }
  const station = new THREE.Group();
  station.position.set(0, MONORAIL_H, MONORAIL_R);
  const platform = box(26, 0.5, 6, CM.white, 0.2);
  platform.position.set(0, -0.9, 4.2);
  const roof = mesh(new THREE.CylinderGeometry(5.5, 5.5, 28, 48, 1, true, -Math.PI / 2, Math.PI), CM.tintedGlass, { cast: false });
  roof.rotation.z = Math.PI / 2;
  roof.position.set(0, 0.5, 2);
  const roofEdge = box(28, 0.25, 0.3, CM.white);
  roofEdge.position.set(0, 0.6, 7.4);
  station.add(platform, roof, roofEdge);
  station.add(balustrade([[-13, 7.1], [13, 7.1]], -0.65, { closed: false }));
  const elevatorShaft = mesh(new THREE.CylinderGeometry(1.6, 1.6, MONORAIL_H, 32, 1, true), CM.tintedGlass, { cast: false });
  elevatorShaft.position.set(11, -MONORAIL_H / 2, 5);
  const cabin = box(2, 2.4, 2, CM.white, 0.3);
  cabin.position.set(11, -MONORAIL_H + 1.4, 5);
  station.add(elevatorShaft, cabin);
  city.add(station);

  // Train.
  const train = new THREE.Group();
  for (let c = 0; c < 4; c++) {
    const car = new THREE.Group();
    const body = mesh(new THREE.CapsuleGeometry(1.35, 5.2, 10, 28), CM.white);
    body.rotation.z = Math.PI / 2;
    const windows = mesh(new THREE.CapsuleGeometry(1.37, 4.6, 10, 28), CM.tintedGlass, { cast: false });
    windows.rotation.z = Math.PI / 2;
    windows.scale.set(0.5, 1, 1.01);
    windows.position.y = 0.45;
    const stripe = mesh(new THREE.CylinderGeometry(1.38, 1.38, 0.5, 28), CM.aqua);
    stripe.rotation.z = Math.PI / 2;
    stripe.position.x = 2.9;
    const skirt = box(6.2, 0.5, 2.2, CM.silver, 0.2);
    skirt.position.y = -1.2;
    car.add(body, windows, stripe, skirt);
    car.userData.offset = c * 0.105;
    train.add(car);
  }
  city.add(train);
  const trainUpdate = (t) => {
    train.children.forEach((car) => {
      const ang = t * 0.05 - car.userData.offset - 0.4;
      car.position.set(Math.cos(ang) * MONORAIL_R, MONORAIL_H + 2.2, Math.sin(ang) * MONORAIL_R);
      car.rotation.y = -ang - Math.PI / 2;
    });
  };
  trainUpdate(0);

  // Biodome just outside the plaza.
  const domeLocal = [-58, 46];
  const domeWorld = toWorld(domeLocal[0], 0, domeLocal[1]);
  const dome = biodome(13, (species, v, scale) => {
    trees.add(species, domeWorld.x + v.x, heightAt(domeWorld.x, domeWorld.z) + 0.1, domeWorld.z + v.z, { scale });
  });
  dome.position.set(domeLocal[0], heightAt(domeWorld.x, domeWorld.z) - CITY.height, domeLocal[1]);
  city.add(dome);

  // Bake all static geometry into a few big meshes; keep the animated parts separate.
  city.userData.dynamic = [train, ...animated.flatMap((o) => o.userData.dynamic ?? [])];
  mergeStatic(city);

  city.userData.update = (t) => {
    for (const a of animated) a.userData.update(t);
    trainUpdate(t);
  };
  return city;
}
