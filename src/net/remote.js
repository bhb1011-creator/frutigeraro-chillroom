import * as THREE from 'three';
import { createBuddy, BUDDY_COLORS } from '../world/character.js';

// The other players in the room: buddies that glide smoothly between the position updates they
// send (~10 per second), each with a glassy name tag above the head.

const DELAY = 0.15; // seconds behind the newest update, so there are always two to blend between
const STALE = 8; // seconds without updates before a buddy is hidden

function nameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 30px "Segoe UI", Arial, sans-serif';
  const w = Math.min(244, g.measureText(name).width + 44);
  const x = (256 - w) / 2;
  const fill = g.createLinearGradient(0, 6, 0, 58);
  fill.addColorStop(0, 'rgba(255,255,255,0.92)');
  fill.addColorStop(0.5, 'rgba(225,246,255,0.75)');
  fill.addColorStop(0.52, 'rgba(160,225,255,0.7)');
  fill.addColorStop(1, 'rgba(200,245,255,0.85)');
  g.fillStyle = fill;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(x, 8, w, 48, 24);
  g.fill();
  g.stroke();
  g.fillStyle = `#${(BUDDY_COLORS[color] ?? 0x3fa8f0).toString(16).padStart(6, '0')}`;
  g.beginPath();
  g.arc(x + 22, 32, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0b3f66';
  g.textBaseline = 'middle';
  g.fillText(name, x + 36, 33, w - 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 200;
  return sprite;
}

const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map();
  }

  /** Creates or refreshes a player's buddy and tag (on join and when they change name or colour). */
  upsert(id, { name, color }) {
    const old = this.players.get(id);
    if (old && old.name === name && old.color === color) return old;
    const buddy = createBuddy({ color: color in BUDDY_COLORS ? color : 'blau' });
    buddy.name = `remote-${id}`;
    const box = new THREE.Box3().setFromObject(buddy);
    const tag = nameTag(name, color);
    tag.position.y = (box.max.y - buddy.position.y) / buddy.scale.y + 0.45 / buddy.scale.y;
    tag.scale.multiplyScalar(1 / buddy.scale.y);
    buddy.add(tag);
    const p = { id, name, color, buddy, tag, buffer: old?.buffer ?? [], mode: old?.mode ?? 'play', last: old?.last ?? 0 };
    if (old) {
      buddy.position.copy(old.buddy.position);
      buddy.rotation.y = old.buddy.rotation.y;
      this.scene.remove(old.buddy);
    }
    buddy.visible = p.buffer.length > 0;
    this.scene.add(buddy);
    this.players.set(id, p);
    return p;
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.scene.remove(p.buddy);
    p.tag.material.map.dispose();
    p.tag.material.dispose();
    this.players.delete(id);
  }

  /** A position update: { x, y, z, r (heading), a (animation), m (mode) }. */
  receive(id, s, now) {
    const p = this.players.get(id);
    if (!p) return;
    if (![s?.x, s?.y, s?.z, s?.r].every(Number.isFinite)) return;
    p.buffer.push({ t: now, x: s.x, y: s.y, z: s.z, r: s.r, a: s.a });
    if (p.buffer.length > 20) p.buffer.shift();
    p.mode = s.m === 'duel' ? 'duel' : 'play';
    p.last = now;
  }

  update(dt, now) {
    for (const p of this.players.values()) {
      const b = p.buffer;
      p.buddy.visible = b.length > 0 && p.mode !== 'duel' && now - p.last < STALE;
      if (!b.length) continue;
      const t = now - DELAY;
      let i = b.length - 1;
      while (i > 0 && b[i - 1].t > t) i--;
      const s1 = b[i];
      const s0 = b[Math.max(0, i - 1)];
      const k = s1 === s0 ? 1 : THREE.MathUtils.clamp((t - s0.t) / (s1.t - s0.t), 0, 1);
      p.buddy.position.set(s0.x + (s1.x - s0.x) * k, s0.y + (s1.y - s0.y) * k, s0.z + (s1.z - s0.z) * k);
      p.buddy.rotation.y = lerpAngle(s0.r, s1.r, k);
      p.buddy.userData.play(['idle', 'walk', 'run'].includes(s1.a) ? s1.a : 'idle');
      p.buddy.userData.update(dt);
    }
  }

  get count() {
    return this.players.size;
  }
}
