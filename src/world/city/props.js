import * as THREE from 'three';
import { CM, mesh, box, screenMaterial } from './parts.js';
import { loadTexture } from '../assets.js';

// Street furniture for the plaza. Each builder returns a Group standing on y = 0.

export function streetLamp() {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.4, 20), CM.white);
  base.position.y = 0.2;
  const pole = mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 16), CM.white);
  pole.position.y = 2.8;
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 5.3, 0), new THREE.Vector3(0, 6.2, 0), new THREE.Vector3(0.9, 6.1, 0));
  const arm = mesh(new THREE.TubeGeometry(curve, 16, 0.06, 8), CM.white);
  const head = mesh(new THREE.SphereGeometry(0.32, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), CM.white);
  head.position.set(1.05, 6.05, 0);
  const bulb = mesh(new THREE.SphereGeometry(0.26, 20, 12), CM.lightPanel, { cast: false });
  bulb.scale.y = 0.5;
  bulb.position.set(1.05, 6.02, 0);
  const ring = mesh(new THREE.TorusGeometry(0.11, 0.03, 8, 24), CM.aquaGlow, { cast: false });
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.2;
  g.add(base, pole, arm, head, bulb, ring);
  return g;
}

export function bench() {
  const g = new THREE.Group();
  for (const x of [-0.85, 0.85]) {
    const leg = box(0.12, 0.42, 0.55, CM.white, 0.04);
    leg.position.set(x, 0.21, 0);
    g.add(leg);
  }
  for (let i = 0; i < 4; i++) {
    const slat = box(2.0, 0.05, 0.12, CM.wood, 0.02);
    slat.position.set(0, 0.45, -0.21 + i * 0.14);
    g.add(slat);
  }
  for (let i = 0; i < 3; i++) {
    const slat = box(2.0, 0.1, 0.04, CM.wood, 0.015);
    slat.position.set(0, 0.62 + i * 0.13, -0.32);
    slat.rotation.x = -0.15;
    g.add(slat);
  }
  return g;
}

export function trashBin() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.9, 24), CM.white);
  body.position.y = 0.45;
  const lid = mesh(new THREE.SphereGeometry(0.3, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), CM.aqua);
  lid.position.y = 0.9;
  lid.scale.y = 0.4;
  const band = mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.1, 24), CM.lime);
  band.position.y = 0.6;
  g.add(body, lid, band);
  return g;
}

export function bollard() {
  const g = new THREE.Group();
  const b = mesh(new THREE.CapsuleGeometry(0.12, 0.6, 6, 16), CM.white);
  b.position.y = 0.42;
  const glow = mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.06, 16), CM.aquaGlow, { cast: false });
  glow.position.y = 0.62;
  g.add(b, glow);
  return g;
}

export function infoKiosk(title, seed) {
  const g = new THREE.Group();
  const body = box(1.3, 2.6, 0.45, CM.white, 0.2);
  body.position.y = 1.3;
  const screen = mesh(new THREE.PlaneGeometry(1.0, 1.5), screenMaterial(title, seed), { cast: false });
  screen.position.set(0, 1.5, 0.231);
  const back = screen.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.231;
  const cap = box(1.4, 0.12, 0.55, CM.aqua, 0.05);
  cap.position.y = 2.66;
  g.add(body, screen, back, cap);
  return g;
}

export function treePlanter(r = 1.3) {
  const g = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(r, r * 0.92, 0.7, 40), CM.white);
  pot.position.y = 0.35;
  const seat = mesh(new THREE.TorusGeometry(r, 0.09, 10, 40), CM.wood);
  seat.rotation.x = Math.PI / 2;
  seat.position.y = 0.7;
  const soil = mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.06, 40), CM.lawn);
  soil.position.y = 0.66;
  g.add(pot, seat, soil);
  g.userData.plantY = 0.68;
  return g;
}

let waterNormals = null;
export function waterMaterial(color = 0x35cdf5, opacity = 0.72) {
  waterNormals ??= loadTexture('waternormals.jpg', { srgb: false });
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.03,
    transparent: true,
    opacity,
    clearcoat: 1,
    clearcoatRoughness: 0,
    normalMap: waterNormals,
    normalScale: new THREE.Vector2(0.25, 0.25),
    envMapIntensity: 1.6,
  });
  return mat;
}

// Fountain with the Aero globe, glossy water arcs and floor lights.
export function fountainGlobe() {
  const g = new THREE.Group();
  const water = waterMaterial();
  const basinOuter = mesh(new THREE.CylinderGeometry(9.4, 9.8, 0.9, 96), CM.white);
  basinOuter.position.y = 0.45;
  const rim = mesh(new THREE.TorusGeometry(9.35, 0.22, 12, 96), CM.white);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.9;
  const inner = mesh(new THREE.CylinderGeometry(9.0, 9.0, 0.3, 96), CM.aqua);
  inner.position.y = 0.6;
  const surface = mesh(new THREE.CircleGeometry(9.05, 96), water, { cast: false });
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.82;
  g.add(basinOuter, rim, inner, surface);

  // Stepped pedestal.
  for (let i = 0; i < 3; i++) {
    const step = mesh(new THREE.CylinderGeometry(2.6 - i * 0.6, 2.7 - i * 0.6, 0.5, 48), CM.white);
    step.position.y = 0.9 + i * 0.5;
    g.add(step);
  }
  const column = mesh(new THREE.CylinderGeometry(0.7, 1.0, 3.4, 32), CM.white);
  column.position.y = 3.6;
  g.add(column);
  const globeY = 8.6;
  const globe = mesh(new THREE.SphereGeometry(3.4, 64, 48), CM.aqua);
  globe.position.y = globeY;
  g.add(globe);
  const continents = new THREE.Group();
  continents.position.y = globeY;
  const blob = new THREE.SphereGeometry(1, 20, 14);
  const spots = [
    [0.4, 0.3, 1.4], [0.9, -0.2, 1.1], [2.2, 0.5, 1.5], [2.6, -0.4, 1.0], [3.9, 0.2, 1.3],
    [4.6, 0.7, 0.9], [5.4, -0.5, 1.2], [1.6, 0.9, 0.8], [3.2, -0.9, 0.7], [5.9, 0.4, 0.9],
  ];
  for (const [lon, lat, size] of spots) {
    const b = mesh(blob, CM.lime, { cast: false });
    b.position.setFromSphericalCoords(3.25, Math.PI / 2 - lat, lon);
    b.lookAt(0, 0, 0);
    b.scale.set(size, size * 0.7, 0.32);
    continents.add(b);
  }
  g.add(continents);
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(4.6 + i * 0.75, 0.09, 10, 120), CM.silver);
    ring.position.y = globeY;
    ring.rotation.set(Math.PI / 2 + (i - 1) * 0.4, i * 0.6, 0);
    g.add(ring);
  }

  // Water arcs from the rim towards the pedestal, plus floor lights.
  const jetMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8fbff,
    emissive: 0x8fe8ff,
    emissiveIntensity: 0.35,
    roughness: 0.02,
    transparent: true,
    opacity: 0.65,
    clearcoat: 1,
  });
  const jets = 20;
  for (let i = 0; i < jets; i++) {
    const a = (i / jets) * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(a) * 8.5, 0.85, Math.sin(a) * 8.5);
    const to = new THREE.Vector3(Math.cos(a) * 3.2, 0.85, Math.sin(a) * 3.2);
    const mid = from.clone().lerp(to, 0.5).setY(4.2 + (i % 2) * 0.8);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    g.add(mesh(new THREE.TubeGeometry(curve, 32, 0.07, 6), jetMat, { cast: false }));
    const lamp = mesh(new THREE.CircleGeometry(0.18, 16), CM.aquaGlow, { cast: false });
    lamp.rotation.x = -Math.PI / 2;
    lamp.position.set(from.x, 0.76, from.z);
    g.add(lamp);
  }
  g.userData.dynamic = [globe, continents];
  g.userData.update = (t) => {
    globe.rotation.y = t * 0.15;
    continents.rotation.y = t * 0.15;
    water.normalMap.offset.set(t * 0.02, t * 0.013);
  };
  return g;
}

// Geodesic glass greenhouse with a white hexagon frame.
export function biodome(radius, plant) {
  const g = new THREE.Group();
  const shell = mesh(new THREE.SphereGeometry(radius, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), CM.railGlass, { cast: false });
  g.add(shell);
  const ico = new THREE.IcosahedronGeometry(radius * 1.003, 3);
  const edges = new THREE.EdgesGeometry(ico);
  const p = edges.attributes.position;
  const strutGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
  const mats = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < p.count; i += 2) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    if (a.y < -0.01 || b.y < -0.01) continue;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
    mats.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, len, 1)));
  }
  const struts = new THREE.InstancedMesh(strutGeo, CM.white, mats.length);
  mats.forEach((m, i) => struts.setMatrixAt(i, m));
  struts.castShadow = true;
  g.add(struts);
  const base = mesh(new THREE.TorusGeometry(radius, 0.35, 12, 96), CM.white);
  base.rotation.x = Math.PI / 2;
  g.add(base);
  const floor = mesh(new THREE.CircleGeometry(radius - 0.2, 64), CM.lawn, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.05;
  g.add(floor);
  const door = box(3, 3.4, 1.4, CM.tintedGlass, 0.3);
  door.position.set(0, 1.7, radius - 0.2);
  g.add(door);
  plant('oak', new THREE.Vector3(0, 0, 0), 0.75);
  for (let i = 0; i < 7; i++) {
    const ang = i * 0.9;
    plant(i % 2 ? 'ashSmall' : 'bush', new THREE.Vector3(Math.cos(ang) * radius * 0.55, 0, Math.sin(ang) * radius * 0.55), i % 2 ? 0.45 : 0.6);
  }
  return g;
}

export function solarArray(rows, cols) {
  const g = new THREE.Group();
  const panel = box(1.6, 0.06, 1.0, CM.solar, 0.02);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = panel.clone();
      p.position.set((c - (cols - 1) / 2) * 1.8, 0.6, (r - (rows - 1) / 2) * 1.6);
      p.rotation.x = -0.35;
      g.add(p);
      const leg = box(0.06, 0.6, 0.06, CM.silver);
      leg.position.set(p.position.x, 0.3, p.position.z);
      g.add(leg);
    }
  }
  return g;
}
