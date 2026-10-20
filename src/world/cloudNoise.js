import * as THREE from 'three';
import { createRng } from './noise.js';

// Tileable 3D noise for volumetric clouds, generated once at startup.
//  R: Perlin-Worley "billow" shape (puffy cauliflower lumps)
//  G: high-frequency Worley detail used to erode the edges

const SIZE = 64;

function worleyField(cells, seed) {
  const rng = createRng(seed);
  const pts = new Float32Array(cells * cells * cells * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = rng();
  const out = new Float32Array(SIZE * SIZE * SIZE);
  const scale = cells / SIZE;
  let o = 0;
  for (let z = 0; z < SIZE; z++) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const px = (x + 0.5) * scale;
        const py = (y + 0.5) * scale;
        const pz = (z + 0.5) * scale;
        const cx = Math.floor(px);
        const cy = Math.floor(py);
        const cz = Math.floor(pz);
        let best = 9;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              const nz = cz + dz;
              const wx = (nx + cells) % cells;
              const wy = (ny + cells) % cells;
              const wz = (nz + cells) % cells;
              const k = ((wz * cells + wy) * cells + wx) * 3;
              const fx = nx + pts[k] - px;
              const fy = ny + pts[k + 1] - py;
              const fz = nz + pts[k + 2] - pz;
              const d = fx * fx + fy * fy + fz * fz;
              if (d < best) best = d;
            }
          }
        }
        out[o++] = 1 - Math.min(1, Math.sqrt(best));
      }
    }
  }
  return out;
}

function valueField(period, seed) {
  const rng = createRng(seed);
  const lattice = new Float32Array(period * period * period).map(() => rng());
  const at = (x, y, z) => lattice[(((z % period) * period + (y % period)) * period + (x % period))];
  const s = (t) => t * t * (3 - 2 * t);
  const out = new Float32Array(SIZE * SIZE * SIZE);
  const scale = period / SIZE;
  let o = 0;
  for (let z = 0; z < SIZE; z++) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const px = x * scale;
        const py = y * scale;
        const pz = z * scale;
        const ix = Math.floor(px);
        const iy = Math.floor(py);
        const iz = Math.floor(pz);
        const fx = s(px - ix);
        const fy = s(py - iy);
        const fz = s(pz - iz);
        const c00 = at(ix, iy, iz) * (1 - fx) + at(ix + 1, iy, iz) * fx;
        const c10 = at(ix, iy + 1, iz) * (1 - fx) + at(ix + 1, iy + 1, iz) * fx;
        const c01 = at(ix, iy, iz + 1) * (1 - fx) + at(ix + 1, iy, iz + 1) * fx;
        const c11 = at(ix, iy + 1, iz + 1) * (1 - fx) + at(ix + 1, iy + 1, iz + 1) * fx;
        out[o++] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
      }
    }
  }
  return out;
}

const remap = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);

export function createCloudNoise() {
  const w4 = worleyField(4, 11);
  const w8 = worleyField(8, 12);
  const w16 = worleyField(16, 13);
  const w32 = worleyField(32, 14);
  const v4 = valueField(4, 21);
  const v8 = valueField(8, 22);
  const v16 = valueField(16, 23);
  const n = SIZE * SIZE * SIZE;
  const shape = new Float32Array(n);
  const detail = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const worley = w4[i] * 0.625 + w8[i] * 0.25 + w16[i] * 0.125;
    const value = v4[i] * 0.55 + v8[i] * 0.3 + v16[i] * 0.15;
    // Perlin-Worley: value noise pushed up where the Worley cells are, giving billowy lumps.
    shape[i] = remap(value, worley - 1, 1, 0, 1);
    detail[i] = w8[i] * 0.5 + w16[i] * 0.3 + w32[i] * 0.2;
  }
  // Stretch both channels to the full 0..1 range so the coverage setting behaves predictably.
  const data = new Uint8Array(n * 2);
  for (const [ch, arr] of [[0, shape], [1, detail]]) {
    const sorted = Float32Array.from(arr).sort();
    const lo = sorted[Math.floor(n * 0.01)];
    const hi = sorted[Math.floor(n * 0.995)];
    for (let i = 0; i < n; i++) data[i * 2 + ch] = Math.min(1, Math.max(0, (arr[i] - lo) / (hi - lo))) * 255;
  }
  const tex = new THREE.Data3DTexture(data, SIZE, SIZE, SIZE);
  tex.format = THREE.RGFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
