import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { facadeTextures, marbleTexture, screenTexture } from './textures.js';

// ---------- Materials ----------

export const CM = {
  white: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 }),
  offWhite: new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.4, clearcoat: 0.6, envMapIntensity: 0.5 }),
  aqua: new THREE.MeshPhysicalMaterial({ color: 0x00b8ec, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }),
  lime: new THREE.MeshPhysicalMaterial({ color: 0x7ee04a, roughness: 0.2, clearcoat: 1 }),
  silver: new THREE.MeshPhysicalMaterial({ color: 0xe4edf4, metalness: 0.9, roughness: 0.14, clearcoat: 1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xc9d3db, metalness: 0.95, roughness: 0.32 }),
  dark: new THREE.MeshPhysicalMaterial({ color: 0x1b2a36, roughness: 0.2, clearcoat: 1 }),
  clearGlass: new THREE.MeshPhysicalMaterial({
    color: 0xe6f8ff,
    roughness: 0.02,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  railGlass: new THREE.MeshPhysicalMaterial({
    color: 0xaeeeff,
    roughness: 0.03,
    transparent: true,
    opacity: 0.32,
    clearcoat: 1,
    envMapIntensity: 1.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  tintedGlass: new THREE.MeshPhysicalMaterial({
    color: 0x7fd8ff,
    metalness: 0.2,
    roughness: 0.04,
    transparent: true,
    opacity: 0.55,
    clearcoat: 1,
    envMapIntensity: 1.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  // Indoor materials see less sky, so their reflections are toned down.
  marble: new THREE.MeshPhysicalMaterial({ map: marbleTexture(), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.35 }),
  cushion: new THREE.MeshStandardMaterial({ color: 0x2ec4ef, roughness: 0.75 }),
  cushionGreen: new THREE.MeshStandardMaterial({ color: 0x8edc4a, roughness: 0.75 }),
  lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.2 }),
  aquaGlow: new THREE.MeshStandardMaterial({ color: 0x6fe6ff, emissive: 0x2fd2ff, emissiveIntensity: 2.4 }),
  greenGlow: new THREE.MeshStandardMaterial({ color: 0x9dff7a, emissive: 0x5fff4a, emissiveIntensity: 1.8 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }),
  lawn: new THREE.MeshStandardMaterial({ color: 0x5fcf3a, roughness: 0.8 }),
  solar: new THREE.MeshPhysicalMaterial({ color: 0x173a7a, metalness: 0.6, roughness: 0.15, clearcoat: 1 }),
  interiorBack: new THREE.MeshStandardMaterial({ color: 0x5a7f9a, roughness: 0.6 }),
};

export function facadeMaterial(opts) {
  const { map, roughnessMap, emissiveMap } = facadeTextures(opts);
  return new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap,
    roughness: 1,
    metalness: 0.35,
    emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.5,
  });
}

export function screenMaterial(title, seed) {
  return new THREE.MeshStandardMaterial({
    map: screenTexture(title, seed),
    emissiveMap: screenTexture(title, seed),
    emissive: 0xffffff,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
}

// ---------- Outlines (closed loops of [x, z] points, counter-clockwise seen from above) ----------

export function circle(r, n = 64) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, -Math.sin(a) * r];
  });
}

export function roundedRect(w, d, radius, perCorner = 8) {
  const pts = [];
  const hw = w / 2 - radius;
  const hd = d / 2 - radius;
  const corners = [
    [hw, -hd, 0],
    [-hw, -hd, Math.PI / 2],
    [-hw, hd, Math.PI],
    [hw, hd, Math.PI * 1.5],
  ];
  for (const [cx, cz, start] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = start + (i / perCorner) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * radius, cz - Math.sin(a) * radius]);
    }
  }
  return pts;
}

export function scaleOutline(points, s) {
  return points.map(([x, z]) => [x * s, z * s]);
}

export function offsetOutline(points, d) {
  const n = points.length;
  return points.map((p, i) => {
    const nrm = vertexNormal(points, i);
    return [p[0] + nrm[0] * d, p[1] + nrm[1] * d];
  });
}

function vertexNormal(points, i) {
  const n = points.length;
  let a = points[(i - 1 + n) % n];
  let b = points[(i + 1) % n];
  // A two-point line has identical neighbours; use the segment itself so the normal is never zero.
  if (a === b) [a, b] = [points[0], points[1]];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  // Outlines wind from +x towards -z, so the outward normal is (-dz, dx).
  return [-dz / len, dx / len];
}

/** Distance from the origin to the outline along a direction (outline must contain origin). */
export function radiusAt(points, angle) {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[(i + 1) % points.length];
    const ex = bx - ax;
    const ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ez - az * ex) / den;
    const u = (ax * dz - az * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

// ---------- Geometry builders ----------

/**
 * Vertical walls along a closed outline with smooth normals and world-scale UVs.
 * skip(i) can leave out segments (for door openings).
 */
export function prismWall(points, y0, y1, { uScale = 1, vScale = 1, skip = null, inward = false } = {}) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const n = points.length;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!skip || !skip(i)) {
      const na = vertexNormal(points, i);
      const nb = vertexNormal(points, (i + 1) % n);
      const s = inward ? -1 : 1;
      const base = pos.length / 3;
      pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
      nor.push(na[0] * s, 0, na[1] * s, nb[0] * s, 0, nb[1] * s, nb[0] * s, 0, nb[1] * s, na[0] * s, 0, na[1] * s);
      uv.push(u / uScale, y0 / vScale, (u + len) / uScale, y0 / vScale, (u + len) / uScale, y1 / vScale, u / uScale, y1 / vScale);
      if (inward) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    u += len;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function shapeFrom(points, holes = []) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return shape;
}

/** Horizontal slab from an outline, from y to y + thickness, with planar UVs in meters/uvScale. */
export function slab(points, y, thickness, { holes = [], uvScale = 4, bevel = 0 } = {}) {
  const geo = new THREE.ExtrudeGeometry(shapeFrom(points, holes), {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / uvScale, p.getZ(i) / uvScale);
  return geo;
}

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function box(w, h, d, mat, radius = 0) {
  const geo = radius > 0 ? new RoundedBoxGeometry(w, h, d, 3, radius) : new THREE.BoxGeometry(w, h, d);
  return mesh(geo, mat);
}

// ---------- Furniture & fittings (local units are meters, y = floor level) ----------

export function sofa(len = 2.4, color = CM.cushion) {
  const g = new THREE.Group();
  const base = box(len, 0.42, 0.95, CM.white, 0.12);
  base.position.y = 0.21;
  const back = box(len, 0.75, 0.25, CM.white, 0.1);
  back.position.set(0, 0.6, -0.36);
  g.add(base, back);
  for (const s of [-1, 1]) {
    const arm = box(0.22, 0.62, 0.95, CM.white, 0.1);
    arm.position.set((s * (len - 0.22)) / 2, 0.42, 0);
    g.add(arm);
  }
  const n = Math.max(2, Math.round(len / 0.9));
  for (let i = 0; i < n; i++) {
    const cushion = box((len - 0.5) / n - 0.04, 0.16, 0.66, color, 0.07);
    cushion.position.set(-((len - 0.5) / 2) + ((len - 0.5) / n) * (i + 0.5), 0.5, 0.06);
    g.add(cushion);
  }
  return g;
}

export function coffeeTable(r = 0.6) {
  const g = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(r, r, 0.04, 40), CM.tintedGlass);
  top.position.y = 0.45;
  const leg = mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.45, 16), CM.silver);
  leg.position.y = 0.22;
  const foot = mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 24), CM.silver);
  g.add(top, leg, foot);
  return g;
}

export function chair(color = CM.white) {
  const g = new THREE.Group();
  const seat = box(0.5, 0.08, 0.5, color, 0.03);
  seat.position.y = 0.46;
  const back = box(0.5, 0.5, 0.06, color, 0.03);
  back.position.set(0, 0.74, -0.22);
  const stem = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 8), CM.silver);
  stem.position.y = 0.22;
  const foot = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 5), CM.silver);
  g.add(seat, back, stem, foot);
  return g;
}

export function desk(len = 1.6, screenMat = CM.aquaGlow) {
  const g = new THREE.Group();
  const top = box(len, 0.05, 0.8, CM.white, 0.02);
  top.position.y = 0.74;
  g.add(top);
  for (const s of [-1, 1]) {
    const leg = box(0.05, 0.72, 0.7, CM.silver);
    leg.position.set((s * (len - 0.1)) / 2, 0.36, 0);
    g.add(leg);
  }
  const monitor = box(0.62, 0.38, 0.03, CM.dark, 0.01);
  monitor.position.set(0, 1.08, -0.22);
  const screen = mesh(new THREE.PlaneGeometry(0.56, 0.32), screenMat, { cast: false });
  screen.position.set(0, 1.08, -0.203);
  const stand = box(0.04, 0.28, 0.04, CM.silver);
  stand.position.set(0, 0.9, -0.25);
  const kb = box(0.45, 0.02, 0.15, CM.white, 0.005);
  kb.position.set(0, 0.775, 0.05);
  g.add(monitor, screen, stand, kb);
  return g;
}

export function planter(r = 0.6, h = 0.8) {
  const g = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 32), CM.white);
  pot.position.y = h / 2;
  const rim = mesh(new THREE.TorusGeometry(r, 0.04, 8, 32), CM.aqua);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h;
  const soil = mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.05, 32), CM.soil);
  soil.position.y = h - 0.06;
  g.add(pot, rim, soil);
  g.userData.plantHeight = h - 0.05;
  return g;
}

export function receptionDesk(radius = 2.4, arc = Math.PI * 0.7) {
  const g = new THREE.Group();
  const outer = radius;
  const inner = radius - 0.7;
  const shape = new THREE.Shape();
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const a = -arc / 2 + (i / steps) * arc;
    const p = [Math.sin(a) * outer, Math.cos(a) * outer];
    if (i === 0) shape.moveTo(p[0], p[1]);
    else shape.lineTo(p[0], p[1]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = -arc / 2 + (i / steps) * arc;
    shape.lineTo(Math.sin(a) * inner, Math.cos(a) * inner);
  }
  const body = new THREE.ExtrudeGeometry(shape, { depth: 1.05, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  body.rotateX(-Math.PI / 2);
  g.add(mesh(body, CM.white));
  const strip = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
  strip.rotateX(-Math.PI / 2);
  const glow = mesh(strip, CM.aquaGlow, { cast: false });
  glow.position.y = 0.32;
  glow.scale.set(1.012, 1, 1.012);
  g.add(glow);
  const top = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  top.rotateX(-Math.PI / 2);
  const counter = mesh(top, CM.tintedGlass);
  counter.position.y = 1.12;
  counter.scale.set(1.03, 1, 1.03);
  g.add(counter);
  for (const a of [-0.25, 0.25]) {
    const d = desk(0.9);
    d.scale.setScalar(0.9);
    d.position.set(Math.sin(a) * (inner - 0.5), 0, -Math.cos(a) * (inner - 0.5));
    d.rotation.y = -a;
    g.add(d);
  }
  return g;
}

export function elevatorBank(count = 3, faceWidth = 1.6, height = 4.6) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * (faceWidth + 0.6);
    const frame = box(faceWidth + 0.3, 2.7, 0.08, CM.silver);
    frame.position.set(x, 1.35, 0.04);
    g.add(frame);
    for (const s of [-1, 1]) {
      const door = box(faceWidth / 2 - 0.02, 2.5, 0.06, CM.steel);
      door.position.set(x + (s * faceWidth) / 4, 1.25, 0.1);
      g.add(door);
    }
    const ind = mesh(new THREE.PlaneGeometry(0.5, 0.12), CM.aquaGlow, { cast: false });
    ind.position.set(x, 2.95, 0.09);
    g.add(ind);
    const btn = mesh(new THREE.CircleGeometry(0.05, 16), CM.aquaGlow, { cast: false });
    btn.position.set(x + faceWidth / 2 + 0.22, 1.2, 0.09);
    g.add(btn);
  }
  return g;
}

/** Straight stair rising `height` over `run` along +z, with glass balustrades and handrails. */
export function stairs(width = 1.6, height = 4.6, run = 7) {
  const g = new THREE.Group();
  const steps = Math.round(height / 0.18);
  const sh = height / steps;
  const sd = run / steps;
  const stepGeo = new RoundedBoxGeometry(width, 0.06, sd + 0.02, 2, 0.02);
  for (let i = 0; i < steps; i++) {
    const s = mesh(stepGeo, CM.white);
    s.position.set(0, (i + 1) * sh - 0.03, i * sd + sd / 2);
    g.add(s);
  }
  // Two white stringers.
  const len = Math.hypot(height, run);
  const angle = Math.atan2(height, run);
  for (const side of [-1, 1]) {
    const stringer = box(0.08, 0.35, len, CM.white);
    stringer.position.set((side * (width + 0.08)) / 2, height / 2 - 0.1, run / 2);
    stringer.rotation.x = -angle;
    g.add(stringer);
    const glass = mesh(new THREE.PlaneGeometry(len, 0.95), CM.railGlass, { cast: false });
    glass.rotation.y = Math.PI / 2;
    glass.rotation.z = -angle;
    glass.position.set((side * (width + 0.12)) / 2, height / 2 + 0.55, run / 2);
    g.add(glass);
    const rail = mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 8), CM.silver);
    rail.rotation.x = Math.PI / 2 - angle;
    rail.position.set((side * (width + 0.12)) / 2, height / 2 + 1.05, run / 2);
    g.add(rail);
  }
  return g;
}

/** Glass balustrade following an open polyline of [x, z] points. */
export function balustrade(points, y, { height = 1.05, closed = true } = {}) {
  const g = new THREE.Group();
  const n = points.length;
  const segs = closed ? n : n - 1;
  const panel = prismWall(points, y, y + height, { skip: (i) => !closed && i === n - 1 });
  g.add(mesh(panel, CM.railGlass, { cast: false }));
  const railPts = points.map(([x, z]) => new THREE.Vector3(x, y + height + 0.03, z));
  const rail = new THREE.CatmullRomCurve3(railPts, closed, 'catmullrom', 0);
  g.add(mesh(new THREE.TubeGeometry(rail, segs * 2, 0.035, 6, closed), CM.silver));
  return g;
}
