import { createRng, fbm } from './noise.js';
import { heightAt, distanceToPath, distanceToCity, distanceToLake } from './terrain.js';
import { CITY, LAKE, PODIUM } from './layout.js';
import { MEADOW_SPECIES } from './trees.js';

const ECO_PODS = [
  [-15, 42],
  [16, 32],
  [17, 8],
  [22, 58],
];

function free(x, z, { pathGap = 5, cityGap = 16 } = {}) {
  const h = heightAt(x, z);
  if (h < 1.0 || h > 70) return null;
  if (distanceToPath(x, z) < pathGap) return null;
  if (distanceToCity(x, z) < CITY.r + cityGap) return null;
  if (distanceToLake(x, z) < LAKE.r * 1.08) return null;
  if (Math.hypot(x, z - 62) < 14) return null;
  if (Math.hypot(x - PODIUM.x, z - PODIUM.z) < PODIUM.r + 5) return null;
  if (ECO_PODS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 8)) return null;
  return h;
}

// Fills the TreeField: groves and single trees in the meadow, bushes on the shores,
// and large low-detail forests on the hills towards the horizon.
export function placeTrees(field, seed = 21) {
  const rng = createRng(seed);
  const pick = () => MEADOW_SPECIES[Math.floor(rng() * MEADOW_SPECIES.length)];

  // Groves: a few clusters plus scattered singles across the near landscape.
  const groves = [];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = 45 + rng() * 280;
    groves.push([Math.cos(a) * r, Math.sin(a) * r, 8 + rng() * 22]);
  }
  let placed = 0;
  for (let i = 0; i < 6000 && placed < 420; i++) {
    let x;
    let z;
    if (rng() < 0.65) {
      const [gx, gz, gr] = groves[Math.floor(rng() * groves.length)];
      const a = rng() * Math.PI * 2;
      const r = gr * Math.sqrt(rng());
      x = gx + Math.cos(a) * r;
      z = gz + Math.sin(a) * r;
    } else {
      const a = rng() * Math.PI * 2;
      const r = 25 + rng() * 330;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    const h = free(x, z);
    if (h === null) continue;
    field.add(pick(), x, h - 0.2, z, { scale: 0.8 + rng() * 0.5, rotation: rng() * Math.PI * 2 });
    placed++;
  }

  // Bushes along the lake shore and the path edges.
  for (let i = 0; i < 400; i++) {
    const a = rng() * Math.PI * 2;
    const r = LAKE.r * (1.1 + rng() * 0.35);
    const x = LAKE.x + Math.cos(a) * r;
    const z = LAKE.z + Math.sin(a) * r;
    const h = free(x, z, { pathGap: 3 });
    if (h === null || rng() < 0.6) continue;
    field.add(rng() < 0.25 ? 'bush' : 'bush2', x, h - 0.1, z, { scale: 0.7 + rng() * 0.6, rotation: rng() * 6.28 });
  }

  // Distant forests: big noise-shaped patches on the hills, always drawn at low detail.
  let far = 0;
  for (let i = 0; i < 40000 && far < 3200; i++) {
    const a = rng() * Math.PI * 2;
    const r = 330 + Math.pow(rng(), 0.7) * 1900;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (fbm(x * 0.004 + 50, z * 0.004 - 20, 3) < 0.52) continue;
    const h = free(x, z);
    if (h === null) continue;
    field.add(rng() < 0.3 ? 'pine' : pick(), x, h - 0.3, z, { scale: 1 + rng() * 0.7, rotation: rng() * 6.28, lowOnly: true });
    far++;
  }
}
