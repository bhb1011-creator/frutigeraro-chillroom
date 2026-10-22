import { createMixer, epiano, bell, marimba, vibes, pad, bass, upright, pluck, brass, whistle, kick, snare, clap, hat, shaker, droplet } from './synth.js';

// The soundtrack: original pieces in the bright, optimistic late-2000s sound —
// jazzy menu tunes, glassy bells and soft pads. Each song schedules its notes into a mixer;
// scripts/render-music.mjs renders them offline to looping MP3s.
//
// Notes are written as [bar, beat, midi, lengthInBeats, velocity?].

function at(spb, bar, beat, beatsPerBar = 4) {
  return (bar * beatsPerBar + beat) * spb;
}

// Light swing for jazz: off-beat eighths land a little late.
function swing(beat, amount = 0.62) {
  const whole = Math.floor(beat);
  const frac = beat - whole;
  return Math.abs(frac - 0.5) < 1e-6 ? whole + amount : beat;
}

function melody(inst, ch, notes, spb, offsetBar, { vel = 0.7, transpose = 0, swingAmount = 0 } = {}) {
  for (const [bar, b, midi, len, v] of notes) {
    const beat = swingAmount ? swing(b, swingAmount) : b;
    inst(ch, at(spb, offsetBar + bar, beat), midi + transpose, len * spb, v ?? vel);
  }
}

// ---------- "Wiese": calm meadow theme (92 BPM, E-flat major) ----------

const WIESE_CHORDS = [
  { root: 39, voicing: [51, 58, 62, 65, 67] }, // Ebmaj9
  { root: 36, voicing: [48, 55, 58, 62, 63] }, // Cm9
  { root: 44, voicing: [44, 51, 55, 58, 60] }, // Abmaj9
  { root: 34, voicing: [46, 53, 56, 60, 63, 67] }, // Bb13sus
  { root: 43, voicing: [43, 53, 58, 62] }, // Gm7
  { root: 36, voicing: [48, 55, 58, 62, 63] }, // Cm9
  { root: 41, voicing: [41, 51, 56, 60, 67] }, // Fm9
  { root: 34, voicing: [46, 56, 60, 63, 65] }, // Bb9sus
];

const WIESE_MELODY = [
  [0, 0, 79, 1], [0, 1, 82, 0.5], [0, 1.5, 84, 1], [0, 2.5, 82, 0.5], [0, 3, 79, 1],
  [1, 0, 77, 0.5], [1, 0.5, 79, 0.5], [1, 1, 75, 1.5], [1, 3, 72, 1],
  [2, 0, 72, 0.5], [2, 0.5, 75, 0.5], [2, 1, 79, 1], [2, 2, 77, 0.5], [2, 2.5, 75, 0.5], [2, 3, 77, 1],
  [3, 0, 79, 1.5], [3, 1.5, 77, 0.5], [3, 2, 75, 2],
  [4, 0, 74, 0.5], [4, 0.5, 77, 0.5], [4, 1, 82, 1], [4, 2, 79, 1], [4, 3, 77, 1],
  [5, 0, 79, 1.5], [5, 1.5, 75, 0.5], [5, 2, 74, 0.5], [5, 2.5, 72, 1.5],
  [6, 0, 72, 0.5], [6, 0.5, 75, 0.5], [6, 1, 77, 0.5], [6, 1.5, 79, 0.5], [6, 2, 80, 1], [6, 3, 79, 1],
  [7, 0, 77, 2], [7, 2, 82, 0.5], [7, 2.5, 84, 0.5], [7, 3, 86, 1],
];

function wiese(mix) {
  const spb = 60 / 92;
  const ch = {
    keys: mix.channel({ gain: 0.9, pan: -0.15, reverb: 0.35 }),
    pad: mix.channel({ gain: 0.8, reverb: 0.5 }),
    bells: mix.channel({ gain: 0.55, pan: 0.3, reverb: 0.45, delay: 0.35 }),
    lead: mix.channel({ gain: 0.85, pan: 0.1, reverb: 0.4, delay: 0.2 }),
    bass: mix.channel({ gain: 0.9 }),
    drums: mix.channel({ gain: 0.7, reverb: 0.12 }),
    fx: mix.channel({ gain: 0.6, pan: -0.4, reverb: 0.6, delay: 0.3 }),
  };
  const bars = 40;
  for (let bar = 0; bar < bars; bar++) {
    const c = WIESE_CHORDS[bar % 8];
    const next = WIESE_CHORDS[(bar + 1) % 8];
    const section = bar < 4 ? 'intro' : bar < 12 ? 'A' : bar < 20 ? 'B' : bar < 28 ? 'A2' : bar < 36 ? 'B2' : 'outro';
    const full = section !== 'intro' && section !== 'outro';

    // Pad underneath everything.
    for (const n of c.voicing.slice(1)) pad(ch.pad, at(spb, bar, 0), n, 4 * spb, full ? 0.55 : 0.75);

    // Glassy 16th-note arpeggio in the intro, the B parts and the outro.
    if (!full || section === 'B' || section === 'B2') {
      const tones = c.voicing.slice(1).map((n) => n + 24);
      for (let i = 0; i < 16; i++) {
        if (section === 'B' && i % 2) continue;
        const n = tones[(i * 3) % tones.length] + (i % 8 === 7 ? 12 : 0);
        bell(ch.bells, at(spb, bar, i / 4), n, 0.25 * spb, 0.28 + (i % 4 === 0 ? 0.12 : 0));
      }
    }

    if (full) {
      // Electric piano: held chord on 1, little stabs on the "and" of 2 and on 4.
      for (const n of c.voicing.slice(1)) {
        epiano(ch.keys, at(spb, bar, 0), n, 1.4 * spb, 0.55);
        epiano(ch.keys, at(spb, bar, 1.5), n, 0.4 * spb, 0.35);
        epiano(ch.keys, at(spb, bar, 3), n + (bar % 2 ? 0 : 12) * 0, 0.8 * spb, 0.4);
      }
      // Bass: root, fifth pop, root, and an approach note into the next chord.
      const r = c.root + 12;
      bass(ch.bass, at(spb, bar, 0), r, 1.4 * spb, 0.85);
      bass(ch.bass, at(spb, bar, 1.5), r + 7, 0.4 * spb, 0.55);
      bass(ch.bass, at(spb, bar, 2), r, 1.2 * spb, 0.7);
      bass(ch.bass, at(spb, bar, 3.5), next.root + 12 + (next.root > c.root ? -1 : 1), 0.45 * spb, 0.55);
      // Soft groove: kick, brushed snare, shaker.
      kick(ch.drums, at(spb, bar, 0), 0.75);
      kick(ch.drums, at(spb, bar, 2.5), 0.55);
      snare(ch.drums, at(spb, bar, 1), 0.6, { brushed: true });
      snare(ch.drums, at(spb, bar, 3), 0.6, { brushed: true });
      for (let i = 0; i < 8; i++) shaker(ch.drums, at(spb, bar, i / 2), i % 2 ? 0.55 : 0.3);
      if (section === 'A2' || section === 'B2') for (let i = 0; i < 16; i++) hat(ch.drums, at(spb, bar, i / 4), i % 2 ? 0.25 : 0.12);
    }

    // Water droplets sprinkle the quiet parts.
    if (!full && bar % 2 === 1) droplet(ch.fx, at(spb, bar, 2.75), 86 + (bar % 3) * 3, 0.5);
  }
  // Melodies: marimba in B, vibes + bells in A2, whistle in B2.
  melody(marimba, ch.lead, WIESE_MELODY, spb, 12, { vel: 0.75 });
  melody(vibes, ch.lead, WIESE_MELODY, spb, 20, { vel: 0.7 });
  melody(bell, ch.bells, WIESE_MELODY, spb, 20, { vel: 0.35, transpose: 12 });
  melody(whistle, ch.lead, WIESE_MELODY, spb, 28, { vel: 0.75 });
  return { seconds: bars * 4 * spb };
}

// ---------- "Lobby": playful swing for the duel tower's menu (112 BPM, F major) ----------

const LOBBY_CHORDS = [
  { roots: [41], voicing: [57, 60, 64, 67] }, // Fmaj9
  { roots: [38], voicing: [53, 57, 60, 64] }, // Dm9
  { roots: [43], voicing: [58, 62, 65, 69] }, // Gm9
  { roots: [36], voicing: [58, 62, 64, 69] }, // C13
  { roots: [45], voicing: [60, 64, 67, 71] }, // Am9
  { roots: [38], voicing: [60, 66, 69, 71] }, // D13
  { roots: [43, 36], voicing: [58, 62, 65, 69], voicing2: [58, 62, 64, 69] }, // Gm9 | C13
  { roots: [41], voicing: [57, 60, 64, 67] }, // Fmaj9
];

const LOBBY_MELODY = [
  [0, 0, 81, 0.5], [0, 0.5, 84, 0.5], [0, 1, 88, 1], [0, 2, 86, 0.5], [0, 2.5, 84, 1.5],
  [1, 0, 81, 0.5], [1, 0.5, 77, 0.5], [1, 1, 81, 0.5], [1, 1.5, 84, 1.5], [1, 3, 81, 1],
  [2, 0, 82, 0.5], [2, 0.5, 86, 0.5], [2, 1, 89, 1], [2, 2, 86, 0.5], [2, 2.5, 82, 1.5],
  [3, 0, 88, 0.5], [3, 0.5, 86, 0.5], [3, 1, 84, 0.5], [3, 1.5, 82, 0.5], [3, 2, 79, 2],
  [4, 0, 84, 0.5], [4, 0.5, 88, 0.5], [4, 1, 91, 1], [4, 2, 88, 0.5], [4, 2.5, 84, 1.5],
  [5, 0, 90, 0.5], [5, 0.5, 88, 0.5], [5, 1, 86, 0.5], [5, 1.5, 84, 0.5], [5, 2, 81, 1], [5, 3, 78, 1],
  [6, 0, 79, 0.5], [6, 0.5, 82, 0.5], [6, 1, 86, 0.5], [6, 1.5, 84, 1], [6, 2.5, 82, 0.5], [6, 3, 76, 1],
  [7, 0, 77, 2], [7, 2, 72, 0.5], [7, 2.5, 76, 0.5], [7, 3, 79, 1],
];

function lobby(mix) {
  const spb = 60 / 112;
  const ch = {
    keys: mix.channel({ gain: 0.8, pan: -0.2, reverb: 0.25 }),
    lead: mix.channel({ gain: 0.9, pan: 0.15, reverb: 0.35, delay: 0.12 }),
    bells: mix.channel({ gain: 0.45, pan: 0.35, reverb: 0.4, delay: 0.2 }),
    bass: mix.channel({ gain: 1.0 }),
    drums: mix.channel({ gain: 0.6, reverb: 0.15 }),
  };
  const bars = 32;
  for (let bar = 0; bar < bars; bar++) {
    const c = LOBBY_CHORDS[bar % 8];
    const next = LOBBY_CHORDS[(bar + 1) % 8];
    const half = c.roots.length > 1;
    // Charleston comping: on 1 and on the swung "and" of 2.
    const comp = (voicing, beat, len) => voicing.forEach((n) => epiano(ch.keys, at(spb, bar, swing(beat)), n, len * spb, 0.42));
    if (half) {
      comp(c.voicing, 0, 0.9);
      comp(c.voicing2, 2, 0.9);
      comp(c.voicing2, 3.5, 0.4);
    } else {
      comp(c.voicing, 0, 1.2);
      comp(c.voicing, 1.5, 0.4);
      if (bar % 2) comp(c.voicing, 3.5, 0.3);
    }
    // Walking bass.
    const r = c.roots[0];
    const target = next.roots[0];
    const walk = half ? [r, r + 7, c.roots[1], c.roots[1] + 7] : [r, r + 4, r + 7, target + (target > r ? -1 : 1)];
    walk.forEach((n, i) => upright(ch.bass, at(spb, bar, i), n, 0.9 * spb, i === 0 ? 0.9 : 0.7));
    // Brushes and a ride pattern.
    kick(ch.drums, at(spb, bar, 0), 0.35);
    kick(ch.drums, at(spb, bar, 2), 0.3);
    snare(ch.drums, at(spb, bar, 1), 0.55, { brushed: true });
    snare(ch.drums, at(spb, bar, 3), 0.55, { brushed: true });
    for (const b of [0, 1, 1.5, 2, 3, 3.5]) hat(ch.drums, at(spb, bar, swing(b)), b % 1 ? 0.3 : 0.45, { open: true });
  }
  melody(vibes, ch.lead, LOBBY_MELODY, spb, 0, { vel: 0.75, swingAmount: 0.62 });
  melody(marimba, ch.lead, LOBBY_MELODY, spb, 8, { vel: 0.8, swingAmount: 0.62 });
  melody(bell, ch.bells, LOBBY_MELODY, spb, 8, { vel: 0.3, transpose: 12, swingAmount: 0.62 });
  melody(whistle, ch.lead, LOBBY_MELODY, spb, 16, { vel: 0.7, transpose: -12, swingAmount: 0.62 });
  melody(vibes, ch.lead, LOBBY_MELODY, spb, 24, { vel: 0.8, swingAmount: 0.62 });
  melody(bell, ch.bells, LOBBY_MELODY, spb, 24, { vel: 0.35, transpose: 12, swingAmount: 0.62 });
  return { seconds: bars * 4 * spb };
}

// ---------- "Duell": upbeat sporty theme for the arena (128 BPM, C major) ----------

const DUELL_CHORDS = [
  { root: 41, tones: [65, 69, 72, 76] }, // F(add9-ish)
  { root: 43, tones: [67, 71, 74, 79] }, // G
  { root: 40, tones: [64, 67, 71, 76] }, // Em
  { root: 45, tones: [69, 72, 76, 81] }, // Am
  { root: 41, tones: [65, 69, 72, 77] }, // F
  { root: 43, tones: [67, 71, 74, 77] }, // G7
  { root: 36, tones: [64, 67, 72, 76] }, // C
  { root: 36, tones: [64, 67, 72, 79] }, // C
];

const DUELL_MELODY = [
  [0, 0, 72, 0.75], [0, 0.75, 74, 0.25], [0, 1, 76, 1], [0, 2, 77, 0.5], [0, 2.5, 76, 0.5], [0, 3, 74, 1],
  [1, 0, 74, 0.75], [1, 0.75, 76, 0.25], [1, 1, 79, 1.5], [1, 2.5, 76, 0.5], [1, 3, 74, 1],
  [2, 0, 76, 0.75], [2, 0.75, 79, 0.25], [2, 1, 83, 1], [2, 2, 81, 0.5], [2, 2.5, 79, 0.5], [2, 3, 76, 1],
  [3, 0, 81, 2], [3, 2, 79, 0.5], [3, 2.5, 76, 0.5], [3, 3, 72, 1],
  [4, 0, 77, 0.75], [4, 0.75, 79, 0.25], [4, 1, 81, 1], [4, 2, 84, 1], [4, 3, 81, 1],
  [5, 0, 83, 0.75], [5, 0.75, 81, 0.25], [5, 1, 79, 1], [5, 2, 74, 0.5], [5, 2.5, 76, 0.5], [5, 3, 79, 1],
  [6, 0, 84, 2], [6, 2, 79, 0.5], [6, 2.5, 83, 0.5], [6, 3, 86, 1],
  [7, 0, 84, 3], [7, 3, 79, 1],
];

function duell(mix) {
  const spb = 60 / 128;
  const ch = {
    arp: mix.channel({ gain: 0.75, pan: -0.25, reverb: 0.2, delay: 0.25 }),
    lead: mix.channel({ gain: 0.85, pan: 0.15, reverb: 0.3, delay: 0.15 }),
    bells: mix.channel({ gain: 0.5, pan: 0.3, reverb: 0.35, delay: 0.25 }),
    brass: mix.channel({ gain: 0.85, reverb: 0.25 }),
    pad: mix.channel({ gain: 0.7, reverb: 0.4 }),
    bass: mix.channel({ gain: 0.95 }),
    drums: mix.channel({ gain: 0.8, reverb: 0.1 }),
  };
  const bars = 32;
  for (let bar = 0; bar < bars; bar++) {
    const c = DUELL_CHORDS[bar % 8];
    const section = bar < 8 ? 'intro' : bar < 16 ? 'A' : bar < 24 ? 'B' : 'A2';
    // Driving 16th arpeggio.
    for (let i = 0; i < 16; i++) {
      if (section === 'B' && i % 2) continue;
      const n = c.tones[[0, 1, 2, 3, 2, 1, 2, 3][i % 8]] + (i >= 8 && section === 'A2' ? 12 : 0);
      pluck(ch.arp, at(spb, bar, i / 4), n, 0.25 * spb, i % 4 === 0 ? 0.8 : 0.55);
    }
    // Pumping eighth-note bass with octave hops.
    for (let i = 0; i < 8; i++) bass(ch.bass, at(spb, bar, i / 2), c.root + (i % 2 ? 12 : 0), 0.45 * spb, i % 2 ? 0.6 : 0.85);
    if (section === 'B') for (const n of c.tones) pad(ch.pad, at(spb, bar, 0), n - 12, 4 * spb, 0.7, { bright: 2400 });
    // Drums.
    if (section !== 'B') {
      for (let b = 0; b < 4; b++) kick(ch.drums, at(spb, bar, b), section === 'intro' ? 0.6 : 0.9);
    } else {
      kick(ch.drums, at(spb, bar, 0), 0.8);
      kick(ch.drums, at(spb, bar, 2.5), 0.6);
    }
    if (section !== 'intro') {
      clap(ch.drums, at(spb, bar, 1), 0.75);
      clap(ch.drums, at(spb, bar, 3), 0.75);
    }
    for (let i = 0; i < 16; i++) hat(ch.drums, at(spb, bar, i / 4), i % 4 === 2 ? 0.55 : 0.28, { open: i % 4 === 2 && section !== 'intro' });
    // Brass stabs in the full sections.
    if (section === 'A' || section === 'A2') {
      for (const n of c.tones.slice(0, 3)) {
        brass(ch.brass, at(spb, bar, 0), n - 12, 0.6 * spb, 0.8);
        if (bar % 2) brass(ch.brass, at(spb, bar, 2.5), n - 12, 0.4 * spb, 0.65);
      }
    }
    // A little fill on the last beat of every 8 bars.
    if (bar % 8 === 7) for (let i = 0; i < 4; i++) snare(ch.drums, at(spb, bar, 3 + i / 4), 0.4 + i * 0.12);
  }
  melody(bell, ch.bells, DUELL_MELODY, spb, 8, { vel: 0.55 });
  melody(pluck, ch.lead, DUELL_MELODY, spb, 8, { vel: 0.7 });
  melody(whistle, ch.lead, DUELL_MELODY, spb, 16, { vel: 0.8 });
  melody(bell, ch.bells, DUELL_MELODY, spb, 24, { vel: 0.5, transpose: 12 });
  melody(brass, ch.lead, DUELL_MELODY, spb, 24, { vel: 0.85 });
  return { seconds: bars * 4 * spb };
}

// ---------- Jingles ----------

function sieg(mix) {
  const spb = 60 / 120;
  const b = mix.channel({ gain: 0.7, reverb: 0.4, delay: 0.25 });
  const br = mix.channel({ gain: 0.9, reverb: 0.3 });
  const d = mix.channel({ gain: 0.8, reverb: 0.2 });
  const p = mix.channel({ gain: 0.7, reverb: 0.5 });
  [72, 76, 79, 84, 88, 91].forEach((n, i) => bell(b, i * 0.25 * spb, n, 0.5 * spb, 0.7));
  [60, 64, 67, 72].forEach((n) => brass(br, 1.5 * spb, n, 1.2 * spb, 0.9));
  [79, 81, 83].forEach((n, i) => pluck(b, (3 + i * 0.25) * spb, n, 0.25 * spb, 0.8));
  [60, 64, 67, 72, 76].forEach((n) => {
    brass(br, 4 * spb, n, 3 * spb, 1);
    pad(p, 4 * spb, n, 3.5 * spb, 0.8, { bright: 3000 });
  });
  [84, 88, 91, 96].forEach((n, i) => bell(b, (4 + i * 0.125) * spb, n, 1.5 * spb, 0.6));
  kick(d, 1.5 * spb, 0.9);
  kick(d, 4 * spb, 1);
  hat(d, 4 * spb, 0.9, { open: true });
  for (let i = 0; i < 4; i++) snare(d, (3 + i * 0.25) * spb, 0.4 + i * 0.15);
  return { seconds: 8 * spb, loop: false };
}

function niederlage(mix) {
  const spb = 60 / 90;
  const v = mix.channel({ gain: 0.9, reverb: 0.5, delay: 0.2 });
  const p = mix.channel({ gain: 0.6, reverb: 0.6 });
  [79, 76, 72, 69].forEach((n, i) => vibes(v, i * 0.5 * spb, n, 0.6 * spb, 0.7));
  [53, 57, 60, 64].forEach((n) => pad(p, 2 * spb, n, 3 * spb, 0.7));
  [65, 69, 72, 76].forEach((n, i) => vibes(v, (2 + i * 0.12) * spb, n, 2.5 * spb, 0.5));
  return { seconds: 6 * spb, loop: false };
}

export const SONGS = {
  wiese: { render: wiese, mixer: { delayTime: (60 / 92) * 0.75 } },
  lobby: { render: lobby, mixer: { delayTime: (60 / 112) * 0.75, reverbSeconds: 2.4 } },
  duell: { render: duell, mixer: { delayTime: (60 / 128) * 0.75, reverbSeconds: 2.2 } },
  sieg: { render: sieg, mixer: { delayTime: 0.25 } },
  niederlage: { render: niederlage, mixer: { delayTime: 0.33 } },
};

export { createMixer };
