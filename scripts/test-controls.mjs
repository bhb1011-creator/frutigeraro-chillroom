// Drives the player physics in headless Chromium: door, wall, stairs and jump.
// Usage: node scripts/test-controls.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
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
  results.jumpPeak > 0.8;
console.log(ok ? 'PASS' : 'FAIL');
await browser.close();
await server.close();
process.exit(ok ? 0 : 1);
