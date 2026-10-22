import * as THREE from 'three';
import { CM, mesh, box, circle, slab, prismWall, facadeMaterial } from './parts.js';

// The duel tower's roof: a cantilevered deck with a wide pool, and above it a round,
// helipad-like fighting platform on a single column. Whoever is pushed off splashes into the pool.

export const ARENA = {
  deckRadius: 17,
  poolRadius: 16,
  platformRadius: 8,
  platformHeight: 7, // above the deck
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Helipad-style markings: aqua rings, two start spots and a crossed-swords emblem.
function platformTexture() {
  return canvasTexture(1024, 1024, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f4fbff';
    g.fillRect(0, 0, w, w);
    const ring = (r, width, color) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    };
    ring(c - 22, 34, '#14a8e6');
    ring(c - 62, 8, '#8fdcff');
    ring(250, 16, '#14a8e6');
    // Start spots left and right.
    for (const s of [-1, 1]) {
      const x = c + s * 300;
      const grad = g.createRadialGradient(x, c, 5, x, c, 70);
      grad.addColorStop(0, s < 0 ? '#9dff7a' : '#ff9ad0');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, c, 70, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = s < 0 ? '#3fc21e' : '#e0409a';
      g.lineWidth = 8;
      g.beginPath();
      g.arc(x, c, 62, 0, Math.PI * 2);
      g.stroke();
    }
    // Crossed swords in the middle: two rounded blades with guards and grips.
    for (const [x0, y0, x1, y1] of [[-170, -170, 120, 120], [170, -170, -120, 120]]) {
      const grad = g.createLinearGradient(x0 + c, y0 + c, x1 + c, y1 + c);
      grad.addColorStop(0, '#8fe8ff');
      grad.addColorStop(1, '#1a9fe0');
      g.strokeStyle = grad;
      g.lineCap = 'round';
      g.lineWidth = 40;
      g.beginPath();
      g.moveTo(c + x0, c + y0);
      g.lineTo(c + x1, c + y1);
      g.stroke();
      const nx = -(y1 - y0);
      const ny = x1 - x0;
      const len = Math.hypot(nx, ny);
      g.strokeStyle = '#0b6fb8';
      g.lineWidth = 22;
      g.beginPath();
      g.moveTo(c + x1 + (nx / len) * 60, c + y1 + (ny / len) * 60);
      g.lineTo(c + x1 - (nx / len) * 60, c + y1 - (ny / len) * 60);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 26;
      g.beginPath();
      g.moveTo(c + x1, c + y1);
      g.lineTo(c + x1 + (x1 - x0) * 0.22, c + y1 + (y1 - y0) * 0.22);
      g.stroke();
    }
  });
}

// Glossy "AERO-DUELL" band for the top of the tower.
function signTexture() {
  return canvasTexture(2048, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#9ff0ff');
    grad.addColorStop(0.48, '#22b8f0');
    grad.addColorStop(0.52, '#0f8fd8');
    grad.addColorStop(1, '#3fd0ff');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, 0, w, h * 0.46);
    g.font = 'bold 150px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const x of [w * 0.25, w * 0.75]) {
      g.fillStyle = 'rgba(0,60,110,0.35)';
      g.fillText('AERO-DUELL', x + 4, h / 2 + 6);
      g.fillStyle = '#ffffff';
      g.fillText('AERO-DUELL', x, h / 2);
    }
  });
}

function arenaTop(group, deckY) {
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x22c4f0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.78,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.6,
  });
  // Cantilevered deck and pool basin.
  group.add(mesh(slab(circle(ARENA.deckRadius, 96), deckY - 0.6, 0.6, { bevel: 0.12 }), CM.white));
  group.add(mesh(prismWall(circle(ARENA.deckRadius, 96), deckY, deckY + 1.1), CM.white));
  group.add(mesh(prismWall(circle(ARENA.deckRadius - 0.35, 96), deckY, deckY + 1.1, { inward: true }), CM.white));
  const rim = mesh(new THREE.TorusGeometry(ARENA.deckRadius - 0.17, 0.22, 12, 160), CM.white);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = deckY + 1.1;
  group.add(rim);
  group.add(mesh(slab(circle(ARENA.poolRadius + 0.6, 96), deckY, 0.05), CM.aqua, { cast: false }));
  const surface = mesh(new THREE.CircleGeometry(ARENA.poolRadius + 0.6, 96), water, { cast: false });
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = deckY + 0.85;
  group.add(surface);
  // Underwater lights.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = mesh(new THREE.CircleGeometry(0.4, 20), CM.aquaGlow, { cast: false });
    l.rotation.x = -Math.PI / 2;
    l.position.set(Math.cos(a) * 12.5, deckY + 0.08, Math.sin(a) * 12.5);
    group.add(l);
  }

  // Column and the fighting platform.
  const py = deckY + ARENA.platformHeight;
  const column = mesh(new THREE.CylinderGeometry(1.6, 2.4, ARENA.platformHeight, 48), CM.white);
  column.position.y = deckY + ARENA.platformHeight / 2;
  group.add(column);
  for (let i = 0; i < 4; i++) {
    const band = mesh(new THREE.TorusGeometry(1.7 + i * 0.15, 0.08, 8, 48), CM.aquaGlow, { cast: false });
    band.rotation.x = Math.PI / 2;
    band.position.y = deckY + 1.5 + i * 1.4;
    group.add(band);
  }
  const markings = new THREE.MeshPhysicalMaterial({ map: platformTexture(), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const top = mesh(new THREE.CircleGeometry(ARENA.platformRadius, 128), markings, { cast: false });
  top.rotation.x = -Math.PI / 2;
  top.position.y = py + 0.01;
  group.add(top);
  const disc = mesh(new THREE.CylinderGeometry(ARENA.platformRadius, ARENA.platformRadius - 0.6, 0.8, 128), CM.white);
  disc.position.y = py - 0.4;
  group.add(disc);
  const edge = mesh(new THREE.TorusGeometry(ARENA.platformRadius - 0.02, 0.1, 10, 160), CM.aquaGlow, { cast: false });
  edge.rotation.x = Math.PI / 2;
  edge.position.y = py + 0.02;
  group.add(edge);
  const under = mesh(new THREE.TorusGeometry(ARENA.platformRadius - 0.5, 0.12, 10, 160), CM.aquaGlow, { cast: false });
  under.rotation.x = Math.PI / 2;
  under.position.y = py - 0.82;
  group.add(under);

  // Floodlight masts around the deck.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const r = ARENA.deckRadius - 0.6;
    const mast = mesh(new THREE.CylinderGeometry(0.12, 0.2, 9, 12), CM.white);
    mast.position.set(Math.cos(a) * r, deckY + 5.6, Math.sin(a) * r);
    const head = box(1.6, 0.5, 0.5, CM.white, 0.15);
    head.position.set(Math.cos(a) * r, deckY + 10.2, Math.sin(a) * r);
    head.lookAt(0, deckY + 4, 0);
    const lamp = mesh(new THREE.PlaneGeometry(1.4, 0.35), CM.lightPanel, { cast: false });
    lamp.position.copy(head.position).lerp(new THREE.Vector3(0, head.position.y, 0), 0.02);
    lamp.lookAt(0, deckY + 4, 0);
    group.add(mast, head, lamp);
  }

  group.userData.arena = { platformY: py, deckY, poolY: deckY + 0.85 };
}

// ---------- The tower body ----------
// A chalice silhouette: the glass shaft narrows to a waist with a sky garden, then flares out into
// a trumpet that carries the pool deck. A white diagrid exoskeleton wraps the whole shaft.

const SHAFT_HEIGHT = 76;
const FLOORS = 21;

function shaftRadius(t) {
  const waist = 1 - Math.pow(Math.abs(t - 0.52) / 0.52, 1.6);
  return 11 - 2.6 * waist + 1.6 * Math.pow(Math.max(0, t - 0.75) / 0.25, 2);
}

function latheFrom(fn, t0, t1, y0, steps, segments = 96) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    pts.push(new THREE.Vector2(fn(t), y0 + t * SHAFT_HEIGHT));
  }
  return new THREE.LatheGeometry(pts, segments);
}

// Facade material with its own texture repeat (the shared facade textures stay untouched).
function shaftFacade() {
  const m = facadeMaterial({ hue: 182, seed: 41, lit: 0.03, cols: 12, rows: 6 });
  for (const key of ['map', 'roughnessMap', 'emissiveMap']) {
    m[key] = m[key].clone();
    m[key].repeat.set(4, FLOORS / 6);
    m[key].needsUpdate = true;
  }
  return m;
}

function strut(a, b, radius, matrices) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  matrices.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(radius, dir.length(), radius)));
}

export function arenaCrown({ group, topY }) {
  const y0 = topY - 0.2; // top of the podium canopy
  const yTop = y0 + SHAFT_HEIGHT;
  const facade = shaftFacade();
  const gardenFrom = 0.48;
  const gardenTo = 0.56;

  // Glass shaft in two parts with the sky garden's clear glass band between them.
  const lower = latheFrom(shaftRadius, 0, gardenFrom, y0, 40);
  const upper = latheFrom(shaftRadius, gardenTo, 1, y0, 40);
  // Lathe UVs run 0..1 over each part; rescale v so the floors line up across both parts.
  for (const [geo, t0, t1] of [[lower, 0, gardenFrom], [upper, gardenTo, 1]]) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, t0 + uv.getY(i) * (t1 - t0));
  }
  group.add(mesh(lower, facade), mesh(upper, facade));
  group.add(mesh(latheFrom((t) => shaftRadius(t) + 0.05, gardenFrom, gardenTo, y0, 8), CM.clearGlass, { cast: false }));

  // Sky garden: lawn, a white core, glowing light rings.
  const gy0 = y0 + gardenFrom * SHAFT_HEIGHT;
  const gy1 = y0 + gardenTo * SHAFT_HEIGHT;
  const gr = shaftRadius((gardenFrom + gardenTo) / 2);
  group.add(mesh(slab(circle(gr - 0.2, 72), gy0 - 0.4, 0.4), CM.white));
  group.add(mesh(slab(circle(gr - 0.6, 72), gy0, 0.12), CM.lawn, { cast: false }));
  group.add(mesh(slab(circle(gr - 0.2, 72), gy1 - 0.2, 0.4), CM.white));
  const core = mesh(new THREE.CylinderGeometry(3.4, 3.4, gy1 - gy0, 48), CM.white);
  core.position.y = (gy0 + gy1) / 2;
  group.add(core);
  for (const y of [gy0 + 0.5, gy1 - 0.4]) {
    const ring = mesh(new THREE.TorusGeometry(gr - 0.8, 0.08, 8, 96), CM.aquaGlow, { cast: false });
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bush = mesh(new THREE.SphereGeometry(0.7 + (i % 3) * 0.2, 16, 12), i % 2 ? CM.lime : CM.lawn);
    bush.scale.y = 0.7;
    bush.position.set(Math.cos(a) * (gr - 2.2), gy0 + 0.5, Math.sin(a) * (gr - 2.2));
    group.add(bush);
  }

  // Thin white floor bands following the curve.
  const floorH = SHAFT_HEIGHT / FLOORS;
  for (let f = 1; f < FLOORS; f++) {
    const t = (f * floorH) / SHAFT_HEIGHT;
    if (t > gardenFrom - 0.01 && t < gardenTo + 0.01) continue;
    const band = mesh(new THREE.TorusGeometry(shaftRadius(t) + 0.08, 0.1, 6, 120), CM.white, { cast: false });
    band.rotation.x = Math.PI / 2;
    band.position.y = y0 + f * floorH;
    group.add(band);
  }

  // Diagrid exoskeleton: rings of nodes every three floors, alternately offset, joined diagonally.
  const nodesAround = 14;
  const rows = 7;
  const diagridTop = 0.86;
  const node = (k, i) => {
    const t = (k / rows) * diagridTop;
    const a = ((i + (k % 2) * 0.5) / nodesAround) * Math.PI * 2;
    const r = shaftRadius(t) + 0.6;
    return new THREE.Vector3(Math.cos(a) * r, y0 + t * SHAFT_HEIGHT, Math.sin(a) * r);
  };
  const members = [];
  const joints = [];
  for (let k = 0; k <= rows; k++) {
    for (let i = 0; i < nodesAround; i++) {
      const p = node(k, i);
      joints.push(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      if (k === rows) continue;
      const shift = k % 2 ? 1 : 0;
      strut(p, node(k + 1, i + shift), 0.2, members);
      strut(p, node(k + 1, i - 1 + shift), 0.2, members);
    }
  }
  const instanced = (geo, matrices) => {
    const im = new THREE.InstancedMesh(geo, CM.white, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  };
  group.add(instanced(new THREE.CylinderGeometry(1, 1, 1, 10), members));
  group.add(instanced(new THREE.SphereGeometry(0.34, 14, 10), joints));
  // A crown ring where the diagrid ends.
  const crown = mesh(new THREE.TorusGeometry(shaftRadius(diagridTop) + 0.6, 0.28, 12, 120), CM.white);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = y0 + diagridTop * SHAFT_HEIGHT;
  group.add(crown);

  // Glowing sign band between the diagrid and the flare.
  const st = 0.92;
  const sr = shaftRadius(st) + 0.35;
  const signTex = signTexture();
  const sign = mesh(
    new THREE.CylinderGeometry(sr, sr, 3.2, 96, 1, true),
    new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.55, side: THREE.DoubleSide }),
    { cast: false },
  );
  sign.position.y = y0 + st * SHAFT_HEIGHT;
  group.add(sign);

  // Trumpet flare from the top of the shaft out to the deck, with glowing lines.
  const flareH = 4.5;
  const r1 = shaftRadius(1);
  const flarePts = [];
  for (let i = 0; i <= 24; i++) {
    const s = i / 24;
    flarePts.push(new THREE.Vector2(r1 + (ARENA.deckRadius - r1) * Math.pow(s, 2.4), yTop - 0.6 - flareH + flareH * s));
  }
  group.add(mesh(new THREE.LatheGeometry(flarePts, 128), CM.white));
  for (const s of [0.35, 0.6, 0.82]) {
    const ring = mesh(new THREE.TorusGeometry(r1 + (ARENA.deckRadius - r1) * Math.pow(s, 2.4) + 0.05, 0.07, 8, 128), CM.aquaGlow, { cast: false });
    ring.rotation.x = Math.PI / 2;
    ring.position.y = yTop - 0.6 - flareH + flareH * s;
    group.add(ring);
  }

  arenaTop(group, yTop);
}

// Terminal screen: title, crossed swords and a call to action.
function terminalTexture() {
  return canvasTexture(512, 768, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1c8fe8');
    bg.addColorStop(0.55, '#6fd2ff');
    bg.addColorStop(1, '#b8f58a');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const gloss = g.createLinearGradient(0, 0, 0, 120);
    gloss.addColorStop(0, 'rgba(255,255,255,0.85)');
    gloss.addColorStop(1, 'rgba(255,255,255,0.15)');
    g.fillStyle = gloss;
    g.fillRect(0, 0, w, 120);
    g.textAlign = 'center';
    g.fillStyle = '#0b3f66';
    g.font = 'bold 64px "Segoe UI", Arial, sans-serif';
    g.fillText('AERO-DUELL', w / 2, 82);
    g.save();
    g.translate(w / 2, 360);
    for (const a of [-0.7, 0.7]) {
      g.save();
      g.rotate(a);
      const s = g.createLinearGradient(-18, 0, 18, 0);
      s.addColorStop(0, '#bff4ff');
      s.addColorStop(0.5, '#ffffff');
      s.addColorStop(1, '#4fc8ff');
      g.fillStyle = s;
      g.beginPath();
      g.roundRect(-18, -170, 36, 230, 18);
      g.fill();
      g.fillStyle = '#0b6fb8';
      g.fillRect(-50, 62, 100, 18);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.roundRect(-12, 80, 24, 60, 10);
      g.fill();
      g.restore();
    }
    g.restore();
    g.fillStyle = '#ffffff';
    g.font = 'bold 40px "Segoe UI", Arial, sans-serif';
    g.fillText('Hier starten', w / 2, 620);
    g.font = '28px "Segoe UI", Arial, sans-serif';
    g.fillText('3 Runden · Wer fällt, verliert', w / 2, 672);
  });
}

/** Glass kiosk in the lobby where the duel menu opens. */
export function duelTerminal() {
  const g = new THREE.Group();
  const base = box(1.6, 0.2, 1.2, CM.white, 0.08);
  base.position.y = 0.1;
  const body = box(1.2, 2.2, 0.5, CM.white, 0.22);
  body.position.y = 1.3;
  const screen = mesh(
    new THREE.PlaneGeometry(0.95, 1.35),
    new THREE.MeshStandardMaterial({ map: terminalTexture(), emissive: 0xffffff, emissiveMap: terminalTexture(), emissiveIntensity: 0.75 }),
    { cast: false },
  );
  screen.position.set(0, 1.45, 0.256);
  const halo = mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 64), CM.aquaGlow, { cast: false });
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.22;
  g.add(base, body, screen, halo);
  return g;
}
