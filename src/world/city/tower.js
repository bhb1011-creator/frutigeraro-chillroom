import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CM,
  facadeMaterial,
  screenMaterial,
  prismWall,
  slab,
  mesh,
  box,
  offsetOutline,
  scaleOutline,
  radiusAt,
  sofa,
  coffeeTable,
  chair,
  desk,
  planter,
  receptionDesk,
  elevatorBank,
  stairs,
  balustrade,
} from './parts.js';
import { createRng } from '../noise.js';

const GROUND_H = 4.8; // ground floor (lobby) height
const SLAB_T = 0.4;
export const PODIUM_H = 9.2; // lobby + first floor

function angleOf([x, z]) {
  return Math.atan2(z, x);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function polar(a, r, y = 0) {
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}

function lookAtXZ(obj, target) {
  obj.rotation.y = Math.atan2(target.x - obj.position.x, target.z - obj.position.z);
}

/** Points spaced roughly `step` meters along a closed outline. */
function pointsAlong(points, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = carry;
    while (t < len) {
      out.push([a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len, Math.atan2(b[1] - a[1], b[0] - a[0])]);
      t += step;
    }
    carry = t - len;
  }
  return out;
}

function instanced(geo, mat, matrices, { cast = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = cast;
  im.receiveShadow = true;
  return im;
}

/**
 * Builds one skyscraper. spec:
 *  outline        closed [x, z] loop of the tower footprint (local, centered)
 *  floors         number of office floors above the podium
 *  floorH         office floor height
 *  facade         options for facadeTextures (hue, seed, cols, rows, lit)
 *  entrance       angle (radians, local) of the main door
 *  setbacks       [{ floor, outline }] narrower outlines from a given floor upward
 *  fins           vertical fin spacing in meters (0 = none)
 *  balconies      true → undulating balconies with glass rails on every floor
 *  twist          radians of rotation per floor (rebuilds the outline per floor)
 *  crown(ctx)     custom roof decoration
 *  name           sign text over the entrance
 */
export function buildTower(spec, place, trees) {
  const group = new THREE.Group();
  group.name = spec.name ?? 'tower';
  group.position.set(place.x, place.y, place.z);
  group.rotation.y = place.rotY ?? 0;
  group.updateMatrixWorld(true);
  const rng = createRng(spec.facade?.seed ?? 1);
  // Without a tree field there are no plants (and no empty planters).
  const plant = trees
    ? (species, local, scale = 1) => {
        const w = group.localToWorld(local.clone());
        trees.add(species, w.x, w.y, w.z, { scale, rotation: rng() * Math.PI * 2 });
      }
    : null;

  const outline = spec.outline;
  const floorH = spec.floorH ?? 3.6;
  const facade = facadeMaterial({ cols: 12, rows: 6, ...spec.facade });
  const panelW = spec.panelW ?? 1.7;
  const ctx = { group, outline, plant, rng, spec };

  // Towers without a podium (unreachable background giants) start their facade at the ground.
  const base = spec.podium === false ? 0 : PODIUM_H;
  if (spec.podium === false) group.add(mesh(prismWall(offsetOutline(outline, 0.1), -12, 0.4), CM.white));
  const podium = spec.podium === false ? null : buildPodium(ctx);

  // ---------- Office floors ----------
  const bands = [];
  const finMatrices = [];
  const extras = [];
  let current = outline;
  const setbacks = [...(spec.setbacks ?? [])].sort((a, b) => a.floor - b.floor);
  const segments = [];
  let start = 0;
  for (const sb of setbacks) {
    segments.push({ from: start, to: sb.floor, outline: current });
    current = sb.outline;
    start = sb.floor;
  }
  segments.push({ from: start, to: spec.floors, outline: current });

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const y0 = base + seg.from * floorH;
    const y1 = base + seg.to * floorH;
    if (spec.twist) {
      for (let f = seg.from; f < seg.to; f++) {
        const ol = rotateOutline(seg.outline, f * spec.twist);
        const fy = base + f * floorH;
        extras.push(mesh(prismWall(ol, fy, fy + floorH, { uScale: panelW * 12, vScale: floorH * 6 }), facade));
        bands.push(prismWall(offsetOutline(ol, 0.25), fy - 0.05, fy + 0.35));
        bands.push(slab(offsetOutline(ol, 0.25), fy - 0.05, 0.05));
      }
    } else {
      extras.push(mesh(prismWall(seg.outline, y0, y1, { uScale: panelW * 12, vScale: floorH * 6 }), facade));
      for (let f = seg.from; f <= seg.to; f++) {
        const fy = base + f * floorH;
        bands.push(prismWall(offsetOutline(seg.outline, 0.12), fy - 0.12, fy + 0.22));
      }
    }
    if (spec.fins) {
      for (const [x, z, dir] of pointsAlong(offsetOutline(seg.outline, 0.22), spec.fins)) {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, (y0 + y1) / 2, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dir),
          new THREE.Vector3(1, y1 - y0, 1),
        );
        finMatrices.push(m);
      }
    }
    if (spec.balconies) {
      for (let f = seg.from + 1; f < seg.to; f++) {
        const fy = base + f * floorH;
        const ol = seg.outline.map((p) => {
          const a = angleOf(p);
          const d = 0.5 + 0.85 * (0.5 + 0.5 * Math.sin(f * 0.55 + a * 2));
          const r = Math.hypot(p[0], p[1]);
          return [p[0] * (1 + d / r), p[1] * (1 + d / r)];
        });
        bands.push(slab(ol, fy - 0.15, 0.25));
        extras.push(balustrade(ol, fy + 0.1, { height: 1.0 }));
      }
    }
    // Setback terrace: lawn, bushes and a glass rail on the lower block's roof.
    if (si < segments.length - 1) {
      const next = segments[si + 1].outline;
      bands.push(slab(seg.outline, y1, 0.3));
      extras.push(mesh(slab(offsetOutline(seg.outline, -0.6), y1 + 0.3, 0.12), CM.lawn));
      extras.push(balustrade(offsetOutline(seg.outline, -0.15), y1 + 0.3));
      for (const [x, z] of plant ? pointsAlong(offsetOutline(seg.outline, -1.6), 4.5) : []) {
        const inner = radiusAt(next, Math.atan2(z, x));
        if (Math.hypot(x, z) < inner + 0.8) continue;
        plant(rng() < 0.6 ? 'bush' : 'bush2', new THREE.Vector3(x, y1 + 0.42, z), 0.45 + rng() * 0.25);
      }
    }
  }
  const topOutline = segments[segments.length - 1].outline;
  const topY = base + spec.floors * floorH;

  if (bands.length) group.add(mesh(mergeGeometries(bands.map(clean)), CM.white));
  for (const e of extras) group.add(e);
  if (finMatrices.length) {
    const finGeo = new THREE.BoxGeometry(0.16, 1, 0.55);
    group.add(instanced(finGeo, CM.white, finMatrices));
  }

  // ---------- Roof ----------
  const roofOutline = spec.twist ? rotateOutline(topOutline, spec.floors * spec.twist) : topOutline;
  // openRoof: the crown builds its own roof (the duel tower's pool deck).
  if (!spec.openRoof) {
    group.add(mesh(slab(offsetOutline(roofOutline, 0.3), topY, 0.6, { bevel: 0.1 }), CM.white));
    group.add(balustrade(offsetOutline(roofOutline, 0.15), topY + 0.7));
  }
  if (spec.crown) spec.crown({ ...ctx, topY: topY + 0.7, roofOutline });
  // Tower-local collision data; city.js turns it into world-space walls and floors for the player.
  group.userData.collision = { outline, podium, topY: topY + 0.7 };
  return group;
}

function rotateOutline(points, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return points.map(([x, z]) => [x * c - z * s, x * s + z * c]);
}

// Keep only position/normal/uv and drop indices so mixed geometries merge cleanly.
export function clean(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// ---------- Lobby + first floor ----------

function buildPodium({ group, outline, plant, rng, spec }) {
  const entrance = spec.entrance ?? Math.PI / 2;
  const R = radiusAt(outline, entrance);
  const minR = Math.min(...outline.map((p) => Math.hypot(p[0], p[1])));
  const doorHalf = 2.3 / R;
  const isDoor = (i) => {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    return Math.abs(angleDiff(angleOf([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), entrance)) < doorHalf;
  };

  // Floors and the slab between lobby and first floor.
  group.add(mesh(slab(outline, 0, 0.15, { uvScale: 6 }), CM.marble));
  // Plinth reaches below ground so uneven terrain never shows a gap.
  group.add(mesh(prismWall(offsetOutline(outline, 0.06), -3, 0.3), CM.white));

  // Stair void in the first-floor slab.
  const stairRun = 8;
  const stairW = 1.8;
  const hasStairs = minR > 7;
  const stairAngle = entrance + Math.PI * 0.62;
  const stairR = minR * 0.62;
  const stairCenter = polar(stairAngle, stairR);
  const stairDir = new THREE.Vector3(-Math.sin(stairAngle), 0, Math.cos(stairAngle));
  const stairStart = stairCenter.clone().addScaledVector(stairDir, -stairRun / 2);
  const side = new THREE.Vector3(stairDir.z, 0, -stairDir.x);
  const hole = [];
  if (hasStairs) {
    for (const [s, t] of [[-1, 0.15], [1, 0.15], [1, 1], [-1, 1]]) {
      const p = stairStart.clone().addScaledVector(stairDir, t * stairRun + (t === 1 ? 0.2 : 0)).addScaledVector(side, s * (stairW / 2 + 0.25));
      hole.push([p.x, p.z]);
    }
  }
  group.add(mesh(slab(outline, GROUND_H, SLAB_T, { holes: hasStairs ? [hole] : [], uvScale: 6 }), CM.marble));
  group.add(mesh(prismWall(offsetOutline(outline, 0.03), GROUND_H - 0.02, GROUND_H + SLAB_T + 0.02), CM.white));

  // Glass skin: door gap on the ground floor, continuous above.
  group.add(mesh(prismWall(outline, 0.15, 3.4, { skip: isDoor }), CM.clearGlass, { cast: false }));
  group.add(mesh(prismWall(outline, 3.4, GROUND_H, {}), CM.clearGlass, { cast: false }));
  group.add(mesh(prismWall(outline, GROUND_H + SLAB_T, PODIUM_H, {}), CM.clearGlass, { cast: false }));
  // Door head beam and the two open sliding leaves.
  const doorPts = outline.filter((_, i) => isDoor(i));
  group.add(mesh(prismWall(offsetOutline(outline, 0.04), 3.3, 3.45, { skip: (i) => !isDoor(i) }), CM.silver));
  if (doorPts.length) {
    const d0 = polar(entrance - doorHalf * 1.05, R - 0.25);
    const d1 = polar(entrance + doorHalf * 1.05, R - 0.25);
    for (const p of [d0, d1]) {
      const leaf = box(1.3, 3.1, 0.05, CM.tintedGlass);
      leaf.position.set(p.x, 1.7, p.z);
      leaf.rotation.y = -entrance + Math.PI / 2;
      group.add(leaf);
      const frame = box(1.34, 0.08, 0.08, CM.silver);
      frame.position.set(p.x, 0.2, p.z);
      frame.rotation.y = leaf.rotation.y;
      group.add(frame);
    }
  }

  // Mullion posts around the podium.
  const posts = [];
  for (const [x, z, dir] of pointsAlong(offsetOutline(outline, 0.05), 2.4)) {
    if (Math.abs(angleDiff(Math.atan2(z, x), entrance)) < doorHalf * 1.1) {
      // Posts only above the door opening.
      posts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, (3.45 + PODIUM_H) / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dir), new THREE.Vector3(1, PODIUM_H - 3.45, 1)));
      continue;
    }
    posts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, PODIUM_H / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dir), new THREE.Vector3(1, PODIUM_H, 1)));
  }
  group.add(instanced(new THREE.BoxGeometry(0.1, 1, 0.14), CM.white, posts));

  // Overhanging canopy slab above the podium with a glowing underside ring.
  group.add(mesh(slab(offsetOutline(outline, 1.4), PODIUM_H, 0.5, { bevel: 0.08 }), CM.white));
  group.add(mesh(prismWall(offsetOutline(outline, 1.25), PODIUM_H - 0.06, PODIUM_H - 0.01, {}), CM.aquaGlow, { cast: false }));

  // Entrance canopy on two slim columns.
  const ent = polar(entrance, R);
  const canopy = new THREE.Group();
  canopy.position.copy(ent);
  canopy.rotation.y = -entrance + Math.PI / 2;
  const roof = box(6.4, 0.22, 3.6, CM.white, 0.1);
  roof.position.set(0, 4.1, 1.7);
  const glow = mesh(new THREE.PlaneGeometry(5.8, 3.0), CM.lightPanel, { cast: false });
  glow.rotation.x = Math.PI / 2;
  glow.position.set(0, 3.98, 1.7);
  canopy.add(roof, glow);
  for (const s of [-1, 1]) {
    const col = mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.0, 12), CM.silver);
    col.position.set(s * 2.9, 2.0, 3.25);
    canopy.add(col);
  }
  group.add(canopy);

  // True when a spot is too close to the staircase (and the void above it on the first floor).
  const nearStairs = (pt, margin) => hasStairs && distToSegment(pt, stairStart, stairDir, stairRun) < stairW / 2 + margin;

  // ---------- Placement: nothing may stand in a wall, the core, the stairs or another piece ----------
  const coreOutline = scaleOutline(outline, spec.coreScale ?? 0.3);
  const coreR = radiusAt(coreOutline, entrance);
  const ff = GROUND_H + SLAB_T;
  // Furniture footprints for the player physics: { x, z, r, level } with level 'ground' or 'first'.
  const obstacles = [];
  // Everything that takes up floor space, also things the player physics handles otherwise
  // (columns, the space in front of doors and lifts). level 'both' counts on both floors.
  const occupied = (spec.reserve ?? []).map(([x, z, r]) => ({ x, z, r, level: 'ground' }));
  const reserve = (x, z, r, level) => occupied.push({ x, z, r, level });
  const spotFree = ([x, z], r, level) =>
    insidePolygon(outline, x, z) &&
    polygonDistance(outline, x, z) > r + 0.3 &&
    !insidePolygon(coreOutline, x, z) &&
    polygonDistance(coreOutline, x, z) > r + 0.3 &&
    !nearStairs(new THREE.Vector3(x, 0, z), r + 0.45) &&
    occupied.every((o) => (o.level !== level && o.level !== 'both') || Math.hypot(o.x - x, o.z - z) > o.r + r + 0.12);
  // Footprint of an object (circles at local points) in podium coordinates.
  const footprint = (obj, points) => {
    obj.updateMatrix();
    return points.map(([x, z]) => {
      const v = new THREE.Vector3(x, 0, z).applyMatrix4(obj.matrix);
      return [v.x, v.z];
    });
  };
  const fits = (obj, level, points, r) => footprint(obj, points).every((p) => spotFree(p, r, level));
  const commit = (obj, level, points, r) => {
    for (const [x, z] of footprint(obj, points)) {
      obstacles.push({ x, z, r, level });
      reserve(x, z, r, level);
    }
    group.add(obj);
  };
  const place = (obj, level, points, r) => {
    if (!fits(obj, level, points, r)) return false;
    commit(obj, level, points, r);
    return true;
  };

  // ---------- Core and lifts ----------
  group.add(mesh(prismWall(coreOutline, 0.15, PODIUM_H, {}), CM.offWhite));
  // The lifts sit in a flat white portal that stands just proud of the (often curved) core, so
  // the doors never cut into the wall. It runs through both floors.
  let lifts = minR > 7 ? 3 : 2;
  const liftWidth = (n) => n * 2.1 + 0.6;
  while (lifts > 1 && liftWidth(lifts) / 2 > coreR * 1.05) lifts--;
  const portalW = liftWidth(lifts);
  const portalD = faceDistance(coreOutline, entrance, portalW / 2) + 0.06;
  const portal = box(portalW, PODIUM_H - 0.15, portalD, CM.offWhite);
  portal.position.copy(polar(entrance, portalD / 2, 0.15 + (PODIUM_H - 0.15) / 2));
  portal.rotation.y = -entrance + Math.PI / 2;
  group.add(portal);
  const portalCorners = [[-portalW / 2, -portalD / 2], [portalW / 2, -portalD / 2], [portalW / 2, portalD / 2], [-portalW / 2, portalD / 2]];
  const portalOutline = footprint(portal, portalCorners);
  for (const [y, n] of [[0.15, lifts], [ff, Math.min(lifts, 2)]]) {
    const bank = elevatorBank(n, 1.5);
    bank.position.copy(polar(entrance, portalD + 0.005, y));
    bank.rotation.y = portal.rotation.y;
    group.add(bank);
  }
  // Keep the space in front of the lifts free on both floors.
  for (let u = -portalW / 2 + 0.8; u <= portalW / 2 - 0.8 + 1e-6; u += 1.2) {
    const p = polar(entrance, portalD + 1.3).addScaledVector(new THREE.Vector3(-Math.sin(entrance), 0, Math.cos(entrance)), u);
    reserve(p.x, p.z, 1.1, 'both');
  }
  // A clear path from the door to the lifts.
  for (let r = R - 1; r > portalD + 1; r -= 1.2) {
    const p = polar(entrance, r);
    reserve(p.x, p.z, 1.3, 'ground');
  }
  // Landings at the foot and the top of the stairs.
  if (hasStairs) {
    const foot = stairStart.clone().addScaledVector(stairDir, -1.1);
    reserve(foot.x, foot.z, 1.0, 'ground');
    const top = stairStart.clone().addScaledVector(stairDir, stairRun + 1.3);
    reserve(top.x, top.z, 1.1, 'first');
  }

  // Wall screen on the core beside the lifts, mounted flat on its own little plinth.
  for (const off of [1.1, -1.1, 1.4, -1.4, 1.8, -1.8, Math.PI]) {
    const a = entrance + off;
    const d = faceDistance(coreOutline, a, 0.85) + 0.05;
    const holder = box(1.7, 2.4, 0.5, CM.offWhite, 0.03);
    holder.position.copy(polar(a, d - 0.25, 1.95));
    holder.rotation.y = -a + Math.PI / 2;
    const corners = footprint(holder, [[-0.85, 0.25], [0.85, 0.25], [-0.85, 1.2], [0.85, 1.2]]);
    if (corners.some(([x, z]) => insidePolygon(portalOutline, x, z) || polygonDistance(portalOutline, x, z) < 0.3)) continue;
    if (corners.some(([x, z]) => nearStairs(new THREE.Vector3(x, 0, z), 0.4))) continue;
    group.add(holder);
    const scr = mesh(new THREE.PlaneGeometry(1.4, 2.1), screenMaterial(spec.name ?? 'Aero', spec.facade?.seed ?? 1), { cast: false });
    scr.position.copy(polar(a, d + 0.004, 1.95));
    scr.rotation.y = holder.rotation.y;
    group.add(scr);
    const front = polar(a, d + 0.8);
    reserve(front.x, front.z, 0.7, 'ground');
    break;
  }

  // ---------- Columns ----------
  const colGeo = new THREE.CylinderGeometry(0.28, 0.28, PODIUM_H - 0.15, 20);
  const colMats = [];
  const n = Math.max(6, Math.round(minR * 0.9));
  for (let i = 0; i < n; i++) {
    const a = entrance + Math.PI / n + (i / n) * Math.PI * 2;
    if (Math.abs(angleDiff(a, entrance)) < doorHalf * 1.4) continue;
    const p = polar(a, radiusAt(outline, a) * 0.8, PODIUM_H / 2);
    if (hasStairs && distToSegment(p, stairStart, stairDir, stairRun) < stairW) continue;
    if (polygonDistance(portalOutline, p.x, p.z) < 1.2) continue;
    colMats.push(new THREE.Matrix4().makeTranslation(p.x, p.y + 0.07, p.z));
    reserve(p.x, p.z, 0.32, 'both');
  }
  group.add(instanced(colGeo, CM.white, colMats));

  // ---------- Ground floor: reception, lounge, plants ----------
  // Reception desk beside the path to the lifts; a smaller one where space is tight.
  reception: for (const size of [2.2, 1.6]) {
    for (const off of [-0.38, 0.38, -0.6, 0.6, -0.9, 0.9, -1.2, 1.2]) {
      const rd = receptionDesk(size, Math.PI * 0.6);
      rd.position.copy(polar(entrance + off, (coreR + R) * 0.5, 0.15));
      lookAtXZ(rd, polar(entrance, R));
      rd.rotation.y += Math.PI;
      const arc = [-0.85, -0.45, 0, 0.45, 0.85].map((a) => [Math.sin(a) * (size - 0.35), -Math.cos(a) * (size - 0.35)]);
      if (place(rd, 'ground', arc, 0.45)) break reception;
    }
  }
  // Lounge: two sofas facing each other across a glass coffee table.
  lounge: for (const [len, tableR, gap] of [[2.2, 0.6, 1.45], [1.6, 0.45, 1.25]]) {
    const seat = [[-(len / 2 - 0.45), -0.05], [len / 2 - 0.45, -0.05]];
    for (const off of [0.85, -0.85, 1.3, -1.3, 1.8, -1.8, 2.4, -2.4, Math.PI]) {
      for (const k of [0.55, 0.62, 0.48]) {
        const a = entrance + off;
        const p = polar(a, (radiusAt(coreOutline, a) + radiusAt(outline, a)) * k, 0.15);
        const table = coffeeTable(tableR);
        table.position.copy(p);
        const tangent = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        const sofas = [-gap, gap].map((o, i) => {
          const s = sofa(len, i ? CM.cushionGreen : CM.cushion);
          s.position.copy(p).addScaledVector(tangent, o);
          lookAtXZ(s, p);
          return s;
        });
        if (!fits(table, 'ground', [[0, 0]], tableR + 0.05) || !sofas.every((s) => fits(s, 'ground', seat, 0.55))) continue;
        commit(table, 'ground', [[0, 0]], tableR + 0.05);
        for (const s of sofas) commit(s, 'ground', seat, 0.55);
        break lounge;
      }
    }
  }
  if (plant) {
    let planted = 0;
    for (let i = 0; i < 12 && planted < 3; i++) {
      const a = entrance + 0.32 + i * 0.53;
      const pl = planter(0.7, 0.9);
      pl.position.copy(polar(a, radiusAt(outline, a) - 1.4, 0.15));
      if (!place(pl, 'ground', [[0, 0]], 0.75)) continue;
      plant(rng() < 0.5 ? 'ashSmall' : 'oakSmall', pl.position.clone().setY(1.0), 0.17);
      planted++;
    }
  }

  // ---------- Stairs ----------
  if (hasStairs) {
    const st = stairs(stairW, GROUND_H + SLAB_T - 0.15, stairRun);
    st.position.copy(stairStart).setY(0.15);
    st.rotation.y = Math.atan2(stairDir.x, stairDir.z);
    group.add(st);
    // Rail on three sides; the top end of the stair stays open.
    group.add(balustrade([hole[3], hole[0], hole[1], hole[2]], GROUND_H + SLAB_T, { closed: false }));
  }

  // ---------- First floor: co-working desks, café, meeting room, plants ----------
  const officeA = stairAngle + Math.PI;
  for (let row = 0; row < 2; row++) {
    for (let k = -2; k <= 2; k++) {
      const a = officeA + k * (2.6 / ((coreR + R) * 0.5));
      const rr = (radiusAt(coreOutline, a) + radiusAt(outline, a)) * 0.5 + (row - 0.5) * 2.4;
      const d = desk(1.6, row ? CM.aquaGlow : CM.greenGlow);
      d.position.copy(polar(a, rr, ff));
      lookAtXZ(d, new THREE.Vector3(0, ff, 0));
      const c = chair(k % 2 ? CM.white : CM.aqua);
      c.position.copy(polar(a, rr - 0.75, ff));
      lookAtXZ(c, new THREE.Vector3(0, ff, 0));
      c.rotation.y += Math.PI;
      const deskPts = [[-0.45, 0], [0.45, 0]];
      if (!fits(d, 'first', deskPts, 0.5) || !fits(c, 'first', [[0, 0]], 0.3)) continue;
      commit(d, 'first', deskPts, 0.5);
      // The chair tucks in at its desk: it only has to stay clear of everything else.
      group.add(c);
      const [cx, cz] = footprint(c, [[0, 0]])[0];
      obstacles.push({ x: cx, z: cz, r: 0.3, level: 'first' });
      reserve(cx, cz, 0.3, 'first');
    }
  }
  // Café corner: little round tables, each with two chairs.
  let cafes = 0;
  for (let i = 0; i < 14 && cafes < 3; i++) {
    const a = entrance - 0.7 - i * 0.42;
    const cr = (radiusAt(coreOutline, a) + radiusAt(outline, a)) * 0.58;
    const t = coffeeTable(0.45);
    t.scale.set(1, 1.6, 1);
    t.position.copy(polar(a, cr, ff));
    const chairs = [0, Math.PI].map((s) => {
      const c = chair(cafes % 2 ? CM.lime : CM.white);
      c.position.copy(t.position).add(new THREE.Vector3(Math.cos(a + s + Math.PI / 2) * 0.8, 0, Math.sin(a + s + Math.PI / 2) * 0.8));
      lookAtXZ(c, t.position);
      return c;
    });
    if (!fits(t, 'first', [[0, 0]], 0.5) || !chairs.every((c) => fits(c, 'first', [[0, 0]], 0.3))) continue;
    commit(t, 'first', [[0, 0]], 0.5);
    for (const c of chairs) commit(c, 'first', [[0, 0]], 0.3);
    cafes++;
  }
  // Glass meeting room: the first spot where the whole box (with room to walk around it) is free.
  let room = null;
  const roomPts = [];
  for (const x of [-1.2, 0, 1.2]) for (const z of [-0.8, 0.8]) roomPts.push([x, z]);
  search: for (const dA of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5, 3]) {
    for (const k of [0.55, 0.5, 0.6, 0.45, 0.65]) {
      const a = entrance + Math.PI * 1.05 + dA;
      const r = (radiusAt(coreOutline, a) + radiusAt(outline, a)) * k;
      const probe = new THREE.Group();
      probe.position.copy(polar(a, r, ff));
      lookAtXZ(probe, new THREE.Vector3(0, ff, 0));
      // Corners stay off the walls; the inside circles keep furniture well away from the glass.
      const corners = footprint(probe, [[-1.8, -1.4], [1.8, -1.4], [1.8, 1.4], [-1.8, 1.4]]);
      if (!corners.every((p) => spotFree(p, 0.25, 'first'))) continue;
      if (!fits(probe, 'first', roomPts, 0.95)) continue;
      room = probe;
      break search;
    }
  }
  // Slim towers have no space for it; then there is simply no meeting room.
  if (room) {
    const glassBox = mesh(new THREE.BoxGeometry(3.6, 2.9, 2.8), CM.railGlass, { cast: false });
    glassBox.position.y = 1.45;
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.6, 2.9, 2.8)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    frame.position.y = 1.45;
    const mt = box(2.2, 0.06, 1.0, CM.white, 0.02);
    mt.position.y = 0.74;
    const mleg = mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.72, 12), CM.silver);
    mleg.position.y = 0.36;
    room.add(glassBox, frame, mt, mleg);
    for (const [x, z, r] of [[-0.6, 0.85, Math.PI], [0.6, 0.85, Math.PI], [-0.6, -0.85, 0], [0.6, -0.85, 0]]) {
      const c = chair(CM.aqua);
      c.position.set(x, 0, z);
      c.rotation.y = r;
      room.add(c);
    }
    group.add(room);
    for (const [x, z] of footprint(room, roomPts)) reserve(x, z, 0.95, 'first');
  }
  if (plant) {
    let planted = 0;
    for (let i = 0; i < 12 && planted < 2; i++) {
      const a = officeA + 1.2 + i * 0.6;
      const pl = planter(0.5, 0.7);
      pl.position.copy(polar(a, radiusAt(outline, a) - 1.1, ff));
      if (!place(pl, 'first', [[0, 0]], 0.55)) continue;
      plant('bush', pl.position.clone().setY(ff + 0.72), 0.35);
      planted++;
    }
  }

  // ---------- Ceiling lights: recessed round panels with a silver trim ----------
  // Not over the stair void, never in a column, the core, the lift portal or the glass room.
  const lightsFor = (level) => {
    const out = [];
    for (let gx = -40; gx <= 40; gx += 3.2) {
      for (let gz = -40; gz <= 40; gz += 3.2) {
        if (!insidePolygon(outline, gx, gz) || polygonDistance(outline, gx, gz) < 0.9) continue;
        if (insidePolygon(coreOutline, gx, gz) || polygonDistance(coreOutline, gx, gz) < 0.7) continue;
        if (insidePolygon(portalOutline, gx, gz) || polygonDistance(portalOutline, gx, gz) < 0.6) continue;
        if (colMats.some((m) => Math.hypot(m.elements[12] - gx, m.elements[14] - gz) < 0.8)) continue;
        if (level === 'ground' && nearStairs(new THREE.Vector3(gx, 0, gz), 0.8)) continue;
        if (level === 'first' && room) {
          const v = new THREE.Vector3(gx, 0, gz).sub(room.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -room.rotation.y);
          if (Math.abs(v.x) < 2.2 && Math.abs(v.z) < 1.8) continue;
        }
        out.push([gx, gz]);
      }
    }
    return out;
  };
  const panels = [];
  const trims = [];
  for (const [level, y] of [['ground', GROUND_H], ['first', PODIUM_H]]) {
    for (const [x, z] of lightsFor(level)) {
      panels.push(new THREE.Matrix4().makeTranslation(x, y - 0.012, z));
      trims.push(new THREE.Matrix4().makeTranslation(x, y - 0.008, z));
    }
  }
  const panelGeo = new THREE.CircleGeometry(0.3, 24);
  panelGeo.rotateX(Math.PI / 2);
  const trimGeo = new THREE.RingGeometry(0.3, 0.37, 32);
  trimGeo.rotateX(Math.PI / 2);
  group.add(instanced(panelGeo, CM.lightPanel, panels, { cast: false }));
  group.add(instanced(trimGeo, CM.silver, trims, { cast: false }));

  const local = (obj, x, z) => {
    obj.updateMatrix();
    const v = new THREE.Vector3(x, 0, z).applyMatrix4(obj.matrix);
    return [v.x, v.z];
  };
  return {
    door: outline.map((_, i) => isDoor(i)),
    core: coreOutline,
    portal: portalOutline,
    columns: colMats.map((m) => [m.elements[12], m.elements[14]]),
    canopyColumns: [-1, 1].map((s) => local(canopy, s * 2.9, 3.25)),
    room: room ? [[-1.8, -1.4], [1.8, -1.4], [1.8, 1.4], [-1.8, 1.4]].map(([x, z]) => local(room, x, z)) : null,
    stairs: hasStairs ? { x: stairStart.x, z: stairStart.z, dx: stairDir.x, dz: stairDir.z, run: stairRun, width: stairW } : null,
    hole: hasStairs ? hole : null,
    obstacles,
    ground: 0.15,
    first: GROUND_H + SLAB_T,
    ceiling: PODIUM_H,
  };
}

function insidePolygon(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from (x, z) to the nearest edge of a closed polygon. */
function polygonDistance(points, x, z) {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[j];
    const [bx, bz] = points[i];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    best = Math.min(best, Math.hypot(x - (ax + ex * t), z - (az + ez * t)));
  }
  return best;
}

/** How far out (from the centre, in direction `a`) a flat face `half` metres wide clears the polygon. */
function faceDistance(points, a, half) {
  const nx = Math.cos(a);
  const nz = Math.sin(a);
  let d = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    for (let k = 0; k <= 8; k++) {
      const x = points[j][0] + (points[i][0] - points[j][0]) * (k / 8);
      const z = points[j][1] + (points[i][1] - points[j][1]) * (k / 8);
      if (Math.abs(-nz * x + nx * z) <= half) d = Math.max(d, nx * x + nz * z);
    }
  }
  return d;
}

function distToSegment(p, start, dir, len) {
  const v = p.clone().sub(start);
  v.y = 0;
  const t = THREE.MathUtils.clamp(v.dot(dir), 0, len);
  const closest = start.clone().addScaledVector(dir, t);
  return Math.hypot(p.x - closest.x, p.z - closest.z);
}
