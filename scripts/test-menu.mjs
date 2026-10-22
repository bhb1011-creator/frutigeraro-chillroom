// Start screen: camera flight behind it, name, colour, a room for friends, and into the game.
// Also checks that a real P2P room (Trystero) can be opened without errors.
// Usage: node scripts/test-menu.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5194 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 900, height: 560 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const errors = [];
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5194/?netz=lokal');
await page.waitForFunction(() => window.__game && window.__ready, null, { timeout: 600_000 });
check(await page.isVisible('.aero-start'), 'start screen is shown');
check((await page.$$('.aero-start canvas')).length === 0, 'no map on the start screen');

// The camera flies: it moves between frames, stays finite and above the ground.
const cam = () => page.evaluate(() => window.__game.camera.position.toArray());
const c1 = await cam();
await page.waitForTimeout(1500);
const c2 = await cam();
const moved = Math.hypot(c2[0] - c1[0], c2[2] - c1[2]);
check(c2.every(Number.isFinite) && moved > 0.05, `camera is flying (moved ${moved.toFixed(2)} m)`);
const clear = await page.evaluate(() => {
  // Sample the whole loop: the camera must stay over the meadow and look at both skylines.
  const { menuFlight, heightAt, camera } = window.__game.debug;
  const cam = camera.clone();
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  let minAbove = Infinity;
  let maxR = 0;
  let bad = 0;
  for (let t = 0; t < 150; t += 0.5) {
    menuFlight(cam, t);
    minAbove = Math.min(minAbove, cam.position.y - heightAt(cam.position.x, cam.position.z));
    maxR = Math.max(maxR, Math.hypot(cam.position.x, cam.position.z));
    cam.updateMatrixWorld();
    const v = (x, y, z) => {
      const p = new cam.position.constructor(x, y, z).project(cam);
      return Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1;
    };
    if (!v(42, 60, -110) || !v(-380, 150, -1500)) bad++;
  }
  return { minAbove, maxR, bad };
});
check(clear.minAbove > 8, `flight stays above the hills (lowest ${clear.minAbove.toFixed(1)} m)`);
check(clear.maxR < 400, `flight stays over the grass (max ${clear.maxR.toFixed(0)} m from centre)`);
check(clear.bad === 0, `towers and skyline are always in view (${clear.bad} misses)`);

// Name, colour and a room.
await page.fill('.aero-start .name', 'Lena<b>');
await page.click('.aero-start .colors button[title="Pink"]');
await page.click('.aero-start .together');
const link = await page.inputValue('.aero-start .link');
check(/[?&]raum=[a-z]+-\d{4}/.test(link), `room link is offered (${link})`);
await page.click('.aero-start .copy');
check((await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))) === link, 'link can be copied');
await page.click('.aero-start .play');
check(await page.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 10_000 }).then(() => true, () => false), 'Raum betreten starts the game');
check(await page.waitForFunction(() => window.__game.net, null, { timeout: 10_000 }).then(() => true, () => false), 'the room is joined');
check((await page.evaluate(() => new URL(location.href).searchParams.get('raum'))) === new URL(link).searchParams.get('raum'), 'the address bar keeps the room');
check(await page.isVisible('.aero-room'), 'room badge is shown');
check((await page.evaluate(() => localStorage.getItem('aero-name'))) === 'Lenab', 'the name is cleaned up and remembered');
await page.waitForTimeout(500);

// The real P2P transport loads and opens a room without page errors.
await page.close();
const p2p = await context.newPage();
p2p.on('pageerror', (e) => errors.push(`p2p: ${e.message}`));
await p2p.goto('http://localhost:5194/?pause&raum=selbsttest-1', { timeout: 300_000 });
await p2p.waitForFunction(() => window.__game && window.__ready, null, { timeout: 600_000 });
check(await p2p.waitForFunction(() => window.__game.net?.selfId, null, { timeout: 20_000 }).then(() => true, () => false), 'P2P room opens');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
await server.close();
console.log(failures.length ? `FAIL (${failures.length})` : 'PASS');
process.exit(failures.length ? 1 : 0);
