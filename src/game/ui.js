// Shared Aero glass styling for every overlay: start menu, duel menu, duel HUD and results.

const CSS = `
.aero, .aero * { box-sizing: border-box; }
.aero { font-family: 'Segoe UI', 'Frutiger', 'Helvetica Neue', Arial, sans-serif; color: #0b3f66; }
.aero-glass {
  background: linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 48%, rgba(120,210,255,0.12) 52%, rgba(170,240,255,0.24) 100%);
  border: 1px solid rgba(255,255,255,0.75);
  box-shadow: 0 8px 28px rgba(0,80,140,0.2), inset 0 1px 0 rgba(255,255,255,0.85);
  backdrop-filter: blur(10px) saturate(1.2);
  -webkit-backdrop-filter: blur(10px) saturate(1.2);
  border-radius: 18px;
  text-shadow: 0 1px 0 rgba(255,255,255,0.8);
}
.aero-overlay {
  position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 40%, rgba(200,240,255,0.12), rgba(40,120,200,0.18));
  padding: 16px;
}
.aero-panel { padding: 22px 26px; max-width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; text-align: center; }
.aero-panel h1 { margin: 0 0 6px; font-size: 28px; font-weight: 600; letter-spacing: 0.3px; }
.aero-panel h2 { margin: 14px 0 8px; font-size: 17px; font-weight: 600; }
.aero-panel p { margin: 4px 0; font-size: 14px; }
.aero-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 12px; }
.aero-btn {
  pointer-events: auto; cursor: pointer; border-radius: 999px; padding: 10px 22px; font: inherit; font-size: 16px; font-weight: 600;
  color: #0b3f66; border: 1px solid rgba(255,255,255,0.9);
  background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(210,245,255,0.75) 48%, rgba(120,215,255,0.7) 52%, rgba(170,240,255,0.85) 100%);
  box-shadow: 0 3px 10px rgba(0,90,160,0.25), inset 0 1px 0 #fff;
  text-shadow: 0 1px 0 rgba(255,255,255,0.9);
  transition: transform 0.12s, box-shadow 0.12s;
}
.aero-btn:hover { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(0,140,220,0.4), inset 0 1px 0 #fff; }
.aero-btn:active { transform: translateY(1px); }
.aero-btn.green { background: linear-gradient(180deg, #f4ffe8 0%, #c8f7a0 48%, #7fdc4a 52%, #b6f07a 100%); }
.aero-btn.pink { background: linear-gradient(180deg, #fff0f8 0%, #ffc8e6 48%, #ff8cc8 52%, #ffb6dc 100%); }
.aero-btn.big { font-size: 20px; padding: 13px 34px; }
.aero-btn[disabled] { opacity: 0.45; cursor: default; transform: none; }
.aero-btn small { display: block; font-size: 11px; font-weight: 400; opacity: 0.85; }
.aero-input {
  pointer-events: auto; font: inherit; font-size: 15px; color: #0b3f66; padding: 8px 14px; border-radius: 999px; min-width: 0;
  border: 1px solid rgba(255,255,255,0.9); background: rgba(255,255,255,0.55); box-shadow: inset 0 2px 5px rgba(0,70,130,0.18); outline: none;
}
.aero-input:focus { background: rgba(255,255,255,0.8); box-shadow: inset 0 2px 5px rgba(0,70,130,0.18), 0 0 0 3px rgba(120,215,255,0.55); }
.aero-btn.small { font-size: 13px; padding: 6px 14px; }
.aero-start { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; padding: 16px 4vw; pointer-events: none;
  background: linear-gradient(90deg, rgba(40,120,200,0.22), rgba(40,120,200,0) 55%); }
.aero-start .aero-panel { pointer-events: auto; width: min(420px, 100%); text-align: left; }
.aero-start .aero-row { justify-content: flex-start; }
.aero-start .title { font-size: 34px; line-height: 1.05; margin-bottom: 8px; }
.aero-start .title span { display: block; font-size: 15px; font-weight: 400; opacity: 0.85; letter-spacing: 3px; text-transform: uppercase; }
.aero-start .field { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
.aero-start .field .aero-input { flex: 1; }
.aero-start .friends { margin-top: 12px; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.6); }
.aero-start .friends[hidden] { display: none; }
.aero-start .hint { font-size: 12px; opacity: 0.85; margin-top: 10px; }
@media (max-width: 700px) {
  .aero-start { align-items: flex-end; padding: 12px; background: linear-gradient(0deg, rgba(40,120,200,0.25), rgba(40,120,200,0) 60%); }
  .aero-start .title { font-size: 26px; }
}
.aero-toasts { position: fixed; top: 62px; right: 14px; z-index: 25; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; max-width: calc(100vw - 28px); }
.aero-toast { pointer-events: auto; padding: 10px 14px; font-size: 14px; animation: aero-in 0.35s ease-out; }
.aero-toast .aero-row { margin-top: 8px; justify-content: flex-end; }
@keyframes aero-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
.aero-room { position: fixed; top: 14px; right: 14px; z-index: 14; padding: 6px 8px 6px 14px; font-size: 13px; display: flex; gap: 10px; align-items: center; }
.aero-big { font-size: 64px; font-weight: 700; color: #fff; text-shadow: 0 3px 12px rgba(0,80,160,0.55), 0 1px 0 #0b6fb8; }
`;

let injected = false;
export function injectStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Creates an element from an HTML string (first element). */
export function el(html) {
  injectStyles();
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
