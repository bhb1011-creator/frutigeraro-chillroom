import { createMixer, bell, marimba, pluck, kick, hat, droplet, noise, osc, env, mtof } from './synth.js';

// One AudioContext for the whole game: looping music tracks with cross-fades, plus sound effects
// synthesized live. Browsers only allow audio after a user gesture, so call unlock() from a click.

const BASE = `${import.meta.env.BASE_URL}assets/music/`;

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.current = null;
    this.currentName = null;
    this.musicVolume = 0.55;
    this.sfxVolume = 0.8;
    this.muted = false;
  }

  /** Must run inside a user gesture (click / key / touch). */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicVolume;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);
      // Sound effects get their own small mixer (light reverb) feeding the sfx bus.
      this.mix = createMixer(this.ctx, { reverbSeconds: 1.4, delayTime: 0.18, delayFeedback: 0.2, master: 1, destination: this.sfxBus });
      this.ch = {
        hit: this.mix.channel({ gain: 1, reverb: 0.25 }),
        ui: this.mix.channel({ gain: 0.7, reverb: 0.3, delay: 0.15 }),
        fx: this.mix.channel({ gain: 0.9, reverb: 0.2 }),
      };
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.setMuted(this.muted);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  async load(name) {
    if (!this.buffers.has(name)) {
      this.buffers.set(
        name,
        fetch(`${BASE}${name}.mp3`)
          .then((r) => r.arrayBuffer())
          .then((b) => this.ctx.decodeAudioData(b)),
      );
    }
    return this.buffers.get(name);
  }

  /** Cross-fades to a looping track (or plays a one-shot jingle with loop: false). */
  async play(name, { loop = true, fade = 1.2, then = null } = {}) {
    if (!this.ctx || this.currentName === name) return;
    this.currentName = name;
    const buffer = await this.load(name);
    if (this.currentName !== name) return;
    const t = this.ctx.currentTime;
    if (this.current) {
      const old = this.current;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      old.source.stop(t + fade + 0.1);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + (loop ? fade : 0.05));
    source.connect(gain);
    gain.connect(this.musicBus);
    source.start(t);
    this.current = { source, gain };
    if (!loop && then) {
      source.onended = () => {
        if (this.current?.source === source) {
          this.currentName = null;
          this.current = null;
          this.play(then);
        }
      };
    }
  }

  // ---------- Sound effects ----------

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  /** Sword swing: a filtered noise "whoosh" that sweeps up. */
  swing(strength = 1) {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const ch = this.ch.fx;
    const g = ctx.createGain();
    const stop = env(g.gain, t, { a: 0.04, d: 0.18, s: 0, r: 0.08, peak: 0.35 * strength, dur: 0.1 });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    noise(ctx, t, stop).connect(bp);
    bp.connect(g);
    g.connect(ch.input);
  }

  /** Foam sword hit: a soft "bonk" with a bright glassy chime on top. */
  hit(strength = 1) {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const ch = this.ch.hit;
    const g = ctx.createGain();
    const stop = env(g.gain, t, { a: 0.002, d: 0.16, s: 0, r: 0.05, peak: 0.7, dur: 0.08 });
    const o = osc(ctx, 'sine', 220, t, stop);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.12);
    o.connect(g);
    const thud = ctx.createGain();
    env(thud.gain, t, { a: 0.001, d: 0.05, s: 0, r: 0.02, peak: 0.4, dur: 0.02 });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    noise(ctx, t, stop).connect(lp);
    lp.connect(thud);
    thud.connect(ch.input);
    g.connect(ch.input);
    bell(this.ch.ui, t + 0.01, 84 + Math.round(strength * 5), 0.3, 0.45);
  }

  /** Blocked hit: two bright, slightly detuned clinks. */
  block() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    bell(this.ch.hit, t, 93, 0.25, 0.7);
    bell(this.ch.hit, t + 0.015, 98, 0.2, 0.5);
    hat(this.ch.hit, t, 0.9);
  }

  /** Perfect block: a rising sparkle. */
  parry() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [88, 93, 97, 100].forEach((n, i) => bell(this.ch.ui, t + i * 0.04, n, 0.3, 0.55));
  }

  /** Falling off: a descending whistle. */
  fall() {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    const stop = env(g.gain, t, { a: 0.05, d: 0.9, s: 0.4, r: 0.2, peak: 0.18, dur: 0.8 });
    const o = osc(ctx, 'sine', 1200, t, stop);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.9);
    o.connect(g);
    g.connect(this.ch.fx.input);
  }

  /** Splash into the pool. */
  splash() {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    const stop = env(g.gain, t, { a: 0.005, d: 0.6, s: 0, r: 0.2, peak: 0.6, dur: 0.3 });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.5);
    bp.Q.value = 0.7;
    noise(ctx, t, stop).connect(bp);
    bp.connect(g);
    g.connect(this.ch.fx.input);
    kick(this.ch.fx, t, 0.5);
    for (let i = 0; i < 6; i++) droplet(this.ch.ui, t + 0.12 + i * 0.07, 80 + Math.floor(Math.random() * 14), 0.5);
  }

  countdown(final = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (final) {
      [72, 76, 79, 84].forEach((n) => marimba(this.ch.ui, t, n, 0.5, 0.8));
      bell(this.ch.ui, t, 96, 0.6, 0.6);
    } else {
      marimba(this.ch.ui, t, 79, 0.3, 0.8);
      bell(this.ch.ui, t, 91, 0.3, 0.35);
    }
  }

  click() {
    if (!this.ready) return;
    droplet(this.ch.ui, this.ctx.currentTime, 88, 0.6);
  }

  select() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    marimba(this.ch.ui, t, 84, 0.2, 0.7);
    marimba(this.ch.ui, t + 0.07, 91, 0.25, 0.7);
  }

  roundWon(won) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const notes = won ? [72, 76, 79, 84] : [76, 72, 69, 67];
    notes.forEach((n, i) => pluck(this.ch.ui, t + i * 0.09, n, 0.2, 0.8));
  }

  jump() {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    const stop = env(g.gain, t, { a: 0.005, d: 0.15, s: 0, r: 0.05, peak: 0.12, dur: 0.08 });
    const o = osc(ctx, 'sine', mtof(64), t, stop);
    o.frequency.exponentialRampToValueAtTime(mtof(79), t + 0.12);
    o.connect(g);
    g.connect(this.ch.ui.input);
  }
}

export const audio = new AudioEngine();
