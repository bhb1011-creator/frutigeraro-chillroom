import { el } from './ui.js';
import { audio } from '../audio/engine.js';
import { BUDDY_COLORS } from '../world/character.js';
import { newRoomId, cleanRoomId, roomLink, sanitizeName } from '../net/net.js';
import { DIFFICULTY } from './duel.js';

const COLOR_LABELS = { blau: 'Blau', rot: 'Rot', gold: 'Gold', tuerkis: 'Türkis', gruen: 'Grün', pink: 'Pink', glas: 'Glas' };
const hex = (key) => `#${BUDDY_COLORS[key].toString(16).padStart(6, '0')}`;

/**
 * Start screen over the camera flight. Resolves with { name, room } when the player starts;
 * room is null for playing alone. `room` (from a ?raum= link) pre-selects playing with friends.
 */
export function startMenu({ color, onColor, name, room = null }) {
  return new Promise((resolve) => {
    const root = el(`
      <div class="aero aero-start">
        <div class="aero-glass aero-panel">
          <h1 class="title">Frutiger Aero<span>Chillroom</span></h1>
          <p>Eine Traumwiese voller Glas, Wind und Wolken.</p>
          <div class="field"><input class="aero-input name" maxlength="16" placeholder="Dein Name" aria-label="Dein Name"></div>
          <div class="aero-row colors" style="gap:8px"></div>
          <div class="friends" hidden>
            <p style="font-weight:600">Mit Freunden spielen</p>
            <p class="room-text" style="font-size:13px"></p>
            <div class="field">
              <input class="aero-input link" readonly aria-label="Raum-Link">
              <button class="aero-btn small copy">Kopieren</button>
            </div>
            <div class="field">
              <input class="aero-input code" maxlength="32" placeholder="oder Raum-Code eingeben" aria-label="Raum-Code">
              <button class="aero-btn small join">Wechseln</button>
            </div>
          </div>
          <div class="aero-row">
            <button class="aero-btn green big play">Spielen</button>
            <button class="aero-btn together">Mit Freunden</button>
            <button class="aero-btn music">♪ an</button>
          </div>
          <p class="hint">Tipp: Im Turm mit dem Schwert-Symbol wartet das Aero-Duell.</p>
        </div>
      </div>`);
    document.body.appendChild(root);

    const nameInput = root.querySelector('.name');
    nameInput.value = name;
    const colors = root.querySelector('.colors');
    for (const key of Object.keys(BUDDY_COLORS)) {
      const b = el(`<button class="aero-btn" title="${COLOR_LABELS[key]}" aria-label="${COLOR_LABELS[key]}" style="width:34px;height:34px;padding:0;background:radial-gradient(circle at 35% 30%, #fff, ${hex(key)} 55%)"></button>`);
      if (key === color) b.style.outline = '3px solid #fff';
      b.addEventListener('click', () => {
        audio.unlock();
        audio.click();
        colors.querySelectorAll('button').forEach((x) => (x.style.outline = ''));
        b.style.outline = '3px solid #fff';
        onColor(key);
      });
      colors.appendChild(b);
    }

    // Playing together: a room link to share (or a code someone else shared).
    const friends = root.querySelector('.friends');
    const togetherBtn = root.querySelector('.together');
    const playBtn = root.querySelector('.play');
    let roomId = null;
    const setRoom = (id) => {
      roomId = id;
      friends.hidden = !id;
      togetherBtn.textContent = id ? 'Allein' : 'Mit Freunden';
      playBtn.textContent = id ? 'Raum betreten' : 'Spielen';
      if (id) {
        root.querySelector('.link').value = roomLink(id);
        root.querySelector('.room-text').textContent = `Raum „${id}“ – schick den Link an deine Freunde. Wer ihn öffnet, landet auf derselben Wiese.`;
      }
    };
    setRoom(room);
    togetherBtn.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      setRoom(roomId ? null : newRoomId());
    });
    const copyBtn = root.querySelector('.copy');
    copyBtn.addEventListener('click', async () => {
      audio.click();
      copyBtn.textContent = (await copyText(root.querySelector('.link').value)) ? 'Kopiert!' : 'Markiert';
      root.querySelector('.link').select();
      setTimeout(() => (copyBtn.textContent = 'Kopieren'), 1600);
    });
    const codeInput = root.querySelector('.code');
    const join = () => {
      const id = cleanRoomId(codeInput.value.includes('raum=') ? new URL(codeInput.value, location.href).searchParams.get('raum') : codeInput.value);
      if (!id) return;
      audio.click();
      codeInput.value = '';
      setRoom(id);
    };
    root.querySelector('.join').addEventListener('click', join);
    codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());

    let musicOn = true;
    const musicBtn = root.querySelector('.music');
    musicBtn.addEventListener('click', () => {
      audio.unlock();
      musicOn = !musicOn;
      audio.setMuted(!musicOn);
      musicBtn.textContent = `♪ ${musicOn ? 'an' : 'aus'}`;
    });
    // Keys typed into the fields must not walk the buddy around behind the menu.
    root.addEventListener('keydown', (e) => e.stopPropagation());
    playBtn.addEventListener('click', () => {
      audio.unlock();
      audio.setMuted(!musicOn);
      audio.select();
      root.style.transition = 'opacity 0.5s';
      root.style.opacity = 0;
      setTimeout(() => root.remove(), 500);
      resolve({ name: sanitizeName(nameInput.value) || name, room: roomId });
    });
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Small glass badge in the corner while playing in a room: code, player count, link copy. */
export function roomBadge(roomId) {
  const root = el(`
    <div class="aero aero-glass aero-room">
      <span>Raum <b></b> · <span class="count">1</span> 👤</span>
      <button class="aero-btn small copy">Link</button>
    </div>`);
  root.querySelector('b').textContent = roomId;
  document.body.appendChild(root);
  const copy = root.querySelector('.copy');
  copy.addEventListener('click', async () => {
    audio.click();
    copy.textContent = (await copyText(roomLink(roomId))) ? 'Kopiert!' : roomLink(roomId);
    setTimeout(() => (copy.textContent = 'Link'), 1800);
  });
  return {
    set count(n) {
      root.querySelector('.count').textContent = n;
    },
    set visible(v) {
      root.style.display = v ? '' : 'none';
    },
  };
}

let toastBox = null;
/**
 * A glass notification in the corner. `actions` are [{ label, kind, onClick }]; without actions it
 * fades after `seconds`. Returns { close }.
 */
export function toast(text, { actions = [], seconds = 4 } = {}) {
  if (!toastBox || !toastBox.isConnected) {
    toastBox = el('<div class="aero aero-toasts"></div>');
    document.body.appendChild(toastBox);
  }
  const t = el(`<div class="aero-glass aero-toast"><div class="text"></div></div>`);
  t.querySelector('.text').textContent = text;
  const close = () => t.remove();
  if (actions.length) {
    const row = el('<div class="aero-row"></div>');
    for (const a of actions) {
      const b = el(`<button class="aero-btn small ${a.kind ?? ''}"></button>`);
      b.textContent = a.label;
      b.addEventListener('click', () => {
        audio.click();
        close();
        a.onClick?.();
      });
      row.appendChild(b);
    }
    t.appendChild(row);
  }
  toastBox.appendChild(t);
  if (seconds) setTimeout(close, seconds * 1000);
  return { close, el: t };
}

/** "Press E" prompt shown next to the duel terminal. */
export function terminalPrompt(onOpen) {
  const root = el(`
    <div class="aero" style="position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:12;display:none">
      <button class="aero-btn big">⚔ Aero-Duell <small>Taste E oder antippen</small></button>
    </div>`);
  document.body.appendChild(root);
  root.querySelector('button').addEventListener('click', () => onOpen());
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && root.style.display !== 'none') onOpen();
  });
  return {
    set visible(v) {
      root.style.display = v ? 'block' : 'none';
    },
    get visible() {
      return root.style.display !== 'none';
    },
  };
}

/**
 * The duel menu at the terminal. Resolves with { level } for a bot match, { friend: peerId } to
 * challenge someone in the room, or null when closed. `friends()` lists who is in the room now.
 */
export function duelMenu({ room = null, friends = () => [] } = {}) {
  return new Promise((resolve) => {
    const levels = Object.entries(DIFFICULTY)
      .map(
        ([key, d], i) =>
          `<button class="aero-btn ${['green', '', 'pink'][i]}" data-level="${key}">${d.label}<small>${
            { leicht: 'Gemütlicher Gegner', normal: 'Blockt und kontert', profi: 'Schnell, schlau, gefährlich' }[key]
          }</small></button>`,
      )
      .join('');
    const root = el(`
      <div class="aero aero-overlay">
        <div class="aero-glass aero-panel">
          <h1>⚔ Aero-Duell</h1>
          <p>Kämpfe mit dem Schaumstoff-Schwert auf der Plattform über dem Dach.</p>
          <p>Immer 3 Runden – wer ins Becken fällt, verliert die Runde.</p>
          <h2>Gegen Computer</h2>
          <div class="aero-row">${levels}</div>
          <h2>Gegen Freund</h2>
          <div class="aero-row friends"></div>
          <div class="aero-row"><button class="aero-btn close">Schließen</button></div>
        </div>
      </div>`);
    document.body.appendChild(root);
    const list = root.querySelector('.friends');
    let shown = '';
    const render = () => {
      const now = friends();
      const key = room + JSON.stringify(now);
      if (key === shown) return;
      shown = key;
      list.textContent = '';
      if (!room) {
        list.appendChild(el('<p>Starte im Startmenü mit „Mit Freunden“ und teile den Raum-Link – dann kannst du hier herausfordern.</p>'));
        return;
      }
      if (!now.length) {
        list.appendChild(el('<p>Noch niemand in deinem Raum. Teile den Link (oben rechts), dann taucht dein Freund hier auf.</p>'));
        return;
      }
      for (const f of now) {
        const b = el('<button class="aero-btn pink" data-friend=""><span></span><small>herausfordern</small></button>');
        b.dataset.friend = f.id;
        b.querySelector('span').textContent = f.name;
        b.addEventListener('click', () => {
          audio.select();
          done({ friend: f.id });
        });
        list.appendChild(b);
      }
    };
    render();
    const timer = setInterval(render, 700);
    const done = (value) => {
      clearInterval(timer);
      removeEventListener('keydown', esc);
      root.remove();
      resolve(value);
    };
    root.querySelectorAll('[data-level]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.select();
        done({ level: b.dataset.level });
      }),
    );
    root.querySelector('.close').addEventListener('click', () => {
      audio.click();
      done(null);
    });
    const esc = (e) => {
      if (e.code === 'Escape') done(null);
    };
    addEventListener('keydown', esc);
  });
}

/** "Waiting for your friend" overlay after a challenge. Returns { close }; onCancel on Abbrechen. */
export function waitingPanel(name, onCancel) {
  const root = el(`
    <div class="aero aero-overlay">
      <div class="aero-glass aero-panel">
        <h1>⚔ Herausforderung</h1>
        <p class="text"></p>
        <div class="aero-row"><button class="aero-btn cancel">Abbrechen</button></div>
      </div>
    </div>`);
  root.querySelector('.text').textContent = `Warte darauf, dass ${name} annimmt …`;
  document.body.appendChild(root);
  root.querySelector('.cancel').addEventListener('click', () => {
    audio.click();
    root.remove();
    onCancel();
  });
  return { close: () => root.remove() };
}

/** White flash used for teleports between the lobby and the rooftop. */
export function flash() {
  const f = el(`<div style="position:fixed;inset:0;background:#fff;z-index:30;opacity:0;transition:opacity 0.35s;pointer-events:none"></div>`);
  document.body.appendChild(f);
  requestAnimationFrame(() => (f.style.opacity = 1));
  return new Promise((resolve) =>
    setTimeout(() => {
      resolve();
      f.style.opacity = 0;
      setTimeout(() => f.remove(), 400);
    }, 380),
  );
}
