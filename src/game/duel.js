import * as THREE from 'three';
import { createBuddy } from '../world/character.js';
import { audio } from '../audio/engine.js';
import { el } from './ui.js';

// Aero-Duell: two buddies with foam swords on the rooftop platform. A hit pushes the other one
// back, and every hit taken makes the next push stronger. Whoever lands in the pool loses the
// round. Always three rounds; most rounds won takes the match.
//
// Against a friend the inviting player hosts: their game runs the whole simulation, takes the
// guest's input over the network and streams the state back. The guest only shows that state,
// so both always see the same fight.

export const DIFFICULTY = {
  leicht: { label: 'Leicht', reaction: 0.6, block: 0.15, attackEvery: [1.3, 2.3], edgeCare: 0.45, speed: 2.4 },
  normal: { label: 'Normal', reaction: 0.42, block: 0.3, attackEvery: [0.95, 1.7], edgeCare: 0.75, speed: 2.8 },
  profi: { label: 'Profi', reaction: 0.18, block: 0.7, attackEvery: [0.45, 0.95], edgeCare: 1, speed: 3.3 },
};

// Swings: "links" comes in from the left, "rechts" from the right, "oben" is an overhead chop.
const ATTACKS = {
  links: { windup: 0.16, active: 0.12, recover: 0.3, push: 1.0, side: 1, damage: 11 },
  rechts: { windup: 0.16, active: 0.12, recover: 0.3, push: 1.0, side: -1, damage: 11 },
  oben: { windup: 0.26, active: 0.12, recover: 0.38, push: 1.35, side: 0, damage: 16 },
};

// Sword poses as [yaw, pitch] of the swing pivot.
const POSE = {
  rest: [-0.45, -0.75],
  block: [0.15, -1.35],
  stagger: [-0.9, 0.35],
  windup: { links: [1.9, -0.2], rechts: [-1.9, -0.2], oben: [0, -2.3] },
  strike: { links: [-1.3, -0.1], rechts: [1.3, -0.1], oben: [0, 0.45] },
};

const ROUNDS = 3;
const ROUND_TIME = 75;
const REACH = 2.7;
const MOVE_SPEED = 3.2;

const rand = (a, b) => a + Math.random() * (b - a);
const SEND_EVERY = 1 / 30;
const STATES = ['idle', 'block', 'windup', 'active', 'recover', 'stagger', 'fall'];
const DIRS = Object.keys(ATTACKS);
const round2 = (v) => Math.round(v * 100) / 100;

/** Both sides pick the same colours: the guest switches if it would look like the host. */
export function duelColors(hostColor, guestColor) {
  return [hostColor, guestColor === hostColor ? (hostColor === 'rot' ? 'blau' : 'rot') : guestColor];
}

function swordRig(color) {
  const swing = new THREE.Group();
  swing.rotation.order = 'YXZ';
  swing.position.y = 0.95;
  const arm = new THREE.Group();
  arm.position.set(0.42, 0, 0.12);
  swing.add(arm);
  const glove = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 20, 14),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1 }),
  );
  const foam = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.6, sheen: 1, sheenColor: 0xffffff, emissive: color, emissiveIntensity: 0.12 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x15476e, roughness: 0.5 }));
  grip.rotation.x = Math.PI / 2;
  grip.position.z = 0.05;
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 24), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1 }));
  guard.position.z = 0.2;
  const blade = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 1.0, 8, 20), foam);
  blade.rotation.x = Math.PI / 2;
  blade.position.z = 0.78;
  for (const m of [glove, grip, guard, blade]) {
    m.castShadow = true;
    arm.add(m);
  }
  return { swing, blade };
}

class Fighter {
  constructor(color, swordColor) {
    this.buddy = createBuddy({ color });
    const rig = swordRig(swordColor);
    this.swing = rig.swing;
    this.buddy.add(this.swing);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.pose = [...POSE.rest];
    this.reset(new THREE.Vector3(), 0);
  }

  reset(pos, facing) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.state = 'idle';
    this.timer = 0;
    this.attack = null;
    this.damage = 0;
    this.blockSince = 0;
    this.splashed = false;
    this.move = new THREE.Vector3();
  }

  get busy() {
    return ['windup', 'active', 'recover', 'stagger', 'fall'].includes(this.state);
  }

  startAttack(dir, now) {
    if (this.busy) return false;
    this.state = 'windup';
    this.attack = dir;
    this.timer = 0;
    return true;
  }

  setBlock(on, now) {
    if (this.busy) return;
    if (on && this.state !== 'block') {
      this.state = 'block';
      this.blockSince = now;
    } else if (!on && this.state === 'block') {
      this.state = 'idle';
    }
  }

  // Sword pose follows the state; strikes sweep from the wind-up pose to the strike pose.
  updatePose(dt) {
    let target = POSE.rest;
    let snap = false;
    if (this.state === 'block') target = POSE.block;
    else if (this.state === 'stagger') target = POSE.stagger;
    else if (this.state === 'windup') target = POSE.windup[this.attack];
    else if (this.state === 'active') {
      const a = ATTACKS[this.attack];
      const k = Math.min(1, this.timer / a.active);
      const w = POSE.windup[this.attack];
      const s = POSE.strike[this.attack];
      this.pose = [w[0] + (s[0] - w[0]) * k, w[1] + (s[1] - w[1]) * k];
      snap = true;
    } else if (this.state === 'recover') target = POSE.strike[this.attack];
    if (!snap) {
      const f = 1 - Math.exp(-dt * (this.state === 'windup' ? 22 : 12));
      this.pose[0] += (target[0] - this.pose[0]) * f;
      this.pose[1] += (target[1] - this.pose[1]) * f;
    }
    this.swing.rotation.y = this.pose[0];
    this.swing.rotation.x = this.pose[1];
  }

  sync(dt) {
    this.buddy.position.copy(this.pos);
    let d = this.facing - this.buddy.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.buddy.rotation.y += d * Math.min(1, dt * 12);
    const moving = this.move.lengthSq() > 0.01 && this.state !== 'fall';
    this.buddy.userData.play(this.state === 'fall' ? 'run' : moving ? 'walk' : 'idle');
    this.buddy.userData.update(dt);
    this.updatePose(dt);
  }
}

// Little bursts of glossy spheres for hits, parries and splashes.
class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.SphereGeometry(1, 10, 8);
  }

  burst(at, { count = 12, color = 0xffffff, speed = 4, size = 0.08, up = 1, gravity = 6, life = 0.6 }) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, transparent: true });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo, mat);
      m.scale.setScalar(size * rand(0.6, 1.4));
      m.position.copy(at);
      const v = new THREE.Vector3(rand(-1, 1), rand(0, 1) * up, rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.5, 1));
      this.scene.add(m);
      this.items.push({ m, v, life, max: life, gravity });
    }
  }

  ring(at, color = 0x8fe8ff) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), new THREE.MeshStandardMaterial({ color, emissive: color, transparent: true }));
    m.rotation.x = Math.PI / 2;
    m.position.copy(at);
    this.scene.add(m);
    this.items.push({ m, ring: true, life: 0.9, max: 0.9 });
  }

  update(dt) {
    for (const it of this.items) {
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      if (it.ring) {
        it.m.scale.setScalar(0.5 + (1 - k) * 3.5);
      } else {
        it.v.y -= it.gravity * dt;
        it.m.position.addScaledVector(it.v, dt);
      }
      it.m.material.opacity = k;
    }
    for (const it of this.items.filter((i) => i.life <= 0)) {
      this.scene.remove(it.m);
      if (it.ring) it.m.geometry.dispose();
    }
    this.items = this.items.filter((i) => i.life > 0);
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.m);
    this.items = [];
  }
}

export class DuelGame {
  constructor({ scene, camera, dom, arena, input }) {
    this.scene = scene;
    this.camera = camera;
    this.dom = dom;
    this.arena = arena; // { center, poolY, radius, axis }
    this.input = input; // { keys: Set, joystick: Vector2 }
    this.active = false;
    this.effects = new Effects(scene);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.shake = 0;
    this.time = 0;
    this.unsubscribe = [];
    this.bindInput();
  }

  // ---------- Input: swipe to swing, hold right mouse / Space / button to block ----------
  bindInput() {
    let start = null;
    this.blockHeld = false;
    this.dom.addEventListener('pointerdown', (e) => {
      if (!this.active || e.target !== this.dom) return;
      if (e.button === 2) {
        this.blockHeld = true;
        return;
      }
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    this.dom.addEventListener('pointerup', (e) => {
      if (!this.active) return;
      if (e.button === 2) {
        this.blockHeld = false;
        return;
      }
      if (!start || start.id !== e.pointerId) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      let dir = 'oben';
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 25) dir = dx > 0 ? 'links' : 'rechts';
      this.queuedAttack = dir;
    });
    this.dom.addEventListener('contextmenu', (e) => this.active && e.preventDefault());
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'KeyJ' || e.code === 'KeyQ') this.queuedAttack = 'links';
      if (e.code === 'KeyL' || e.code === 'KeyE') this.queuedAttack = 'rechts';
      if (e.code === 'KeyI' || e.code === 'KeyK' || e.code === 'KeyF') this.queuedAttack = 'oben';
      if (e.code === 'Space') {
        this.blockHeld = true;
        e.preventDefault();
      }
      if (e.code === 'Escape') this.leave();
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.blockHeld = false;
    });
  }

  /**
   * Starts a match. Against the bot: { difficulty, color, onExit }.
   * Against a friend: { color, onExit, online: { role: 'host' | 'guest', net, peer, foeName, foeColor } }.
   */
  start({ difficulty = 'normal', color = 'gruen', onExit, online = null }) {
    this.cleanup();
    this.online = online;
    this.role = online ? online.role : 'bot';
    this.me = this.role === 'guest' ? 1 : 0;
    this.difficulty = difficulty;
    this.ai = online ? null : DIFFICULTY[difficulty];
    this.foeName = online ? online.foeName : `Bot · ${this.ai.label}`;
    this.onExit = onExit;
    this.active = true;
    this.color = color;
    const colors = online
      ? this.role === 'host'
        ? duelColors(color, online.foeColor)
        : duelColors(online.foeColor, color)
      : [color, color === 'rot' ? 'blau' : 'rot'];
    this.fighters = [new Fighter(colors[0], 0x5fe0ff), new Fighter(colors[1], 0xff7ab8)];
    for (const f of this.fighters) this.scene.add(f.buddy);
    this.score = [0, 0];
    this.round = 0;
    // Hits landed / blocked per fighter (handy for tuning and tests).
    this.stats = { hits: [0, 0], blocked: [0, 0], parried: [0, 0] };
    this.events = [];
    this.sendTimer = 0;
    this.remote = { move: new THREE.Vector3(), block: false, attack: null };
    this.foeLeft = false;
    this.rematch = [false, false];
    this.buildHud();
    audio.play('duell');
    if (online) this.listen(online);
    if (this.role === 'guest') {
      // The host's first state places everyone; until then stand on the start spots.
      this.round = 1;
      this.phase = 'countdown';
      this.phaseTime = 0;
      this.roundTime = ROUND_TIME;
      this.placeFighters();
      this.updateHud();
    } else {
      this.nextRound();
    }
    this.camPos.set(0, 0, 0);
  }

  listen({ net, peer }) {
    const from = (fn) => (data, id) => id === peer && this.active && fn(data ?? {});
    this.unsubscribe.push(
      net.on('dstate', from((s) => this.role === 'guest' && this.applyState(s))),
      net.on('dinput', from((i) => this.role === 'host' && this.applyRemoteInput(i))),
      net.on('duel', from((m) => {
        if (m.t === 'leave') this.opponentLeft();
        if (m.t === 'rematch') this.wantRematch(1 - this.me);
        if (m.t === 'restart' && this.role === 'guest') this.restart();
      })),
      net.on('leave', (id) => id === peer && this.active && this.opponentLeft()),
    );
  }

  cleanup() {
    this.unsubscribe.forEach((u) => u());
    this.unsubscribe = [];
    for (const f of this.fighters ?? []) this.scene.remove(f.buddy);
    this.effects.clear();
    this.hud?.remove();
    this.hud = null;
    this.result?.remove();
    this.result = null;
    clearTimeout(this.msgTimer);
  }

  leave() {
    if (!this.active) return;
    if (this.online && !this.foeLeft) this.online.net.send('duel', { t: 'leave' }, this.online.peer);
    this.active = false;
    this.cleanup();
    this.onExit?.();
  }

  placeFighters() {
    const { center, axis } = this.arena;
    const spot = 4.7;
    const [p, b] = this.fighters;
    p.reset(center.clone().addScaledVector(axis, -spot), Math.atan2(axis.x, axis.z));
    b.reset(center.clone().addScaledVector(axis, spot), Math.atan2(-axis.x, -axis.z));
    p.buddy.rotation.y = p.facing;
    b.buddy.rotation.y = b.facing;
    for (const f of this.fighters) f.shown = f.pos.clone();
  }

  nextRound() {
    this.round++;
    this.placeFighters();
    if (this.ai) this.bot = { cooldown: rand(...this.ai.attackEvery) + 1, reactAt: null, sawWindup: false, blockUntil: 0, strafe: Math.random() < 0.5 ? 1 : -1 };
    this.phase = 'countdown';
    this.phaseTime = 0;
    this.roundTime = ROUND_TIME;
    this.lastCount = 4;
    this.updateHud();
    this.fx('round', { n: this.round });
  }

  // ---------- Effects and sounds: played here, and streamed to the guest when hosting ----------
  fx(type, data = {}) {
    if (this.role === 'host') this.events.push([type, data]);
    this.playFx(type, data);
  }

  playFx(type, d) {
    const at = (v) => new THREE.Vector3(v?.[0] ?? 0, v?.[1] ?? 0, v?.[2] ?? 0);
    const me = this.me;
    switch (type) {
      case 'swing':
        audio.swing(d.s ?? 1);
        break;
      case 'parry':
        audio.parry();
        this.effects.burst(at(d.at), { count: 16, color: 0xfff6a0, speed: 4, size: 0.07 });
        break;
      case 'block':
        audio.block();
        this.effects.burst(at(d.at), { count: 8, color: 0xbff4ff, speed: 3, size: 0.06 });
        break;
      case 'hit':
        audio.hit(d.s ?? 1);
        this.effects.burst(at(d.at), { count: 14, color: d.target === me ? 0xff9ad0 : 0x9dff7a, speed: 5, size: 0.08 });
        this.shake = Math.min(0.35, 0.1 + (d.s ?? 0) * 9 * 0.02);
        break;
      case 'fall':
        audio.fall();
        break;
      case 'splash':
        audio.splash();
        this.effects.burst(at(d.at), { count: 34, color: 0xbff4ff, speed: 6, size: 0.12, up: 2.2, gravity: 12, life: 1.1 });
        this.effects.ring(at(d.at).setY((d.at?.[1] ?? 0) + 0.05));
        break;
      case 'round':
        this.message(`Runde ${d.n}`, 0.9);
        break;
      case 'count':
        this.message(String(d.n), 0.7);
        audio.countdown(false);
        break;
      case 'go':
        this.message('Los!', 0.8);
        audio.countdown(true);
        break;
      case 'roundEnd': {
        const won = d.w === me;
        const lost = won ? 'Runde für dich!' : this.online ? `Runde für ${this.foeName}` : 'Runde für den Bot';
        this.message(d.reason ? `${d.reason} ${lost}` : won ? 'Runde gewonnen!' : 'Runde verloren', 2);
        audio.roundWon(won);
        break;
      }
      case 'done':
        this.phase = 'done';
        this.showResult();
        break;
    }
  }

  // ---------- HUD ----------
  buildHud() {
    const foe = this.foeName.replace(/[<>&"']/g, '');
    this.hud = el(`
      <div class="aero" style="position:fixed;inset:0;pointer-events:none;z-index:15">
        <div class="aero-glass" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:18px;align-items:center;padding:8px 18px;white-space:nowrap">
          <div style="text-align:center"><div style="font-weight:600">Du</div><div class="dots-p"></div><div class="dmg-p" style="font-size:22px;font-weight:700">0%</div></div>
          <div style="text-align:center"><div class="round" style="font-weight:600">Runde 1 / 3</div><div class="clock" style="font-size:13px">75</div></div>
          <div style="text-align:center"><div style="font-weight:600">${foe}</div><div class="dots-b"></div><div class="dmg-b" style="font-size:22px;font-weight:700">0%</div></div>
        </div>
        <div class="msg aero-big" style="position:absolute;top:38%;left:0;right:0;text-align:center;opacity:0;transition:opacity 0.25s"></div>
        <div class="aero-glass help" style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);padding:6px 14px;font-size:13px;white-space:nowrap;opacity:0.9">
          Wischen / J L I: Schlag · Rechtsklick / Leertaste: Blocken · WASD: bewegen · Esc: Aufgeben
        </div>
        <button class="aero-btn block-btn" style="position:absolute;right:28px;bottom:96px;width:84px;height:84px;padding:0;display:none">Block</button>
      </div>`);
    document.body.appendChild(this.hud);
    const blockBtn = this.hud.querySelector('.block-btn');
    if (matchMedia('(pointer: coarse)').matches) {
      blockBtn.style.display = 'block';
      this.hud.querySelector('.help').textContent = 'Wischen: Schlag · Knopf halten: Blocken · Joystick: bewegen';
    }
    blockBtn.addEventListener('pointerdown', () => (this.blockHeld = true));
    blockBtn.addEventListener('pointerup', () => (this.blockHeld = false));
    blockBtn.addEventListener('pointercancel', () => (this.blockHeld = false));
  }

  updateHud() {
    if (!this.hud) return;
    const me = this.me;
    const foe = 1 - me;
    const dots = (n, color) =>
      Array.from({ length: ROUNDS }, (_, i) => `<span style="display:inline-block;width:12px;height:12px;margin:2px;border-radius:50%;border:1px solid #fff;background:${i < n ? color : 'rgba(255,255,255,0.3)'}"></span>`).join('');
    const set = (sel, html, prop = 'textContent') => {
      const node = this.hud.querySelector(sel);
      if (node[prop] !== html) node[prop] = html;
    };
    set('.dots-p', dots(this.score[me], '#7fdc4a'), 'innerHTML');
    set('.dots-b', dots(this.score[foe], '#ff8cc8'), 'innerHTML');
    set('.round', `Runde ${Math.min(this.round, ROUNDS)} / ${ROUNDS}`);
    set('.dmg-p', `${Math.round(this.fighters[me].damage)}%`);
    set('.dmg-b', `${Math.round(this.fighters[foe].damage)}%`);
    set('.clock', `${Math.max(0, Math.ceil(this.roundTime))} s`);
  }

  message(text, seconds = 1) {
    const m = this.hud?.querySelector('.msg');
    if (!m) return;
    m.textContent = text;
    m.style.opacity = 1;
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => (m.style.opacity = 0), seconds * 1000);
  }

  showResult() {
    if (this.result) return;
    const me = this.me;
    const won = this.score[me] > this.score[1 - me];
    const foe = this.foeName.replace(/[<>&"']/g, '');
    audio.play(won ? 'sieg' : 'niederlage', { loop: false, then: 'lobby' });
    const text = this.online
      ? won
        ? `Du hast ${foe} ins Becken geschickt!`
        : `${foe} gewinnt – Revanche?`
      : won
        ? 'Stark gekämpft – der Bot ist baden gegangen!'
        : 'Knapp! Versuch es gleich nochmal.';
    this.result = el(`
      <div class="aero aero-overlay">
        <div class="aero-glass aero-panel">
          <h1>${won ? 'Sieg!' : 'Niederlage'}</h1>
          <p style="font-size:34px;font-weight:700;margin:8px 0">${this.score[me]} : ${this.score[1 - me]}</p>
          <p>${text}</p>
          <p class="status" style="min-height:1.2em;font-size:13px"></p>
          <div class="aero-row">
            <button class="aero-btn green again">${this.online ? 'Revanche' : 'Nochmal'}</button>
            <button class="aero-btn back">Zurück zur Lobby</button>
          </div>
        </div>
      </div>`);
    document.body.appendChild(this.result);
    if (this.foeLeft) this.markFoeLeft();
    this.result.querySelector('.again').addEventListener('click', () => {
      audio.select();
      if (!this.online) {
        this.restart();
        return;
      }
      this.online.net.send('duel', { t: 'rematch' }, this.online.peer);
      this.wantRematch(me);
    });
    this.result.querySelector('.back').addEventListener('click', () => {
      audio.select();
      this.leave();
    });
  }

  wantRematch(who) {
    this.rematch[who] = true;
    const status = this.result?.querySelector('.status');
    if (status) status.textContent = this.rematch[this.me] ? `Warte auf ${this.foeName} …` : `${this.foeName} will eine Revanche!`;
    if (this.rematch[this.me]) this.result?.querySelector('.again')?.setAttribute('disabled', '');
    // The host restarts once both want to play again, and tells the guest to follow.
    if (this.role === 'host' && this.rematch[0] && this.rematch[1]) {
      this.online.net.send('duel', { t: 'restart' }, this.online.peer);
      this.restart();
    }
  }

  restart() {
    const { onExit, difficulty, color, online } = this;
    this.active = false;
    this.start({ difficulty, color, onExit, online });
  }

  opponentLeft() {
    if (this.foeLeft) return;
    this.foeLeft = true;
    if (this.phase !== 'done') {
      this.message(`${this.foeName} ist weg`, 2.5);
      this.phase = 'done';
      setTimeout(() => this.active && !this.result && this.showResult(), 1500);
    }
    this.markFoeLeft();
  }

  markFoeLeft() {
    if (!this.result) return;
    this.result.querySelector('.again').setAttribute('disabled', '');
    this.result.querySelector('.status').textContent = `${this.foeName} hat das Duell verlassen.`;
  }

  // ---------- Simulation ----------
  update(dt) {
    if (!this.active) return;
    this.time += dt;
    this.phaseTime += dt;
    if (this.role === 'guest') {
      this.guestUpdate(dt);
      return;
    }
    const [p, b] = this.fighters;

    if (this.phase === 'countdown') {
      const n = 3 - Math.floor(this.phaseTime - 0.9);
      if (this.phaseTime > 0.9 && n !== this.lastCount && n >= 1) {
        this.lastCount = n;
        this.fx('count', { n });
      }
      if (this.phaseTime > 3.9) {
        this.phase = 'fight';
        this.fx('go');
      }
    } else if (this.phase === 'fight') {
      this.roundTime -= dt;
      this.playerInput(p);
      if (this.role === 'host') this.remoteControl(b);
      else this.botThink(b, p, dt);
      if (this.roundTime <= 0) this.endRound(p.damage <= b.damage ? 0 : 1, 'Zeit um!');
    } else if (this.phase === 'roundEnd' && this.phaseTime > 2.4) {
      if (this.round >= ROUNDS) this.fx('done');
      else this.nextRound();
    }

    for (const f of this.fighters) this.stepFighter(f, f === p ? b : p, dt);
    for (const f of this.fighters) {
      f.shown.copy(f.pos);
      f.sync(dt);
    }
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateHud();
    if (this.role === 'host') this.sendState(dt);
  }

  /** Movement on the platform relative to the camera, from keys or the touch joystick. */
  readMove() {
    const k = this.input.keys;
    const v = new THREE.Vector2(
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0),
    ).add(this.input.joystick);
    if (v.length() > 1) v.normalize();
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return right.multiplyScalar(v.x).addScaledVector(fwd, -v.y);
  }

  playerInput(p) {
    p.move.copy(this.readMove());
    p.setBlock(this.blockHeld, this.time);
    if (this.queuedAttack) {
      this.attack(p, this.queuedAttack);
      this.queuedAttack = null;
    }
  }

  attack(f, dir) {
    if (f.state === 'block') f.state = 'idle';
    if (f.startAttack(dir, this.time)) this.fx('swing', { s: ATTACKS[dir].push });
  }

  // ---------- Online: the guest's input drives fighter 1 on the host ----------
  applyRemoteInput(i) {
    const mx = Number(i.mx);
    const mz = Number(i.mz);
    if (Number.isFinite(mx) && Number.isFinite(mz)) {
      this.remote.move.set(mx, 0, mz);
      if (this.remote.move.length() > 1) this.remote.move.normalize();
    }
    this.remote.block = !!i.b;
    if (DIRS.includes(i.a)) this.remote.attack = i.a;
  }

  remoteControl(f) {
    f.move.copy(this.remote.move);
    f.setBlock(this.remote.block, this.time);
    if (this.remote.attack) {
      this.attack(f, this.remote.attack);
      this.remote.attack = null;
    }
  }

  sendState(dt) {
    this.sendTimer -= dt;
    if (this.sendTimer > 0 && !this.events.length) return;
    this.sendTimer = SEND_EVERY;
    const f = this.fighters.map((x) => [
      round2(x.pos.x),
      round2(x.pos.y),
      round2(x.pos.z),
      round2(x.facing),
      STATES.indexOf(x.state),
      DIRS.indexOf(x.attack),
      round2(x.timer),
      round2(x.damage),
      round2(x.move.x),
      round2(x.move.z),
    ]);
    this.online.net.send(
      'dstate',
      { ph: this.phase, pt: round2(this.phaseTime), rd: this.round, sc: this.score, rt: round2(this.roundTime), f, ev: this.events },
      this.online.peer,
    );
    this.events = [];
  }

  applyState(s) {
    if (!Array.isArray(s.f) || s.f.length !== 2) return;
    if (['countdown', 'fight', 'roundEnd'].includes(s.ph) && this.phase !== 'done') this.phase = s.ph;
    if (Number.isFinite(s.rd)) this.round = s.rd;
    if (Number.isFinite(s.rt)) this.roundTime = s.rt;
    if (Array.isArray(s.sc) && s.sc.length === 2 && s.sc.every(Number.isFinite)) this.score = s.sc.slice();
    s.f.forEach((v, i) => {
      if (!Array.isArray(v) || !v.slice(0, 10).every(Number.isFinite)) return;
      const x = this.fighters[i];
      const prevState = x.state;
      x.pos.set(v[0], v[1], v[2]);
      x.facing = v[3];
      x.state = STATES[v[4]] ?? 'idle';
      x.attack = DIRS[v[5]] ?? x.attack;
      x.timer = v[6];
      x.damage = v[7];
      x.move.set(v[8], 0, v[9]);
      // A new round puts everyone back on their spot: jump there instead of sliding.
      if (prevState === 'fall' && x.state !== 'fall') x.shown.copy(x.pos);
    });
    for (const [type, data] of Array.isArray(s.ev) ? s.ev.slice(0, 50) : []) {
      if (typeof type === 'string') this.playFx(type, data ?? {});
    }
  }

  guestUpdate(dt) {
    // Send our input; the swing itself is decided (and echoed back) by the host.
    this.sendTimer -= dt;
    const attack = this.phase === 'fight' ? this.queuedAttack : null;
    this.queuedAttack = null;
    if (this.sendTimer <= 0 || attack) {
      this.sendTimer = SEND_EVERY;
      const m = this.readMove();
      this.online.net.send('dinput', { mx: round2(m.x), mz: round2(m.z), b: this.blockHeld, a: attack }, this.online.peer);
    }
    const k = 1 - Math.exp(-dt * 18);
    for (const f of this.fighters) {
      f.shown.lerp(f.pos, k);
      const real = f.pos.clone();
      f.pos.copy(f.shown);
      f.sync(dt);
      f.pos.copy(real);
    }
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateHud();
  }

  botThink(b, p, dt) {
    const ai = this.ai;
    const bot = this.bot;
    const { center, radius } = this.arena;
    const toFoe = p.pos.clone().sub(b.pos).setY(0);
    const dist = toFoe.length();
    toFoe.normalize();
    bot.cooldown -= dt;

    // Seeing the player wind up, the bot may raise its guard. Better bots read the swing sooner;
    // a slow reaction means the guard comes up too late (the swing only winds up for ~0.2 s).
    if (p.state === 'windup' && !bot.sawWindup) {
      bot.sawWindup = true;
      if (Math.random() < ai.block) bot.reactAt = this.time + ai.reaction * 0.45;
    }
    if (p.state !== 'windup') bot.sawWindup = false;
    if (bot.reactAt !== null && this.time >= bot.reactAt) {
      bot.reactAt = null;
      if (!b.busy) bot.blockUntil = this.time + 0.5;
    }
    // Now and then it simply holds its guard while close.
    if (!b.busy && dist < 3 && this.time > bot.blockUntil + 0.6 && Math.random() < dt * ai.block * 0.6) {
      bot.blockUntil = this.time + rand(0.4, 0.9);
    }
    b.setBlock(this.time < bot.blockUntil, this.time);

    // Movement: keep a fighting distance, strafe a little, stay away from the edge.
    const move = new THREE.Vector3();
    if (dist > 2.3) move.add(toFoe);
    else if (dist < 1.5) move.sub(toFoe);
    const side = new THREE.Vector3(-toFoe.z, 0, toFoe.x).multiplyScalar(0.45 * bot.strafe);
    move.add(side);
    const fromCenter = b.pos.clone().sub(center).setY(0);
    const r = fromCenter.length();
    if (r > radius - 2.4) move.addScaledVector(fromCenter.normalize(), -ai.edgeCare * 1.6 * ((r - (radius - 2.4)) / 2.4 + 0.5));
    if (Math.random() < dt * 0.4) bot.strafe *= -1;
    b.move.copy(move.lengthSq() > 0.0001 ? move.normalize().multiplyScalar(ai.speed / MOVE_SPEED) : move);

    // Attack when in reach and ready. Overhead more often if the player keeps blocking.
    if (dist < REACH - 0.2 && bot.cooldown <= 0 && !b.busy && this.time >= bot.blockUntil) {
      const roll = Math.random();
      const dir = p.state === 'block' && roll < 0.5 ? 'oben' : roll < 0.4 ? 'links' : roll < 0.8 ? 'rechts' : 'oben';
      this.attack(b, dir);
      bot.cooldown = rand(...ai.attackEvery);
    }
  }

  stepFighter(f, foe, dt) {
    const { center, radius, poolY } = this.arena;
    f.timer += dt;
    // Attack timeline.
    if (f.state === 'windup' && f.timer >= ATTACKS[f.attack].windup) {
      f.state = 'active';
      f.timer = 0;
      this.resolveHit(f, foe);
    } else if (f.state === 'active' && f.timer >= ATTACKS[f.attack].active) {
      f.state = 'recover';
      f.timer = 0;
    } else if (f.state === 'recover' && f.timer >= ATTACKS[f.attack].recover) {
      f.state = 'idle';
      f.timer = 0;
    } else if (f.state === 'stagger' && f.timer >= f.staggerTime) {
      f.state = 'idle';
      f.timer = 0;
    }

    if (f.state === 'fall') {
      f.vel.y -= 22 * dt;
      f.pos.addScaledVector(f.vel, dt);
      if (!f.splashed && f.pos.y <= poolY) {
        f.splashed = true;
        f.vel.multiplyScalar(0.1);
        this.fx('splash', { at: [round2(f.pos.x), round2(poolY), round2(f.pos.z)] });
        if (this.phase === 'fight') this.endRound(f === this.fighters[0] ? 1 : 0);
      }
      if (f.pos.y < poolY - 0.6) {
        f.pos.y = poolY - 0.6;
        f.vel.set(0, 0, 0);
      }
      return;
    }

    // Facing: always towards the opponent.
    const d = foe.pos.clone().sub(f.pos);
    if (d.lengthSq() > 0.01) f.facing = Math.atan2(d.x, d.z);

    // Walking (slower while attacking or blocking, not at all while staggered).
    const canMove = this.phase === 'fight' && f.state !== 'stagger';
    const slow = f.state === 'block' ? 0.35 : f.busy ? 0.3 : 1;
    if (canMove) f.pos.addScaledVector(f.move, MOVE_SPEED * slow * dt);
    // Knock-back slides out with friction.
    f.pos.addScaledVector(f.vel, dt);
    f.vel.multiplyScalar(Math.exp(-dt * 3.2));
    // Fighters can't overlap.
    const sep = f.pos.clone().sub(foe.pos).setY(0);
    if (sep.length() < 1.1 && sep.length() > 1e-4) f.pos.addScaledVector(sep.normalize(), (1.1 - sep.length()) * 0.5);

    // Edge: walking stops at the rim, but a strong push sends you over.
    const off = f.pos.clone().sub(center).setY(0);
    const r = off.length();
    if (r > radius - 0.35) {
      if (f.vel.length() > 1.4) {
        f.state = 'fall';
        f.vel.y = 2.5;
        f.vel.add(off.normalize().multiplyScalar(1.5));
        this.fx('fall');
      } else {
        f.pos.copy(center).add(off.normalize().multiplyScalar(radius - 0.35)).setY(center.y);
      }
    }
    f.pos.y = center.y;
  }

  resolveHit(attacker, target) {
    const a = ATTACKS[attacker.attack];
    const to = target.pos.clone().sub(attacker.pos).setY(0);
    const dist = to.length();
    to.normalize();
    const facing = new THREE.Vector3(Math.sin(attacker.facing), 0, Math.cos(attacker.facing));
    if (dist > REACH || facing.dot(to) < Math.cos(1.2) || target.state === 'fall') return;
    const contact = attacker.pos.clone().lerp(target.pos, 0.6).setY(attacker.pos.y + 1.2);
    const at = contact.toArray().map(round2);

    if (target.state === 'block') {
      if (this.time - target.blockSince < 0.22) {
        // Perfect block: the attacker reels back.
        attacker.state = 'stagger';
        attacker.staggerTime = 0.6;
        attacker.timer = 0;
        attacker.vel.addScaledVector(to, -2.2);
        this.stats.parried[this.fighters.indexOf(target)]++;
        this.fx('parry', { at });
      } else {
        target.vel.addScaledVector(to, 1.6 * a.push);
        target.damage += 2;
        this.stats.blocked[this.fighters.indexOf(target)]++;
        this.fx('block', { at });
      }
      return;
    }
    this.stats.hits[this.fighters.indexOf(attacker)]++;
    target.damage += a.damage;
    const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(0.35 * a.side);
    const strength = (3.4 + target.damage * 0.075) * a.push;
    target.vel.copy(to.add(side).normalize().multiplyScalar(strength));
    target.state = 'stagger';
    target.staggerTime = 0.3 + target.damage * 0.002;
    target.timer = 0;
    this.fx('hit', { at, s: round2(Math.min(1, strength / 9)), target: this.fighters.indexOf(target) });
  }

  endRound(winner, reason = null) {
    if (this.phase !== 'fight') return;
    this.phase = 'roundEnd';
    this.phaseTime = 0;
    this.score[winner]++;
    this.fx('roundEnd', { w: winner, reason });
    this.updateHud();
  }

  // Side-on camera that frames both fighters (your own fighter on the left).
  updateCamera(dt) {
    const p = this.fighters[this.me];
    const b = this.fighters[1 - this.me];
    const pp = p.shown ?? p.pos;
    const bp = b.shown ?? b.pos;
    const mid = pp.clone().add(bp).multiplyScalar(0.5);
    mid.y = this.arena.center.y;
    const line = bp.clone().sub(pp).setY(0);
    const sep = Math.max(2, line.length());
    line.normalize();
    let side = new THREE.Vector3(-line.z, 0, line.x);
    // Stay on the same side as last frame so the view never flips.
    if (this.camPos.lengthSq() > 0 && side.dot(this.camPos.clone().sub(mid)) < 0) side.negate();
    const desired = mid.clone().addScaledVector(side, 7.5 + sep * 0.55).add(new THREE.Vector3(0, 3.6 + sep * 0.15, 0));
    const look = mid.clone().add(new THREE.Vector3(0, 0.9, 0));
    if (this.camPos.lengthSq() === 0) {
      this.camPos.copy(desired);
      this.camLook.copy(look);
    }
    const k = 1 - Math.exp(-dt * 5);
    this.camPos.lerp(desired, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(this.shake));
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.lookAt(this.camLook);
  }
}
