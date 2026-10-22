// Small WebAudio synthesizer used for the soundtrack (rendered offline) and live sound effects.
// Every instrument is a function (ch, t, midi, dur, vel) that schedules nodes on a channel.

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------- Mixer ----------

function impulseResponse(ctx, seconds = 3.2, decay = 3.2, damp = 0.35) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    let seed = c * 7919 + 13;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      const n = (seed / 2147483647) * 2 - 1;
      // Darker as it decays: a one-pole low-pass whose cutoff falls over time.
      const k = damp + (1 - damp) * (1 - i / len) * 0.6;
      lp += (n - lp) * k;
      d[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}

/**
 * Master bus: channels → (dry, reverb send, delay send) → compressor → destination.
 */
export function createMixer(ctx, { reverbSeconds = 3.2, delayTime = 0.36, delayFeedback = 0.32, master = 0.8 } = {}) {
  const out = ctx.createGain();
  out.gain.value = master;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const bus = ctx.createGain();
  bus.connect(comp);
  comp.connect(out);
  out.connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulseResponse(ctx, reverbSeconds);
  const reverbIn = ctx.createGain();
  reverbIn.connect(reverb);
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.9;
  reverb.connect(reverbOut);
  reverbOut.connect(bus);

  const delay = ctx.createDelay(2);
  delay.delayTime.value = delayTime;
  const fb = ctx.createGain();
  fb.gain.value = delayFeedback;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 3200;
  const delayIn = ctx.createGain();
  delayIn.connect(delay);
  delay.connect(dlp);
  dlp.connect(fb);
  fb.connect(delay);
  const delayPan = ctx.createStereoPanner();
  delayPan.pan.value = 0.35;
  dlp.connect(delayPan);
  delayPan.connect(bus);
  delayPan.connect(reverbIn);

  return {
    ctx,
    out,
    bus,
    channel({ gain = 1, pan = 0, reverb = 0.2, delay = 0, lowpass = 0 } = {}) {
      const input = ctx.createGain();
      input.gain.value = gain;
      let node = input;
      if (lowpass) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lowpass;
        node.connect(f);
        node = f;
      }
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(bus);
      if (reverb) {
        const s = ctx.createGain();
        s.gain.value = reverb;
        p.connect(s);
        s.connect(reverbIn);
      }
      if (delay) {
        const s = ctx.createGain();
        s.gain.value = delay;
        p.connect(s);
        s.connect(delayIn);
      }
      return { ctx, input };
    },
  };
}

// ---------- Helpers ----------

function env(param, t, { a = 0.005, d = 0.2, s = 0, r = 0.2, peak = 1, dur = 0.5 }) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setTargetAtTime(peak * s, t + a, Math.max(0.001, d / 3));
  const end = t + Math.max(dur, a);
  param.setTargetAtTime(0, end, Math.max(0.001, r / 4));
  return end + r * 1.5;
}

function osc(ctx, type, freq, t, stop, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(stop);
  return o;
}

let noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  if (!noiseCache.has(ctx)) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseCache.set(ctx, b);
  }
  return noiseCache.get(ctx);
}

function noise(ctx, t, stop) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  n.loop = true;
  n.start(t, Math.random() * 1.5);
  n.stop(stop);
  return n;
}

// ---------- Instruments ----------

/** Soft FM electric piano (Rhodes-ish), with a gentle tine "bark" on loud notes. */
export function epiano({ ctx, input }, t, midi, dur, vel = 0.7) {
  const f = mtof(midi);
  const out = ctx.createGain();
  const stop = env(out.gain, t, { a: 0.004, d: 1.6, s: 0.25, r: 0.5, peak: vel * 0.32, dur });
  const car = osc(ctx, 'sine', f, t, stop);
  const mod = osc(ctx, 'sine', f, t, stop);
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(f * (0.8 + vel * 1.6), t);
  modGain.gain.setTargetAtTime(f * 0.25, t, 0.18);
  mod.connect(modGain);
  modGain.connect(car.frequency);
  const tine = osc(ctx, 'sine', f * 4.02, t, stop);
  const tg = ctx.createGain();
  env(tg.gain, t, { a: 0.002, d: 0.25, s: 0, r: 0.1, peak: vel * 0.05, dur: 0.05 });
  tine.connect(tg);
  tg.connect(input);
  car.connect(out);
  out.connect(input);
}

/** Glassy bell / glockenspiel with inharmonic partials. */
export function bell({ ctx, input }, t, midi, dur, vel = 0.7) {
  const f = mtof(midi);
  const partials = [
    [1, 1, 2.4],
    [2.76, 0.42, 1.2],
    [5.4, 0.22, 0.6],
    [8.93, 0.12, 0.35],
  ];
  for (const [ratio, amp, decay] of partials) {
    const g = ctx.createGain();
    const stop = env(g.gain, t, { a: 0.002, d: decay, s: 0, r: 0.2, peak: vel * amp * 0.18, dur: decay });
    osc(ctx, 'sine', f * ratio, t, stop).connect(g);
    g.connect(input);
  }
}

/** Wooden marimba: fundamental plus a 4th harmonic and a tiny mallet click. */
export function marimba({ ctx, input }, t, midi, dur, vel = 0.7) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.002, d: 0.55, s: 0, r: 0.15, peak: vel * 0.32, dur: 0.4 });
  osc(ctx, 'sine', f, t, stop).connect(g);
  const h = ctx.createGain();
  env(h.gain, t, { a: 0.001, d: 0.09, s: 0, r: 0.05, peak: vel * 0.12, dur: 0.05 });
  osc(ctx, 'sine', f * 3.93, t, stop).connect(h);
  h.connect(input);
  g.connect(input);
}

/** Vibraphone: pure tone with the motor's tremolo. */
export function vibes({ ctx, input }, t, midi, dur, vel = 0.7) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.003, d: 2.2, s: 0.15, r: 0.6, peak: vel * 0.22, dur });
  const trem = ctx.createGain();
  trem.gain.value = 1;
  const lfo = osc(ctx, 'sine', 5.2, t, stop);
  const depth = ctx.createGain();
  depth.gain.value = 0.25;
  lfo.connect(depth);
  depth.connect(trem.gain);
  osc(ctx, 'sine', f, t, stop).connect(g);
  const p4 = ctx.createGain();
  p4.gain.value = 0.25;
  osc(ctx, 'sine', f * 4, t, stop).connect(p4);
  p4.connect(g);
  g.connect(trem);
  trem.connect(input);
}

/** Warm pad: detuned saws through a slowly opening low-pass. */
export function pad({ ctx, input }, t, midi, dur, vel = 0.6, { bright = 1800 } = {}) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.9, d: 1.5, s: 0.8, r: 1.6, peak: vel * 0.07, dur });
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(bright * 0.4, t);
  lp.frequency.linearRampToValueAtTime(bright, t + Math.min(dur, 2));
  for (const d of [-9, 0, 8]) osc(ctx, 'sawtooth', f, t, stop, d).connect(lp);
  lp.connect(g);
  g.connect(input);
}

/** Round sub bass (sine + a little triangle for definition). */
export function bass({ ctx, input }, t, midi, dur, vel = 0.8) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.006, d: 0.4, s: 0.7, r: 0.12, peak: vel * 0.42, dur });
  osc(ctx, 'sine', f, t, stop).connect(g);
  const tri = ctx.createGain();
  tri.gain.value = 0.35;
  osc(ctx, 'triangle', f * 2, t, stop).connect(tri);
  tri.connect(g);
  g.connect(input);
}

/** Upright-style plucked bass for the jazzy lobby tune. */
export function upright({ ctx, input }, t, midi, dur, vel = 0.8) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.004, d: 0.5, s: 0.25, r: 0.1, peak: vel * 0.5, dur });
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.setTargetAtTime(380, t, 0.08);
  osc(ctx, 'triangle', f, t, stop).connect(lp);
  osc(ctx, 'sine', f, t, stop).connect(g);
  lp.connect(g);
  g.connect(input);
}

/** Bright synth pluck (for the duel tune's driving arps). */
export function pluck({ ctx, input }, t, midi, dur, vel = 0.7, { cutoff = 5200 } = {}) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.002, d: 0.22, s: 0.0, r: 0.08, peak: vel * 0.16, dur: Math.min(dur, 0.25) });
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 3;
  lp.frequency.setValueAtTime(cutoff, t);
  lp.frequency.setTargetAtTime(600, t, 0.06);
  osc(ctx, 'sawtooth', f, t, stop, -6).connect(lp);
  osc(ctx, 'square', f, t, stop, 6).connect(lp);
  lp.connect(g);
  g.connect(input);
}

/** Soft synth brass stab for accents. */
export function brass({ ctx, input }, t, midi, dur, vel = 0.7) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.03, d: 0.3, s: 0.6, r: 0.25, peak: vel * 0.09, dur });
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.linearRampToValueAtTime(2600 * vel + 600, t + 0.06);
  lp.frequency.setTargetAtTime(1300, t + 0.08, 0.2);
  for (const d of [-7, 7]) osc(ctx, 'sawtooth', f, t, stop, d).connect(lp);
  lp.connect(g);
  g.connect(input);
}

/** Breathy whistle lead with vibrato (for melodies). */
export function whistle({ ctx, input }, t, midi, dur, vel = 0.7) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.04, d: 0.2, s: 0.8, r: 0.18, peak: vel * 0.12, dur });
  const o = osc(ctx, 'sine', f, t, stop);
  const vib = osc(ctx, 'sine', 5.5, t, stop);
  const vd = ctx.createGain();
  vd.gain.setValueAtTime(0, t);
  vd.gain.linearRampToValueAtTime(f * 0.012, t + 0.35);
  vib.connect(vd);
  vd.connect(o.frequency);
  o.connect(g);
  const air = ctx.createBiquadFilter();
  air.type = 'bandpass';
  air.frequency.value = f * 2;
  air.Q.value = 6;
  const ag = ctx.createGain();
  ag.gain.value = vel * 0.05;
  noise(ctx, t, stop).connect(air);
  air.connect(ag);
  ag.connect(input);
  g.connect(input);
}

// ---------- Drums ----------

export function kick({ ctx, input }, t, vel = 0.9) {
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.001, d: 0.35, s: 0, r: 0.05, peak: vel * 0.9, dur: 0.2 });
  const o = osc(ctx, 'sine', 140, t, stop);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  o.connect(g);
  g.connect(input);
}

export function snare({ ctx, input }, t, vel = 0.7, { brushed = false } = {}) {
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: brushed ? 0.01 : 0.001, d: brushed ? 0.25 : 0.16, s: 0, r: 0.05, peak: vel * (brushed ? 0.18 : 0.35), dur: 0.1 });
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = brushed ? 3500 : 2200;
  bp.Q.value = 0.8;
  noise(ctx, t, stop).connect(bp);
  bp.connect(g);
  if (!brushed) {
    const tg = ctx.createGain();
    env(tg.gain, t, { a: 0.001, d: 0.08, s: 0, r: 0.03, peak: vel * 0.25, dur: 0.04 });
    const o = osc(ctx, 'triangle', 220, t, stop);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.05);
    o.connect(tg);
    tg.connect(input);
  }
  g.connect(input);
}

export function clap({ ctx, input }, t, vel = 0.7) {
  for (const [dt, a] of [[0, 0.6], [0.012, 0.8], [0.024, 1]]) {
    const g = ctx.createGain();
    const stop = env(g.gain, t + dt, { a: 0.001, d: dt === 0.024 ? 0.18 : 0.02, s: 0, r: 0.04, peak: vel * 0.3 * a, dur: 0.02 });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1.2;
    noise(ctx, t + dt, stop).connect(bp);
    bp.connect(g);
    g.connect(input);
  }
}

export function hat({ ctx, input }, t, vel = 0.5, { open = false } = {}) {
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.001, d: open ? 0.3 : 0.045, s: 0, r: 0.03, peak: vel * 0.16, dur: 0.02 });
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7500;
  noise(ctx, t, stop).connect(hp);
  hp.connect(g);
  g.connect(input);
}

export function shaker({ ctx, input }, t, vel = 0.4) {
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.015, d: 0.07, s: 0, r: 0.03, peak: vel * 0.09, dur: 0.03 });
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 6000;
  bp.Q.value = 1.5;
  noise(ctx, t, stop).connect(bp);
  bp.connect(g);
  g.connect(input);
}

/** Water droplet "bloop": a quick upward sine sweep. */
export function droplet({ ctx, input }, t, midi = 84, vel = 0.5) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const stop = env(g.gain, t, { a: 0.002, d: 0.12, s: 0, r: 0.05, peak: vel * 0.2, dur: 0.06 });
  const o = osc(ctx, 'sine', f * 0.6, t, stop);
  o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.08);
  o.connect(g);
  g.connect(input);
}

export { noise, osc, env };
