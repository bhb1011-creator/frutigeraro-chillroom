// Drives the player physics in headless Chromium: door, wall, stairs and jump.
// Usage: node scripts/test-controls.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('console', (m) => m.type() === 'warning' && !m.text().includes('WebGL') && console.log('warn:', m.text()));
await page.goto('http://localhost:5197/?pause');
await page.waitForFunction(() => window.__game && window.__ready, null, { timeout: 600_000 });

const results = await page.evaluate(() => {
  const { controls, world } = window.__game;
  const p = () => window.__game.player.position;
  const run = (seconds, keys, yaw) => {
    controls.keys.clear();
    keys.forEach((k) => controls.keys.add(k));
    if (yaw !== undefined) controls.yaw = yaw;
    for (let i = 0; i < seconds * 60; i++) controls.update(1 / 60);
    controls.keys.clear();
    return { x: +p().x.toFixed(2), y: +p().y.toFixed(2), z: +p().z.toFixed(2) };
  };
  const place = (x, z) => {
    p().set(x, world.groundAt(x, z, 1000), z);
    controls.velocity.set(0, 0, 0);
    run(0.2, []);
  };
  const out = {};
  const ramp = world.ramps[0];
  const lobbyFloor = world.floors[0].y;
  const firstFloor = world.floors[1].y;
  out.floors = { lobbyFloor, firstFloor };
  out.stairRun = ramp.run;

  // 1) Walk straight through the Aqua Tower's door (door faces +z at z = -144).
  place(42, -136);
  out.door = run(2.5, ['KeyW'], 0);
  // 2) Run into the east glass wall of the same tower from outside (wall at x = 52).
  place(57, -154);
  out.wall = run(2, ['KeyW', 'ShiftLeft'], Math.PI / 2);
  // 3) Climb the stairs to the first floor.
  p().set(ramp.x - ramp.dx * 0.5, lobbyFloor, ramp.z - ramp.dz * 0.5);
  controls.velocity.set(0, 0, 0);
  out.stairs = run(3, ['KeyW'], Math.atan2(-ramp.dx, -ramp.dz));
  // 3b) Furniture blocks: walk at every lobby/first-floor obstacle and never end up inside one.
  let inside = 0;
  let tested = 0;
  for (const c of world.circles) {
    if (c.r > 0.8 || c.y1 - c.y0 > 2) continue; // furniture only (not columns or masts)
    // Approach from a direction where the floor between start and obstacle is the obstacle's own floor.
    let dir = null;
    for (let k = 0; k < 8 && !dir; k++) {
      const a = (k / 8) * Math.PI * 2;
      const ok = [1.2, 2, 3].every((d) => Math.abs(world.groundAt(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, c.y0 + 0.5) - c.y0) < 0.2);
      if (ok) dir = a;
    }
    if (dir === null) continue;
    tested++;
    p().set(c.x + Math.cos(dir) * 3, c.y0, c.z + Math.sin(dir) * 3);
    controls.velocity.set(0, 0, 0);
    // Yaw is camera-relative: forward is (-sin yaw, -cos yaw), so aim back at the obstacle.
    run(1.2, ['KeyW'], Math.atan2(Math.cos(dir), Math.sin(dir)));
    const d = Math.hypot(p().x - c.x, p().z - c.z);
    if (d < c.r + 0.44 && Math.abs(p().y - c.y0) < 1) {
      inside++;
      (out.bad ??= []).push({ c: [+c.x.toFixed(1), +c.z.toFixed(1), c.r, +c.y0.toFixed(1)], end: [+p().x.toFixed(2), +p().y.toFixed(2), +p().z.toFixed(2)] });
    }
  }
  out.furniture = { tested, inside };
  // 3b') Furniture placement: every piece stands on its own floor (not over the stair void) and
  // no piece sticks through a wall or a glass facade.
  const segDist = (w, x, z) => {
    const ex = w.bx - w.ax;
    const ez = w.bz - w.az;
    const t = Math.max(0, Math.min(1, ((x - w.ax) * ex + (z - w.az) * ez) / (ex * ex + ez * ez || 1)));
    return Math.hypot(x - (w.ax + ex * t), z - (w.az + ez * t));
  };
  const misplaced = [];
  for (const c of world.circles) {
    if (c.r > 0.8 || c.y1 - c.y0 > 2) continue;
    const floor = world.groundAt(c.x, c.z, c.y0 + 0.1);
    const wall = world.walls.find((w) => w.y0 < c.y0 + 1 && w.y1 > c.y0 + 0.2 && segDist(w, c.x, c.z) < c.r * 0.6);
    if (Math.abs(floor - c.y0) > 0.2 || wall) misplaced.push({ c: [+c.x.toFixed(1), +c.z.toFixed(1), c.r, +c.y0.toFixed(1)], floor: +floor.toFixed(2), wall: wall && [wall.ax, wall.az, wall.bx, wall.bz, wall.y0, wall.y1].map((v) => +v.toFixed(2)) });
  }
  out.misplaced = misplaced;
  // 3c) The space under the stairs is closed from behind.
  const back = { x: ramp.x + ramp.dx * (ramp.run + 1.2), z: ramp.z + ramp.dz * (ramp.run + 1.2) };
  p().set(back.x, lobbyFloor, back.z);
  controls.velocity.set(0, 0, 0);
  const behind = run(2, ['KeyW'], Math.atan2(ramp.dx, ramp.dz));
  out.underStairs = +(((behind.x - ramp.x) * ramp.dx + (behind.z - ramp.z) * ramp.dz)).toFixed(2);
  // 4) Jump on the meadow.
  place(0, 60);
  controls.jumpQueued = true;
  controls.update(1 / 60);
  for (let i = 0; i < 20; i++) controls.update(1 / 60);
  out.jumpPeak = +(p().y - world.groundAt(p().x, p().z, p().y)).toFixed(2);
  out.landed = run(1.5, []);
  return out;
});
console.log(JSON.stringify(results, null, 1));
const ok =
  results.door.z < -145.5 && Math.abs(results.door.y - results.floors.lobbyFloor) < 0.05 &&
  results.wall.x >= 52.4 &&
  Math.abs(results.stairs.y - results.floors.firstFloor) < 0.05 &&
  results.jumpPeak > 0.8 &&
  results.furniture.tested > 20 && results.furniture.inside === 0 && results.misplaced.length === 0 &&
  results.underStairs >= results.stairRun - 0.05;
console.log(ok ? 'PASS' : 'FAIL');
await browser.close();
await server.close();
process.exit(ok ? 0 : 1);
