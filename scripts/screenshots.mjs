// Renders each camera preset in headless Chromium and saves it to screenshots/.
// Usage: npm run screenshots  (starts its own Vite server)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';

const SHOTS = (process.argv[2] ?? 'ueberblick,spielansicht,figur,figuren,boden,see,stadt,platz,lobby,stock1').split(',');
const OUT = new URL('../screenshots/', import.meta.url);

await mkdir(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));

for (const shot of SHOTS) {
  const start = Date.now();
  await page.goto(`http://localhost:5199/?shot=${shot}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600_000 });
  await page.screenshot({ path: new URL(`${shot}.png`, OUT).pathname, timeout: 600_000 });
  console.log(`${shot}.png (${((Date.now() - start) / 1000).toFixed(1)}s)`);
}

await browser.close();
await server.close();
