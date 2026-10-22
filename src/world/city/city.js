import * as THREE from 'three';
import { CLUSTER, TOWER_SITES, SPAWN } from '../layout.js';
import { heightAt, CLUSTER_Y } from '../terrain.js';
import { buildTower, PODIUM_H } from './tower.js';
import { CM, mesh, box, circle, roundedRect, slab } from './parts.js';
import { mergeStatic } from './merge.js';
import { arenaCrown, duelTerminal } from './arena.js';

// ---------- Tower crowns (s scales them up for the giants) ----------

function spireCrown({ group, topY }, s = 1) {
  const ring = mesh(new THREE.CylinderGeometry(4.5 * s, 6.5 * s, 4 * s, 48, 1, true), CM.tintedGlass, { cast: false });
  ring.position.y = topY + 2 * s;
  const cap = mesh(new THREE.CylinderGeometry(2.2 * s, 4.5 * s, 2.5 * s, 48), CM.white);
  cap.position.y = topY + 5.2 * s;
  const spire = mesh(new THREE.ConeGeometry(0.6 * s, 18 * s, 24), CM.silver);
  spire.position.y = topY + 15.5 * s;
  const orb = mesh(new THREE.SphereGeometry(1.1 * s, 32, 24), CM.aquaGlow);
  orb.position.y = topY + 8 * s;
  for (let i = 0; i < 3; i++) {
    const halo = mesh(new THREE.TorusGeometry((2.4 - i * 0.5) * s, 0.08 * s, 8, 64), CM.aquaGlow, { cast: false });
    halo.rotation.x = Math.PI / 2;
    halo.position.y = topY + (10 + i * 2.5) * s;
    group.add(halo);
  }
  group.add(ring, cap, spire, orb);
}

function gardenCrown({ group, topY, roofOutline }) {
  group.add(mesh(slab(roofOutline.map(([x, z]) => [x * 0.88, z * 0.88]), topY - 0.6, 0.15), CM.lawn));
  const pav = mesh(new THREE.CylinderGeometry(3, 3.4, 3, 32), CM.tintedGlass, { cast: false });
  pav.position.y = topY + 0.9;
  const pavRoof = mesh(new THREE.CylinderGeometry(3.8, 3.6, 0.3, 32), CM.white);
  pavRoof.position.y = topY + 2.5;
  group.add(pav, pavRoof);
}

function orbCrown({ group, topY }, s = 1) {
  const dome = mesh(new THREE.SphereGeometry(6 * s, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), CM.tintedGlass, { cast: false });
  dome.position.y = topY - 0.6;
  dome.scale.y = 0.6;
  const mast = mesh(new THREE.CylinderGeometry(0.18 * s, 0.35 * s, 12 * s, 12), CM.silver);
  mast.position.y = topY + 7 * s;
  const orb = mesh(new THREE.SphereGeometry(1.4 * s, 32, 24), CM.aqua);
  orb.position.y = topY + 13.5 * s;
  const orbGlow = mesh(new THREE.TorusGeometry(1.9 * s, 0.07 * s, 8, 48), CM.aquaGlow, { cast: false });
  orbGlow.rotation.x = Math.PI / 2;
  orbGlow.position.y = topY + 13.5 * s;
  group.add(dome, mast, orb, orbGlow);
}

function solarCrown({ group, topY }) {
  const panel = box(1.6, 0.06, 1.0, CM.solar, 0.02);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const p = panel.clone();
      p.position.set((c - 1.5) * 1.8, topY, (r - 1) * 1.6);
      p.rotation.x = -0.35;
      group.add(p);
    }
  }
  const mast = mesh(new THREE.CylinderGeometry(0.1, 0.15, 6, 8), CM.silver);
  mast.position.set(3, topY + 2.4, -3);
  const light = mesh(new THREE.SphereGeometry(0.25, 12, 8), CM.aquaGlow);
  light.position.set(3, topY + 5.5, -3);
  group.add(mast, light);
}

// ---------- The walkable cluster ----------

// Mirror-like glass with almost no lit offices: they read as dream objects, not a working city.
const CLUSTER_TOWERS = {
  aqua: {
    name: 'Aqua Tower',
    outline: circle(10, 72),
    floors: 21,
    facade: { hue: 198, seed: 3, lit: 0.04 },
    setbacks: [{ floor: 14, outline: circle(7.6, 72) }],
    fins: 1.7,
    crown: spireCrown,
  },
  wave: {
    name: 'Wave Residences',
    outline: roundedRect(24, 15, 6.5, 10),
    floors: 14,
    facade: { hue: 186, seed: 7, lit: 0.04, cols: 10, rows: 5 },
    balconies: true,
    crown: gardenCrown,
  },
  capsula: {
    name: 'Capsula',
    outline: roundedRect(15, 12, 5.9, 10),
    floors: 17,
    facade: { hue: 205, seed: 11, lit: 0.03 },
    fins: 1.4,
    crown: orbCrown,
  },
  terraces: {
    name: 'Terra Terraces',
    outline: roundedRect(22, 22, 4, 6),
    floors: 15,
    facade: { hue: 170, seed: 13, lit: 0.04 },
    setbacks: [
      { floor: 5, outline: roundedRect(18, 18, 3.5, 6) },
      { floor: 9, outline: roundedRect(14, 14, 3, 6) },
      { floor: 12, outline: roundedRect(10, 10, 2.5, 6) },
    ],
    crown: solarCrown,
  },
  helix: {
    name: 'Helix',
    outline: roundedRect(17, 12, 4, 8),
    floors: 19,
    facade: { hue: 210, seed: 17, lit: 0.03 },
    twist: 0.045,
    crown: solarCrown,
  },
  nimbus: {
    name: 'Nimbus',
    outline: circle(7.4, 56),
    floors: 12,
    facade: { hue: 192, seed: 19, lit: 0.04 },
    fins: 1.2,
    crown: gardenCrown,
  },
  twinA: { name: 'Twin Aero', outline: circle(6.2, 48), floors: 16, facade: { hue: 200, seed: 57, lit: 0.03 }, fins: 1.3, coreScale: 0.36, crown: orbCrown },
  twinB: { name: 'Twin Aero', outline: circle(6.2, 48), floors: 16, facade: { hue: 200, seed: 71, lit: 0.03 }, fins: 1.3, coreScale: 0.36, crown: orbCrown },
  // The duel tower: only the podium comes from the generator; arenaCrown builds the sculpted shaft on top.
  arena: { name: 'Aero-Duell', outline: circle(11, 80), floors: 0, facade: { hue: 178, seed: 41, lit: 0.03 }, openRoof: true, crown: arenaCrown },
};

// ---------- Skyline on the horizon ----------
// A far-away city of giant towers, all standing together. Seen from the meadow it sits to the left
// of the walkable cluster. Their feet are sunk below the hills, so the skyline only rises from
// behind the horizon and can never be reached.
const SKYLINE_CENTER = new THREE.Vector2(-380, -1500);
// u runs across the line of sight (left/right), v along it (front/back), in metres.
const g = (spec) => ({ floorH: 6.75, panelW: 2.6, ...spec });
const SKYLINE = [
  [0, 0, g({ outline: circle(26, 96), floors: 62, facade: { hue: 196, seed: 101, lit: 0 }, setbacks: [{ floor: 44, outline: circle(19, 96) }, { floor: 54, outline: circle(12, 96) }], fins: 3.2, crown: (c) => spireCrown(c, 4) })],
  [0, 130, g({ outline: circle(18, 72), floors: 56, facade: { hue: 204, seed: 103, lit: 0 }, fins: 2.8, crown: (c) => spireCrown(c, 3.5) })],
  [-75, 45, g({ outline: roundedRect(44, 30, 10, 10), floors: 48, facade: { hue: 208, seed: 105, lit: 0 }, twist: 0.03, crown: (c) => orbCrown(c, 3) })],
  [78, 35, g({ outline: circle(20, 80), floors: 52, facade: { hue: 190, seed: 107, lit: 0 }, fins: 3, crown: (c) => spireCrown(c, 3) })],
  [-115, 105, g({ outline: circle(22, 80), floors: 50, facade: { hue: 198, seed: 109, lit: 0 }, setbacks: [{ floor: 38, outline: circle(16, 80) }], crown: (c) => spireCrown(c, 3) })],
  [120, 110, g({ outline: roundedRect(40, 30, 12, 12), floors: 44, facade: { hue: 176, seed: 111, lit: 0 }, twist: 0.025, crown: (c) => orbCrown(c, 3) })],
  [-145, -15, g({ outline: circle(16, 64), floors: 38, facade: { hue: 186, seed: 113, lit: 0 }, fins: 2.6, crown: (c) => orbCrown(c, 2.5) })],
  [145, -10, g({ outline: roundedRect(36, 28, 12, 10), floors: 40, facade: { hue: 200, seed: 115, lit: 0 }, fins: 3, crown: (c) => orbCrown(c, 2.6) })],
  [-35, -75, g({ outline: circle(14, 64), floors: 32, facade: { hue: 172, seed: 117, lit: 0 }, fins: 2.4, crown: (c) => spireCrown(c, 2.4) })],
  [40, -85, g({ outline: roundedRect(30, 22, 8, 8), floors: 28, facade: { hue: 206, seed: 119, lit: 0 }, crown: (c) => orbCrown(c, 2.4) })],
  [-210, 35, g({ outline: circle(18, 64), floors: 30, facade: { hue: 194, seed: 121, lit: 0 }, fins: 2.6, crown: (c) => orbCrown(c, 2.6) })],
  [212, 45, g({ outline: circle(15, 64), floors: 34, facade: { hue: 184, seed: 123, lit: 0 }, fins: 2.4, crown: (c) => spireCrown(c, 2.4) })],
  [-185, -70, g({ outline: circle(12, 56), floors: 22, facade: { hue: 202, seed: 125, lit: 0 }, crown: (c) => orbCrown(c, 2) })],
  [188, -60, g({ outline: circle(12, 56), floors: 24, facade: { hue: 192, seed: 127, lit: 0 }, fins: 2.2, crown: (c) => spireCrown(c, 2) })],
  [-270, -5, g({ outline: roundedRect(30, 24, 10, 8), floors: 24, facade: { hue: 180, seed: 129, lit: 0 }, crown: (c) => orbCrown(c, 2) })],
  [272, 5, g({ outline: circle(14, 56), floors: 26, facade: { hue: 198, seed: 131, lit: 0 }, fins: 2.2, crown: (c) => spireCrown(c, 2) })],
];

// World-space walls, floors and stair ramps of the walkable towers, for the player physics.
function clusterColliders(cluster) {
  const out = { floors: [], ramps: [], walls: [], circles: [] };
  const v = new THREE.Vector3();
  for (const t of cluster.children) {
    const c = t.userData.collision;
    if (!c?.podium) continue;
    const m = t.matrixWorld;
    const base = m.elements[13];
    const w = ([x, z]) => {
      v.set(x, 0, z).applyMatrix4(m);
      return [v.x, v.z];
    };
    const loop = (pts, y0, y1, skip = () => false) => {
      pts.forEach((p, i) => {
        if (skip(i)) return;
        const [ax, az] = w(p);
        const [bx, bz] = w(pts[(i + 1) % pts.length]);
        out.walls.push({ ax, az, bx, bz, y0, y1 });
      });
    };
    const p = c.podium;
    const outline = c.outline.map(w);
    // Outer glass walls; door segments only block above the door head.
    loop(c.outline, base - 1, base + c.topY, (i) => p.door[i]);
    loop(c.outline, base + 3.4, base + c.topY, (i) => !p.door[i]);
    loop(p.core, base, base + p.ceiling);
    loop(p.room, base + p.first, base + p.first + 2.9);
    for (const col of p.columns) out.circles.push({ x: w(col)[0], z: w(col)[1], r: 0.32, y0: base, y1: base + p.ceiling });
    for (const col of p.canopyColumns) out.circles.push({ x: w(col)[0], z: w(col)[1], r: 0.15, y0: base, y1: base + 4 });
    out.floors.push({ outline, y: base + p.ground });
    out.floors.push({ outline, holes: p.hole ? [p.hole.map(w)] : [], y: base + p.first });
    if (p.stairs) {
      const [x, z] = w([p.stairs.x, p.stairs.z]);
      const d = new THREE.Vector3(p.stairs.dx, 0, p.stairs.dz).transformDirection(m);
      out.ramps.push({ x, z, dx: d.x, dz: d.z, run: p.stairs.run, width: p.stairs.width, y0: base + p.ground, y1: base + p.first });
      // Railing around the stair void on three sides; the top of the stair stays open.
      const h = p.hole;
      loop([h[3], h[0], h[1], h[2]], base + p.first, base + p.first + 1.05, (i) => i === 3);
    }
  }
  return out;
}

export function createCity() {
  const city = new THREE.Group();
  city.name = 'city';

  // The walkable cluster on its levelled meadow; entrances face the middle of the group.
  const cluster = new THREE.Group();
  cluster.position.set(CLUSTER.x, CLUSTER_Y, CLUSTER.z);
  city.add(cluster);
  for (const [key, spec] of Object.entries(CLUSTER_TOWERS)) {
    const site = TOWER_SITES[key];
    const x = site.x - CLUSTER.x;
    const z = site.z - CLUSTER.z;
    spec.entrance = Math.PI / 2;
    // Entrances face the middle of the cluster; the duel tower's faces the meadow and the spawn.
    const rotY = key === 'arena' ? Math.atan2(SPAWN.x - site.x, SPAWN.z - site.z) : Math.atan2(-x, -z);
    const tower = buildTower(spec, { x, y: 0, z, rotY }, null);
    cluster.add(tower);
    if (key === 'arena') {
      // Duel terminal in the lobby, a few metres inside the door.
      const terminal = duelTerminal();
      terminal.position.set(0, 0.15, 7.4);
      tower.add(terminal);
      tower.userData.terminal = terminal;
    }
  }

  // Glass sky bridges between the twins.
  const [a, b] = [TOWER_SITES.twinA, TOWER_SITES.twinB].map((s) => new THREE.Vector3(s.x - CLUSTER.x, 0, s.z - CLUSTER.z));
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
    cluster.add(bridge);
  }
  cluster.updateMatrixWorld(true);
  city.userData.colliders = clusterColliders(cluster);
  mergeStatic(cluster);

  // The skyline: no interiors, built straight up from well below the ground.
  const giants = new THREE.Group();
  giants.name = 'skyline';
  city.add(giants);
  const toCenter = SKYLINE_CENTER.clone().sub(new THREE.Vector2(SPAWN.x, SPAWN.z)).normalize();
  const across = new THREE.Vector2(-toCenter.y, toCenter.x);
  for (const [u, v, spec] of SKYLINE) {
    const x = SKYLINE_CENTER.x + across.x * u + toCenter.x * v;
    const z = SKYLINE_CENTER.y + across.y * u + toCenter.y * v;
    const t = buildTower({ ...spec, podium: false }, { x, y: heightAt(x, z) - 45, z, rotY: Math.atan2(SPAWN.x - x, SPAWN.z - z) }, null);
    t.traverse((o) => {
      o.castShadow = false;
    });
    giants.add(t);
  }
  mergeStatic(giants);
  return city;
}
