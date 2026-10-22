import { WORLD_RADIUS } from '../world/layout.js';
import { heightAt } from '../world/terrain.js';

// Simple world physics for the player: floors (terrain, building floors, stair ramps),
// vertical wall segments and round obstacles, all in world coordinates.
//
//   floors:  { outline: [[x, z]...], holes: [[[x, z]...]], y }  — flat floor inside a polygon
//   ramps:   { x, z, dx, dz, run, width, y0, y1 }               — stair ramp rising along (dx, dz)
//   walls:   { ax, az, bx, bz, y0, y1 }                          — blocks the player between y0 and y1
//   circles: { x, z, r, y0, y1 }                                 — pillars, turbine masts

export const STEP_UP = 0.55;

function insidePolygon(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class CollisionWorld {
  constructor({ floors = [], ramps = [], walls = [], circles = [], bounds = WORLD_RADIUS } = {}) {
    this.floors = floors;
    this.ramps = ramps;
    this.walls = walls;
    this.circles = circles;
    this.bounds = bounds;
  }

  add({ floors = [], ramps = [], walls = [], circles = [] }) {
    this.floors.push(...floors);
    this.ramps.push(...ramps);
    this.walls.push(...walls);
    this.circles.push(...circles);
  }

  /** Highest walkable surface under (x, z) that is not above `y + STEP_UP`. */
  groundAt(x, z, y) {
    let best = heightAt(x, z);
    const limit = y + STEP_UP;
    for (const f of this.floors) {
      if (f.y > limit || f.y <= best) continue;
      if (!insidePolygon(f.outline, x, z)) continue;
      if (f.holes?.some((h) => insidePolygon(h, x, z))) continue;
      best = f.y;
    }
    for (const r of this.ramps) {
      const px = x - r.x;
      const pz = z - r.z;
      const t = px * r.dx + pz * r.dz;
      const s = Math.abs(px * -r.dz + pz * r.dx);
      if (t < 0 || t > r.run || s > r.width / 2) continue;
      const h = r.y0 + (t / r.run) * (r.y1 - r.y0);
      if (h <= limit && h > best) best = h;
    }
    return best;
  }

  /** Pushes a standing cylinder (feet at y, given radius and height) out of walls and pillars. */
  resolve(pos, radius, height) {
    const y0 = pos.y + 0.05;
    const y1 = pos.y + height;
    for (let pass = 0; pass < 2; pass++) {
      for (const w of this.walls) {
        if (w.y1 < y0 || w.y0 > y1) continue;
        const ex = w.bx - w.ax;
        const ez = w.bz - w.az;
        const len2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((pos.x - w.ax) * ex + (pos.z - w.az) * ez) / len2));
        const cx = w.ax + ex * t;
        const cz = w.az + ez * t;
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d = Math.hypot(dx, dz);
        if (d < radius && d > 1e-6) {
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        }
      }
      for (const c of this.circles) {
        if (c.y1 < y0 || c.y0 > y1) continue;
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + radius;
        if (d < min && d > 1e-6) {
          pos.x = c.x + (dx / d) * min;
          pos.z = c.z + (dz / d) * min;
        }
      }
    }
    // Invisible edge of the playable meadow: the skyline stays out of reach.
    const r = Math.hypot(pos.x, pos.z);
    if (r > this.bounds) {
      pos.x *= this.bounds / r;
      pos.z *= this.bounds / r;
    }
  }
}
