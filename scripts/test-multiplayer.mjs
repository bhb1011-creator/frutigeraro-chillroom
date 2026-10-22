// Two players in one room (two tabs, local transport): presence, challenge, a full online duel,
// rematch, giving up and leaving. Usage: node scripts/test-multiplayer.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5193 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
const errors = [];
const open = async (name, color) => {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`http://localhost:5193/?pause&netz=lokal&raum=testraum&name=${name}&figur=${color}`);
  await page.waitForFunction(() => window.__game && window.__ready, null, { timeout: 600_000 });
  return page;
};
const a = await open('Anna', 'gold');
const b = await open('Ben', 'gold');

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
const wait = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 20_000 }).then(() => true, () => false);

// Both see each other.
check(await wait(a, () => window.__game.net?.peers.size === 1), 'Anna sees one other player');
check(await wait(b, () => window.__game.net?.peers.size === 1), 'Ben sees one other player');
const names = await b.evaluate(() => [...window.__game.net.peers.values()].map((p) => p.name));
check(names[0] === 'Anna', `Ben sees Anna's name (${names})`);

// Presence: Anna walks somewhere, Ben's copy of her follows.
await a.evaluate(() => {
  const g = window.__game;
  g.player.position.set(12, g.world.groundAt(12, 40, 100), 40);
  for (let i = 0; i < 12; i++) g.netTick(0.1);
});
await b.waitForTimeout(300);
const seen = await b.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 30; i++) g.netTick(1 / 30);
  const r = [...g.remotes.players.values()][0];
  return { visible: r.buddy.visible, x: r.buddy.position.x, z: r.buddy.position.z, tag: r.tag.visible };
});
check(seen.visible && Math.abs(seen.x - 12) < 0.5 && Math.abs(seen.z - 40) < 0.5, `Ben sees Anna where she stands (${seen.x.toFixed(2)}, ${seen.z.toFixed(2)})`);

// Anna challenges Ben at the terminal; Ben accepts.
await a.evaluate(() => {
  window.__game.openDuelMenu();
});
check(await wait(a, () => !!document.querySelector('[data-friend]')), 'Ben is listed in Anna\'s duel menu');
await a.click('[data-friend]');
check(await wait(b, () => [...document.querySelectorAll('.aero-toast button')].some((x) => x.textContent === 'Annehmen')), 'Ben gets the challenge');
await b.click('.aero-toast button.green');
check(await wait(a, () => window.__game.mode === 'duel'), 'Anna enters the duel');
check(await wait(b, () => window.__game.mode === 'duel'), 'Ben enters the duel');
const roles = [await a.evaluate(() => window.__game.duel.role), await b.evaluate(() => window.__game.duel.role)];
check(roles[0] === 'host' && roles[1] === 'guest', `host and guest (${roles})`);
const colors = await b.evaluate(() => window.__game.duel.fighters.map((f) => f.buddy.userData));
check(!!colors, 'fighters built on both sides');

// Plays both sides until the match is over: each steps in turn, so the network messages flow.
const fight = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const d = g.duel;
    const me = d.fighters[d.me];
    const foe = d.fighters[1 - d.me];
    for (let i = 0; i < 20; i++) {
      g.controls.joystick.set(0, 0);
      if (d.phase === 'fight') {
        const dir = foe.pos.clone().sub(me.pos).setY(0);
        const dist = dir.length();
        dir.normalize();
        const fwd = new d.camera.position.constructor();
        d.camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const right = fwd.clone().set(-fwd.z, 0, fwd.x);
        if (dist > 1.9) g.controls.joystick.set(dir.dot(right), -dir.dot(fwd));
        if (Math.random() < 0.06) d.queuedAttack = ['links', 'rechts', 'oben'][Math.floor(Math.random() * 3)];
      }
      d.update(1 / 60);
      g.netTick(1 / 60);
      for (const f of d.fighters) if (!Number.isFinite(f.pos.x + f.pos.y + f.pos.z)) return { error: 'NaN' };
    }
    g.controls.joystick.set(0, 0);
    return { phase: d.phase, score: d.score.slice(), round: d.round, hits: d.stats.hits.slice(), result: !!document.querySelector('.again') };
  });
let sa;
let sb;
for (let i = 0; i < 1200; i++) {
  sa = await fight(a);
  sb = await fight(b);
  if (sa.error || sb.error) break;
  if (sa.phase === 'done' && sb.phase === 'done') break;
}
console.log(`  host: ${JSON.stringify(sa)}\n  guest: ${JSON.stringify(sb)}`);
check(!sa.error && !sb.error, 'no invalid positions');
check(sa.phase === 'done' && sb.phase === 'done', 'the match ends on both sides');
check(sa.score[0] + sa.score[1] === 3 && sa.round === 3, 'exactly 3 rounds');
check(JSON.stringify(sa.score) === JSON.stringify(sb.score), 'both see the same score');
check(sa.hits[1] > 0, `the guest's swings land on the host (${sa.hits[1]} hits)`);
check(sa.result && sb.result, 'both see the result');
const winner = [await a.textContent('.aero-panel h1'), await b.textContent('.aero-panel h1')];
check(winner.includes('Sieg!') && winner.includes('Niederlage'), `one wins, one loses (${winner})`);

// Rematch needs both.
await a.click('.again');
await a.waitForTimeout(200);
check((await a.evaluate(() => window.__game.duel.phase)) === 'done', 'one rematch click alone waits');
check(await wait(b, () => document.querySelector('.status')?.textContent.includes('Revanche')), 'Ben is told Anna wants a rematch');
await b.click('.again');
check(await wait(a, () => window.__game.duel.round === 1 && window.__game.duel.phase === 'countdown'), 'rematch restarts for the host');
check(await wait(b, () => !document.querySelector('.again') && window.__game.duel.score.join() === '0,0'), 'rematch restarts for the guest');

// Ben gives up: both are back in the lobby (Anna after seeing the result).
await b.keyboard.press('Escape');
check(await wait(b, () => window.__game.mode === 'play'), 'Escape takes Ben back to the lobby');
check(await wait(a, () => document.querySelector('.status')?.textContent.includes('verlassen')), 'Anna learns that Ben left');
await a.click('.back');
check(await wait(a, () => window.__game.mode === 'play'), 'Anna returns to the lobby');

// A declined challenge.
await a.evaluate(() => {
  window.__game.openDuelMenu();
});
await a.click('[data-friend]');
check(await wait(b, () => !!document.querySelector('.aero-toast button')), 'second challenge arrives');
await b.click('.aero-toast button:not(.green)');
check(await wait(a, () => window.__game.mode === 'play' && [...document.querySelectorAll('.aero-toast')].some((t) => t.textContent.includes('abgelehnt'))), 'declining tells Anna');

// Ben closes the tab.
await b.close();
check(await wait(a, () => window.__game.net.peers.size === 0 && window.__game.remotes.count === 0), 'Ben leaving removes his buddy');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
await server.close();
console.log(failures.length ? `FAIL (${failures.length})` : 'PASS');
process.exit(failures.length ? 1 : 0);
