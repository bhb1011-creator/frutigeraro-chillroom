import * as THREE from 'three';
import { PODIUM } from './layout.js';
import { heightAt } from './terrain.js';

// "Buddy" figures in the style of the classic messenger icons: a round head on a soft,
// bell-shaped body with draped folds, finished in glossy candy-metallic paint.
// They have no limbs, so all motion is procedural: breathing, waddling, squash and stretch.

export const BUDDY_COLORS = {
  blau: 0x1230c8,
  rot: 0xc8160a,
  gold: 0xb89a10,
  tuerkis: 0x1a96aa,
  gruen: 0x4cae14,
  pink: 0xe0409a,
  glas: 0xbff2ff,
};

const BODY_H = 0.9;
const HEAD_R = 0.3;

// Silhouette of the body (radius, height), bottom to neck.
const PROFILE = [
  [0.0, 0.0],
  [0.4, 0.0],
  [0.52, 0.045],
  [0.565, 0.13],
  [0.56, 0.25],
  [0.525, 0.4],
  [0.455, 0.55],
  [0.345, 0.68],
  [0.22, 0.78],
  [0.14, 0.845],
  [0.1, 0.88],
  [0.0, BODY_H],
];

let bodyGeometry = null;
let headGeometry = null;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function buildBody() {
  const curve = new THREE.CatmullRomCurve3(PROFILE.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  const pts = curve.getPoints(64).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  const geo = new THREE.LatheGeometry(pts, 128);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const a = Math.atan2(z, x);
    const h = y / BODY_H;
    // Six soft lobes separated by narrow creases that twist slightly as they run down the body,
    // strongest around the belly and fading out at the neck and the flat base.
    const amount = 0.16 * smoothstep(0.0, 0.16, h) * smoothstep(0.93, 0.4, h);
    const crease = 1 - Math.pow(Math.abs(Math.sin(3 * a + h * 0.9 + 0.3 * Math.sin(2 * a))), 0.45);
    const wobble = 0.018 * Math.sin(2 * a + 1.3) * smoothstep(0.0, 0.5, h);
    const k = 1 - amount * crease + wobble;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function buddyMaterial(color) {
  const glass = color === BUDDY_COLORS.glas;
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: glass ? 0 : 0.78,
    roughness: glass ? 0.03 : 0.17,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: glass ? 2 : 1.35,
    iridescence: glass ? 0.6 : 0.08,
    transparent: glass,
    opacity: glass ? 0.45 : 1,
  });
}

const STATES = {
  idle: { freq: 2.2, sway: 0.0, bounce: 0.0, lean: 0.0, breath: 1 },
  walk: { freq: 9.0, sway: 0.13, bounce: 0.07, lean: 0.07, breath: 0.3 },
  run: { freq: 15.0, sway: 0.09, bounce: 0.15, lean: 0.2, breath: 0.2 },
};

/**
 * Creates one buddy. `color` is a hex value or a key of BUDDY_COLORS. Returns a Group with userData:
 *  play(name), update(dt), pose(name, time) — the same interface the game loop already uses.
 */
export function createBuddy({ color = 'gruen', scale = 1 } = {}) {
  bodyGeometry ??= buildBody();
  headGeometry ??= new THREE.SphereGeometry(HEAD_R, 64, 48);
  const hex = typeof color === 'string' ? BUDDY_COLORS[color] ?? BUDDY_COLORS.gruen : color;
  const mat = buddyMaterial(hex);

  const group = new THREE.Group();
  group.name = 'buddy';
  // Pivot at the base so sway and squash happen around the feet.
  const pivot = new THREE.Group();
  group.add(pivot);
  const body = new THREE.Mesh(bodyGeometry, mat);
  body.castShadow = true;
  body.receiveShadow = true;
  pivot.add(body);
  const neck = new THREE.Group();
  neck.position.y = BODY_H - 0.04;
  pivot.add(neck);
  const head = new THREE.Mesh(headGeometry, mat);
  head.position.y = HEAD_R * 0.86;
  head.scale.set(1, 0.97, 1);
  head.castShadow = true;
  head.receiveShadow = true;
  neck.add(head);
  group.scale.setScalar(scale);

  // Blended animation parameters; `target` is the state being faded towards.
  const params = { ...STATES.idle };
  let target = STATES.idle;
  let phase = 0;
  let time = 0;

  function apply() {
    const step = Math.sin(phase);
    const breathe = Math.sin(time * STATES.idle.freq) * params.breath;
    pivot.rotation.z = step * params.sway;
    pivot.rotation.x = params.lean;
    pivot.position.y = Math.abs(step) * params.bounce;
    // Squash when landing on a foot, stretch in between; plus slow breathing.
    const squash = Math.cos(2 * phase) * params.bounce * 0.5 + breathe * 0.018;
    pivot.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    // The head lags behind the body and looks around a little when idle.
    neck.rotation.z = -step * params.sway * 0.6;
    neck.rotation.x = -params.lean * 0.5 + Math.cos(2 * phase) * params.bounce * 0.3;
    neck.rotation.y = Math.sin(time * 0.45) * 0.35 * params.breath;
  }

  group.userData = {
    state: 'idle',
    play(name) {
      if (!STATES[name]) return;
      group.userData.state = name;
      target = STATES[name];
    },
    update(dt) {
      time += dt;
      const k = 1 - Math.exp(-dt * 6);
      for (const key of Object.keys(params)) params[key] += (target[key] - params[key]) * k;
      phase += dt * params.freq;
      apply();
    },
    pose(name, t) {
      target = STATES[name] ?? STATES.idle;
      Object.assign(params, target);
      group.userData.state = name;
      time = t;
      phase = t * target.freq;
      apply();
    },
  };
  apply();
  return group;
}

// Character line-up: a glossy podium with one buddy of each colour, facing the path.
export function createBuddyPodium(colors = ['blau', 'rot', 'gold', 'tuerkis', 'gruen']) {
  const group = new THREE.Group();
  group.name = 'buddy-podium';
  const y = heightAt(PODIUM.x, PODIUM.z);
  group.position.set(PODIUM.x, y, PODIUM.z);
  const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x6fe6ff, emissive: 0x2fd2ff, emissiveIntensity: 2.2 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(PODIUM.r, PODIUM.r + 0.25, 0.7, 96), white);
  base.position.y = 0.05;
  base.receiveShadow = true;
  base.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(PODIUM.r + 0.02, 0.05, 8, 128), glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.36;
  group.add(base, ring);
  const buddies = colors.map((c, i) => {
    const b = createBuddy({ color: c });
    const a = (i - (colors.length - 1) / 2) * 0.42;
    b.position.set(Math.sin(a) * 2.4, 0.4, -Math.cos(a) * 2.4 + 1.2);
    // Face the front of the podium (+z), turned slightly towards the middle.
    b.rotation.y = -a * 0.6;
    group.add(b);
    return b;
  });
  group.userData.buddies = buddies;
  group.userData.update = (t) => {
    buddies.forEach((b, i) => b.userData.pose('idle', t + i * 0.9));
  };
  return group;
}
