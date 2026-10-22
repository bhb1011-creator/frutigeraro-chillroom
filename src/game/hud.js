import { BUDDY_COLORS } from '../world/character.js';

// Glossy Aero-style overlay: title and help panel, colour picker for the buddy,
// and an on-screen joystick + jump button on touch devices.

const LABELS = { blau: 'Blau', rot: 'Rot', gold: 'Gold', tuerkis: 'Türkis', gruen: 'Grün', pink: 'Pink', glas: 'Glas' };

const CSS = `
.hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Segoe UI', 'Frutiger', 'Helvetica Neue', Arial, sans-serif; color: #0b3f66; }
.hud .glass {
  pointer-events: auto;
  background: linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0.1) 48%, rgba(120,210,255,0.1) 52%, rgba(160,235,255,0.2) 100%);
  border: 1px solid rgba(255,255,255,0.7);
  box-shadow: 0 6px 20px rgba(0,80,140,0.18), inset 0 1px 0 rgba(255,255,255,0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 14px;
  text-shadow: 0 1px 0 rgba(255,255,255,0.85);
}
.hud .panel { position: absolute; top: 16px; left: 16px; padding: 10px 16px 12px; max-width: calc(100vw - 64px); transition: opacity 0.6s; }
.hud .panel h1 { margin: 0 0 4px; font-size: 18px; font-weight: 600; letter-spacing: 0.3px; }
.hud .panel p { margin: 2px 0; font-size: 13px; opacity: 0.95; }
.hud .panel.faded { opacity: 0.3; }
.hud.hidden { display: none; }
.hud .colors { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; padding: 8px 12px; }
.hud .colors button {
  width: 30px; height: 30px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.85); cursor: pointer; padding: 0;
  box-shadow: inset 0 -6px 10px rgba(0,0,0,0.25), inset 0 6px 8px rgba(255,255,255,0.7), 0 2px 6px rgba(0,60,110,0.3);
}
.hud .colors button.active { outline: 3px solid rgba(255,255,255,0.95); outline-offset: 2px; }
.hud .joystick { position: absolute; left: 28px; bottom: 80px; width: 120px; height: 120px; border-radius: 50%; touch-action: none; display: none; }
.hud .joystick > div { position: absolute; left: 35px; top: 35px; width: 50px; height: 50px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, #8fe3ff 45%, #1a9fe0); box-shadow: 0 3px 8px rgba(0,60,110,0.4); }
.hud .jump { position: absolute; right: 28px; bottom: 96px; width: 78px; height: 78px; border-radius: 50%; display: none; touch-action: none;
  font-size: 14px; font-weight: 600; color: #0b3f66; }
@media (pointer: coarse) {
  .hud .joystick, .hud .jump { display: block; }
  .hud .panel .keys { display: none; }
}
@media (pointer: fine) { .hud .panel .touch { display: none; } }
`;

export function createHud({ color, onColor }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="glass panel">
      <h1>Frutiger Aero Chillroom</h1>
      <p class="keys">WASD / Pfeiltasten: laufen · Shift: rennen · Leertaste: springen</p>
      <p class="keys">Maus ziehen: Kamera drehen · Mausrad: zoomen</p>
      <p class="touch">Joystick: laufen · Wischen: Kamera · Knopf: springen</p>
    </div>
    <div class="glass colors"></div>
    <div class="glass joystick"><div></div></div>
    <button class="glass jump">Sprung</button>`;
  document.body.appendChild(root);

  const colors = root.querySelector('.colors');
  for (const [key, hex] of Object.entries(BUDDY_COLORS)) {
    const b = document.createElement('button');
    b.title = LABELS[key] ?? key;
    b.style.background = `#${hex.toString(16).padStart(6, '0')}`;
    if (key === 'glas') b.style.background = 'linear-gradient(135deg, rgba(220,250,255,0.9), rgba(120,220,255,0.5))';
    b.classList.toggle('active', key === color);
    b.addEventListener('click', () => {
      colors.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      onColor(key);
    });
    colors.appendChild(b);
  }

  // The help panel fades back once the player starts moving around.
  const panel = root.querySelector('.panel');
  setTimeout(() => panel.classList.add('faded'), 9000);

  return {
    joystick: root.querySelector('.joystick'),
    jump: root.querySelector('.jump'),
    set visible(v) {
      root.classList.toggle('hidden', !v);
    },
  };
}
