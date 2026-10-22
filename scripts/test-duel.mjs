// Plays the Aero-Duell headlessly: menu, three difficulties, round/match flow, rematch, return.
// Usage: node scripts/test-duel.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5192 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5192/?pause');
await page.waitForFunction(() => window.__game && window.__ready, null, { timeout: 600_000 });

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

// Menu opens and closes.
await page.evaluate(() => {
  window.__game.openDuelMenu();
});
check(await page.isVisible('[data-level="normal"]'), 'duel menu opens');
await page.click('.close');
check((await page.evaluate(() => window.__game.mode)) === 'play', 'closing the menu returns to play');

// Runs a whole match: the player either fights (walks in and swings) or stands still.
const playMatch = (fight) =>
  page.evaluate((fight) => {
    const d = window.__game.duel;
    const p = d.fighters[0];
    const dirs = ['links', 'rechts', 'oben'];
    const rounds = [];
    let steps = 0;
    let lastRound = d.round;
    while (d.phase !== 'done' && steps < 60 * 600) {
      const joy = window.__game.controls.joystick;
      joy.set(0, 0);
      if (fight && d.phase === 'fight') {
        // Steer with the joystick like a real player: towards the bot, relative to the camera.
        const dir = d.fighters[1].pos.clone().sub(p.pos).setY(0);
        const dist = dir.length();
        dir.normalize();
        const fwd = new d.camera.position.constructor();
        d.camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const right = fwd.clone().set(-fwd.z, 0, fwd.x);
        if (dist > 1.9) joy.set(dir.dot(right), -dir.dot(fwd));
        if (steps % 22 === 0) d.queuedAttack = dirs[(steps / 22) % 3];
      }
      d.update(1 / 60);
      if (d.round !== lastRound) {
        rounds.push(d.score.slice());
        lastRound = d.round;
      }
      steps++;
      // Fighters must stay on the platform unless they are falling.
      for (const f of d.fighters) {
        const r = Math.hypot(f.pos.x - d.arena.center.x, f.pos.z - d.arena.center.z);
        if (f.state !== 'fall' && r > d.arena.radius + 0.01) return { error: `fighter outside platform (r=${r.toFixed(2)})` };
        if (!Number.isFinite(f.pos.x + f.pos.y + f.pos.z)) return { error: 'NaN position' };
      }
    }
    joyReset: window.__game.controls.joystick.set(0, 0);
    return {
      hits: d.stats,
      phase: d.phase,
      score: d.score.slice(),
      rounds: d.round,
      seconds: Math.round(steps / 60),
      result: !!document.querySelector('.again'),
    };
  }, fight);

for (const level of ['leicht', 'normal', 'profi']) {
  await page.evaluate((level) => window.__game.startDuel(level), level);
  await page.waitForFunction(() => window.__game.mode === 'duel', null, { timeout: 30_000 });
  const m = await playMatch(true);
  console.log(`  ${level}: ${JSON.stringify(m)}`);
  check(!m.error, `${level}: fighters stay valid`);
  check(m.phase === 'done' && m.rounds === 3 && m.score[0] + m.score[1] === 3, `${level}: exactly 3 rounds are played`);
  check(m.result, `${level}: result screen appears`);
  await page.click('.back');
  await page.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 30_000 });
  const back = await page.evaluate(() => {
    const g = window.__game;
    return { visible: g.player.visible, d: g.player.position.distanceTo(g.duel.arena.terminal), fighters: g.duel.fighters.every((f) => !f.buddy.parent) };
  });
  check(back.visible && back.d < 3.5 && back.fighters, `${level}: back in the lobby next to the terminal, duel cleaned up`);
}

// A passive player loses against the pro bot.
await page.evaluate(() => window.__game.startDuel('profi'));
await page.waitForFunction(() => window.__game.mode === 'duel', null, { timeout: 30_000 });
const passive = await playMatch(false);
console.log(`  passive vs profi: ${JSON.stringify(passive)}`);
check(passive.score[1] >= 2, 'the pro bot beats a player who does nothing');

// Rematch keeps the difficulty and resets the score.
await page.click('.again');
const again = await page.evaluate(() => ({ mode: window.__game.mode, score: window.__game.duel.score, level: window.__game.duel.difficulty, round: window.__game.duel.round }));
check(again.mode === 'duel' && again.score[0] + again.score[1] === 0 && again.round === 1 && again.level === 'profi', 'rematch restarts the match');
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 30_000 });
check(true, 'Escape gives up and returns to the lobby');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
await server.close();
console.log(failures.length ? `FAIL (${failures.length})` : 'PASS');
process.exit(failures.length ? 1 : 0);
