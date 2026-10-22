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
  else buildPodium(ctx);

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
  group.add(mesh(slab(offsetOutline(roofOutline, 0.3), topY, 0.6, { bevel: 0.1 }), CM.white));
  group.add(balustrade(offsetOutline(roofOutline, 0.15), topY + 0.7));
  if (spec.crown) spec.crown({ ...ctx, topY: topY + 0.7, roofOutline });
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

  // ---------- Ground floor interior ----------
  const coreOutline = scaleOutline(outline, spec.coreScale ?? 0.3);
  group.add(mesh(prismWall(coreOutline, 0.15, PODIUM_H, {}), CM.offWhite));
  const coreR = radiusAt(coreOutline, entrance);
  const elev = elevatorBank(minR > 7 ? 3 : 2, 1.5);
  elev.position.copy(polar(entrance, coreR + 0.02, 0.15));
  elev.rotation.y = -entrance + Math.PI / 2;
  group.add(elev);
  const elev2 = elevatorBank(2, 1.5);
  elev2.position.copy(polar(entrance, coreR + 0.02, GROUND_H + SLAB_T));
  elev2.rotation.y = elev.rotation.y;
  group.add(elev2);

  // Reception desk between core and door, off to one side.
  const deskPos = polar(entrance - 0.38, (coreR + R) * 0.5, 0.15);
  const rd = receptionDesk(2.2, Math.PI * 0.6);
  rd.position.copy(deskPos);
  lookAtXZ(rd, polar(entrance, R));
  rd.rotation.y += Math.PI;
  group.add(rd);
  // Wall screen next to the elevators.
  const scr = mesh(new THREE.PlaneGeometry(1.4, 2.1), screenMaterial(spec.name ?? 'Aero', spec.facade?.seed ?? 1), { cast: false });
  scr.position.copy(polar(entrance + 0.55, radiusAt(coreOutline, entrance + 0.55) + 0.03, 1.9));
  scr.rotation.y = -(entrance + 0.55) + Math.PI / 2;
  group.add(scr);

  // Lounge: two sofas around a glass coffee table.
  const loungeA = entrance + 0.85;
  const loungeP = polar(loungeA, (coreR + R) * 0.55, 0.15);
  const table = coffeeTable(0.65);
  table.position.copy(loungeP);
  group.add(table);
  for (const off of [-1.4, 1.4]) {
    const s = sofa(2.3, off < 0 ? CM.cushion : CM.cushionGreen);
    const dir = new THREE.Vector3(Math.cos(loungeA + Math.PI / 2), 0, Math.sin(loungeA + Math.PI / 2));
    s.position.copy(loungeP).addScaledVector(dir, off);
    s.position.y = 0.15;
    lookAtXZ(s, loungeP);
    group.add(s);
  }

  // Columns and indoor plants.
  const colGeo = new THREE.CylinderGeometry(0.28, 0.28, PODIUM_H - 0.15, 20);
  const colMats = [];
  const n = Math.max(6, Math.round(minR * 0.9));
  for (let i = 0; i < n; i++) {
    const a = entrance + Math.PI / n + (i / n) * Math.PI * 2;
    if (Math.abs(angleDiff(a, entrance)) < doorHalf * 1.4) continue;
    const p = polar(a, radiusAt(outline, a) * 0.8, PODIUM_H / 2);
    if (hasStairs && distToSegment(p, stairStart, stairDir, stairRun) < stairW) continue;
    colMats.push(new THREE.Matrix4().makeTranslation(p.x, p.y + 0.07, p.z));
  }
  group.add(instanced(colGeo, CM.white, colMats));
  for (const a of plant ? [entrance - 0.75, entrance + 0.32, entrance + Math.PI] : []) {
    const p = polar(a, radiusAt(outline, a) * 0.66, 0.15);
    if (hasStairs && distToSegment(p, stairStart, stairDir, stairRun) < stairW + 1) continue;
    const pl = planter(0.75, 0.9);
    pl.position.copy(p);
    group.add(pl);
    plant(rng() < 0.5 ? 'ashSmall' : 'oakSmall', p.clone().setY(1.0), 0.17);
  }

  // Ceiling lights for both floors.
  const lights = [];
  for (let gx = -40; gx <= 40; gx += 3.2) {
    for (let gz = -40; gz <= 40; gz += 3.2) {
      const r = Math.hypot(gx, gz);
      if (r < coreR + 1 || r > radiusAt(outline, Math.atan2(gz, gx)) - 1) continue;
      lights.push(new THREE.Matrix4().makeTranslation(gx, GROUND_H - 0.01, gz));
      lights.push(new THREE.Matrix4().makeTranslation(gx, PODIUM_H - 0.01, gz));
    }
  }
  const lightGeo = new THREE.CircleGeometry(0.35, 24);
  lightGeo.rotateX(Math.PI / 2);
  group.add(instanced(lightGeo, CM.lightPanel, lights, { cast: false }));

  // ---------- Stairs and first floor ----------
  if (hasStairs) {
    const st = stairs(stairW, GROUND_H + SLAB_T - 0.15, stairRun);
    st.position.copy(stairStart).setY(0.15);
    st.rotation.y = Math.atan2(stairDir.x, stairDir.z);
    group.add(st);
    // Rail on three sides; the top end of the stair stays open.
    group.add(balustrade([hole[3], hole[0], hole[1], hole[2]], GROUND_H + SLAB_T, { closed: false }));
  }
  const ff = GROUND_H + SLAB_T;
  // Co-working desks opposite the stairs.
  const officeA = stairAngle + Math.PI;
  for (let row = 0; row < 2; row++) {
    for (let k = -1; k <= 1; k++) {
      const a = officeA + k * (3.0 / ((coreR + R) * 0.5));
      const rr = (coreR + R) * 0.5 + (row - 0.5) * 2.4;
      if (rr > radiusAt(outline, a) - 1.2) continue;
      const d = desk(1.6, row ? CM.aquaGlow : CM.greenGlow);
      d.position.copy(polar(a, rr, ff));
      lookAtXZ(d, new THREE.Vector3(0, ff, 0));
      group.add(d);
      const c = chair(k % 2 ? CM.white : CM.aqua);
      c.position.copy(polar(a, rr - 0.75, ff));
      lookAtXZ(c, new THREE.Vector3(0, ff, 0));
      c.rotation.y += Math.PI;
      group.add(c);
    }
  }
  // Café corner near the facade.
  const cafeA = entrance - 1.0;
  const cafeR = (coreR + R) * 0.58;
  for (let k = 0; k < 3; k++) {
    const a = cafeA + (k - 1) * (2.6 / cafeR);
    const p = polar(a, cafeR, ff);
    const t = coffeeTable(0.45);
    t.scale.set(1, 1.6, 1);
    t.position.copy(p);
    group.add(t);
    for (const s of [0, Math.PI]) {
      const c = chair(k % 2 ? CM.lime : CM.white);
      c.position.copy(p).add(new THREE.Vector3(Math.cos(a + s) * 0.75, 0, Math.sin(a + s) * 0.75));
      lookAtXZ(c, p);
      group.add(c);
    }
  }
  // Glass meeting room.
  const meetA = entrance + Math.PI * 1.05;
  const mp = polar(meetA, (coreR + R) * 0.55, ff);
  const room = new THREE.Group();
  room.position.copy(mp);
  lookAtXZ(room, new THREE.Vector3(0, ff, 0));
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
  // A couple of plants upstairs.
  for (const a of plant ? [cafeA + 0.9, officeA + 1.2] : []) {
    const p = polar(a, radiusAt(outline, a) * 0.78, ff);
    if (hasStairs && distToSegment(p, stairStart, stairDir, stairRun) < stairW + 1) continue;
    const pl = planter(0.5, 0.7);
    pl.position.copy(p);
    group.add(pl);
    plant('bush', p.clone().setY(ff + 0.72), 0.35);
  }
}

function distToSegment(p, start, dir, len) {
  const v = p.clone().sub(start);
  v.y = 0;
  const t = THREE.MathUtils.clamp(v.dot(dir), 0, len);
  const closest = start.clone().addScaledVector(dir, t);
  return Math.hypot(p.x - closest.x, p.z - closest.z);
}
