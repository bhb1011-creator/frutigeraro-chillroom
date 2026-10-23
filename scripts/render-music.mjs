// Renders the songs from src/audio/songs.js to public/assets/music/*.mp3.
// Looping songs get their reverb tail folded back onto the start so the loop is seamless.
// Usage: npm run music [-- name,name]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/assets/music/', import.meta.url));
const NAMES = (process.argv[2] ?? 'wiese,brise,himmel,lobby,duell,sieg,niederlage').split(',');

await mkdir(OUT, { recursive: true });
const server = await createServer({ server: { port: 5194 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('http://localhost:5194/src/audio/synth.js');

for (const name of NAMES) {
  const start = Date.now();
  const wavBase64 = await page.evaluate(async (name) => {
    const { SONGS, createMixer } = await import('/src/audio/songs.js');
    const song = SONGS[name];
    const rate = 44100;
    const tail = 4;
    // First pass on a tiny context just to learn the song's length.
    const probe = new OfflineAudioContext(2, rate, rate);
    const { seconds, loop = true } = song.render(createMixer(probe, song.mixer));
    const ctx = new OfflineAudioContext(2, Math.ceil((seconds + tail) * rate), rate);
    song.render(createMixer(ctx, song.mixer));
    const buf = await ctx.startRendering();
    // Jingles keep 2 s of their reverb tail and fade out over the last second.
    const len = loop ? Math.round(seconds * rate) : Math.min(buf.length, Math.round((seconds + 2) * rate));
    const fade = loop ? 0 : rate;
    const chans = [buf.getChannelData(0), buf.getChannelData(1)].map((d) => {
      const out = new Float32Array(len);
      out.set(d.subarray(0, len));
      if (loop) for (let i = 0; i < d.length - len && i < len; i++) out[i] += d[len + i];
      for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
      return out;
    });
    // Normalise to -1 dBFS peak.
    let peak = 0;
    for (const c of chans) for (const v of c) peak = Math.max(peak, Math.abs(v));
    const gain = peak > 0 ? 0.89 / peak : 1;
    // 16-bit stereo WAV.
    const data = new DataView(new ArrayBuffer(44 + len * 4));
    const str = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
    str(0, 'RIFF');
    data.setUint32(4, 36 + len * 4, true);
    str(8, 'WAVEfmt ');
    data.setUint32(16, 16, true);
    data.setUint16(20, 1, true);
    data.setUint16(22, 2, true);
    data.setUint32(24, rate, true);
    data.setUint32(28, rate * 4, true);
    data.setUint16(32, 4, true);
    data.setUint16(34, 16, true);
    str(36, 'data');
    data.setUint32(40, len * 4, true);
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < 2; c++) {
        const s = Math.max(-1, Math.min(1, chans[c][i] * gain));
        data.setInt16(44 + (i * 2 + c) * 2, s * 32767, true);
      }
    }
    const bytes = new Uint8Array(data.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, name);
  const wav = `${OUT}${name}.wav`;
  await writeFile(wav, Buffer.from(wavBase64, 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '160k', `${OUT}${name}.mp3`]);
  await rm(wav);
  console.log(`${name}.mp3 (${((Date.now() - start) / 1000).toFixed(1)}s)`);
}

await browser.close();
await server.close();
