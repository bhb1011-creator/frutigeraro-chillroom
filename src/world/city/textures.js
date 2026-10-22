import * as THREE from 'three';
import { createRng } from '../noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/**
 * Curtain wall: `rows` floors x `cols` glass panels per tile, with white spandrels, thin mullions,
 * subtle per-panel tint changes and a few lit offices behind the glass.
 */
export function facadeTextures({ hue = 200, cols = 8, rows = 4, seed = 1, spandrel = 0.11, lit = 0.25 } = {}) {
  return cached(`facade|${hue}|${cols}|${rows}|${seed}|${spandrel}|${lit}`, () => {
    const W = 1024;
    const H = 1024;
    const rng = createRng(seed);
    const [cMap, g] = canvas(W, H);
    const [cRough, r] = canvas(W, H);
    const [cEmit, e] = canvas(W, H);
    e.fillStyle = '#000';
    e.fillRect(0, 0, W, H);
    const pw = W / cols;
    const fh = H / rows;
    const sh = fh * spandrel;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * pw;
        const y = row * fh + sh;
        const h = fh - sh;
        const l = 38 + rng() * 14;
        const grad = g.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, `hsl(${hue + rng() * 10 - 5}, 70%, ${l + 22}%)`);
        grad.addColorStop(0.55, `hsl(${hue + 4}, 75%, ${l}%)`);
        grad.addColorStop(1, `hsl(${hue + 8}, 80%, ${l - 10}%)`);
        g.fillStyle = grad;
        g.fillRect(x, y, pw, h);
        // A diagonal sheen like a sky reflection.
        g.save();
        g.beginPath();
        g.rect(x, y, pw, h);
        g.clip();
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.beginPath();
        const o = rng() * pw;
        g.moveTo(x + o, y);
        g.lineTo(x + o + pw * 0.35, y);
        g.lineTo(x + o - pw * 0.25, y + h);
        g.lineTo(x + o - pw * 0.6, y + h);
        g.fill();
        g.restore();

        // Some offices are lit: ceiling light strips, a desk silhouette and a plant.
        const room = rng() < lit;
        if (room) {
          g.fillStyle = `hsla(${hue}, 40%, 85%, 0.45)`;
          g.fillRect(x + 3, y + 3, pw - 6, h - 6);
          g.fillStyle = 'rgba(40,70,100,0.35)';
          g.fillRect(x + pw * 0.15, y + h * 0.62, pw * 0.5, h * 0.06);
          g.fillRect(x + pw * 0.2, y + h * 0.68, pw * 0.04, h * 0.3);
          g.fillStyle = 'rgba(60,150,70,0.55)';
          g.beginPath();
          g.arc(x + pw * 0.8, y + h * 0.7, pw * 0.1, 0, Math.PI * 2);
          g.fill();
          e.fillStyle = 'rgba(255,250,235,0.9)';
          e.fillRect(x + pw * 0.15, y + 4, pw * 0.7, 3);
          e.fillStyle = 'rgba(200,230,255,0.25)';
          e.fillRect(x + 3, y + 3, pw - 6, h - 6);
        }
        const rough = room ? 30 : 8 + rng() * 22;
        r.fillStyle = `rgb(${rough},${rough},${rough})`;
        r.fillRect(x, y, pw, h);
      }
      // Spandrel band (white floor edge) with a thin shadow line.
      const sp = g.createLinearGradient(0, row * fh, 0, row * fh + sh);
      sp.addColorStop(0, '#f6fbfe');
      sp.addColorStop(1, '#cfe2ee');
      g.fillStyle = sp;
      g.fillRect(0, row * fh, W, sh);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(0, row * fh, W, 2);
      r.fillStyle = 'rgb(110,110,110)';
      r.fillRect(0, row * fh, W, sh);
    }
    // Mullions.
    for (let col = 0; col <= cols; col++) {
      const x = col * pw;
      g.fillStyle = 'rgba(205,226,240,0.9)';
      g.fillRect(x - 1.5, 0, 3, H);
      r.fillStyle = 'rgb(90,90,90)';
      r.fillRect(x - 2, 0, 4, H);
    }
    return { map: toTexture(cMap), roughnessMap: toTexture(cRough, false), emissiveMap: toTexture(cEmit) };
  });
}

// Polished white marble with soft grey-blue veins for lobby floors.
export function marbleTexture() {
  return cached('marble', () => {
    const S = 1024;
    const rng = createRng(5);
    const [c, g] = canvas(S, S);
    g.fillStyle = '#f5f8fa';
    g.fillRect(0, 0, S, S);
    for (let v = 0; v < 26; v++) {
      g.strokeStyle = `rgba(${150 + rng() * 40},${170 + rng() * 30},${190 + rng() * 30},${0.15 + rng() * 0.3})`;
      g.lineWidth = 0.6 + rng() * 2.4;
      g.beginPath();
      let x = rng() * S;
      let y = rng() * S;
      g.moveTo(x, y);
      for (let i = 0; i < 30; i++) {
        x += (rng() - 0.3) * 60;
        y += (rng() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // Tile joints, 4x4 per texture.
    g.fillStyle = 'rgba(170,190,205,0.6)';
    for (let i = 0; i <= 4; i++) {
      g.fillRect(0, (i * S) / 4 - 1, S, 2);
      g.fillRect((i * S) / 4 - 1, 0, 2, S);
    }
    return toTexture(c);
  });
}

// Glossy Aero-style info screen: sky gradient, glass header, weather widget and a clock.
export function screenTexture(title = 'Willkommen in Aero City', seed = 1) {
  return cached(`screen|${title}|${seed}`, () => {
    const W = 512;
    const H = 768;
    const [c, g] = canvas(W, H);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2aa8f0');
    bg.addColorStop(0.6, '#7fd6ff');
    bg.addColorStop(1, '#c8f2d8');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // Glossy header bar.
    const hb = g.createLinearGradient(0, 0, 0, 110);
    hb.addColorStop(0, 'rgba(255,255,255,0.85)');
    hb.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    hb.addColorStop(0.51, 'rgba(255,255,255,0.15)');
    hb.addColorStop(1, 'rgba(255,255,255,0.3)');
    g.fillStyle = hb;
    g.fillRect(0, 0, W, 110);
    g.fillStyle = '#ffffff';
    g.font = 'bold 34px sans-serif';
    g.fillText(title, 24, 66);
    // Sun and cloud.
    const sun = g.createRadialGradient(150, 270, 10, 150, 270, 90);
    sun.addColorStop(0, '#fff9c4');
    sun.addColorStop(0.5, '#ffd84a');
    sun.addColorStop(1, 'rgba(255,200,40,0)');
    g.fillStyle = sun;
    g.beginPath();
    g.arc(150, 270, 90, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (const [x, y, rr] of [[200, 320, 50], [250, 300, 60], [300, 325, 45], [240, 340, 45]]) {
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.font = 'bold 96px sans-serif';
    g.fillText('24°', 300, 260);
    g.font = '32px sans-serif';
    g.fillText('Sonnig · Wind 12 km/h', 40, 450);
    g.font = 'bold 72px sans-serif';
    g.fillText(seed % 2 ? '14:00' : '09:41', 40, 560);
    // Leaf + bubble icons row.
    for (let i = 0; i < 4; i++) {
      const x = 70 + i * 120;
      const grad = g.createRadialGradient(x - 12, 640, 4, x, 650, 42);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, i % 2 ? '#8ef06a' : '#6fd6ff');
      grad.addColorStop(1, i % 2 ? '#2fae3a' : '#1a7fd8');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, 650, 40, 0, Math.PI * 2);
      g.fill();
    }
    return toTexture(c);
  });
}
