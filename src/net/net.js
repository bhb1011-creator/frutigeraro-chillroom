// Multiplayer without a game server: everyone in the same room link connects peer-to-peer over
// WebRTC (Trystero finds the others through public Nostr relays). `?netz=lokal` swaps in a
// BroadcastChannel transport so several tabs of one browser can play together offline (tests).

const APP_ID = 'frutiger-aero-chillroom-v1';

// Message types; Trystero action names must stay within 12 bytes.
const TYPES = ['hello', 'pos', 'duel', 'dstate', 'dinput'];

const WORDS = ['aqua', 'wolke', 'blase', 'wiese', 'glas', 'tau', 'brise', 'perle', 'lagune', 'himmel'];

export function newRoomId() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${word}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Room ids are short and URL-safe; anything else from the link is cleaned up. */
export function cleanRoomId(id) {
  return String(id ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 32);
}

export function roomLink(roomId) {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('raum', roomId);
  const netz = new URLSearchParams(location.search).get('netz');
  if (netz) url.searchParams.set('netz', netz);
  return url.toString();
}

function localTransport(roomId) {
  const selfId = Math.random().toString(36).slice(2, 10);
  const channel = new BroadcastChannel(`aero-${roomId}`);
  const handlers = { join: () => {}, leave: () => {}, msg: {} };
  const known = new Set();
  const post = (m) => channel.postMessage({ ...m, from: selfId });
  channel.onmessage = ({ data: m }) => {
    if (m.to && m.to !== selfId) return;
    if (m.kind === 'join' || m.kind === 'ack') {
      if (m.kind === 'join') post({ kind: 'ack', to: m.from });
      if (!known.has(m.from)) {
        known.add(m.from);
        handlers.join(m.from);
      }
    } else if (m.kind === 'bye') {
      if (known.delete(m.from)) handlers.leave(m.from);
    } else if (m.kind === 'msg' && known.has(m.from)) {
      handlers.msg[m.type]?.(m.data, m.from);
    }
  };
  setTimeout(() => post({ kind: 'join' }), 0);
  addEventListener('pagehide', () => post({ kind: 'bye' }));
  return {
    selfId,
    onPeerJoin: (fn) => (handlers.join = fn),
    onPeerLeave: (fn) => (handlers.leave = fn),
    makeAction(type) {
      const send = (data, to) => {
        if (Array.isArray(to)) to.forEach((t) => post({ kind: 'msg', type, data, to: t }));
        else post({ kind: 'msg', type, data, to: to ?? null });
      };
      return [send, (fn) => (handlers.msg[type] = fn)];
    },
    leave() {
      post({ kind: 'bye' });
      channel.close();
    },
  };
}

async function p2pTransport(roomId) {
  const { joinRoom, selfId } = await import('@trystero-p2p/nostr');
  const room = joinRoom({ appId: APP_ID }, roomId);
  return {
    selfId,
    onPeerJoin: (fn) => (room.onPeerJoin = fn),
    onPeerLeave: (fn) => (room.onPeerLeave = fn),
    makeAction(type) {
      const action = room.makeAction(type);
      // A peer that just dropped makes sending fail; the leave event cleans up after it.
      const send = (data, to) => action.send(data, to ? { target: to } : undefined).catch(() => {});
      return [send, (fn) => (action.onMessage = (data, ctx) => fn(data, ctx.peerId))];
    },
    leave: () => room.leave().catch(() => {}),
  };
}

/**
 * Joins a room. Returns { selfId, roomId, peers, send(type, data, to?), on(type, fn), leave() }.
 * Events: 'join' (peerId), 'leave' (peerId), and every message type (data, peerId).
 * `peers` maps peer ids to the last 'hello' they sent ({ name, color }).
 */
export async function connect(roomId, { local = false, hello = {} } = {}) {
  const transport = local ? localTransport(roomId) : await p2pTransport(roomId);
  const listeners = {};
  const emit = (type, ...args) => (listeners[type] ?? []).forEach((fn) => fn(...args));
  const senders = {};
  const peers = new Map();
  for (const type of TYPES) {
    const [send, receive] = transport.makeAction(type);
    senders[type] = send;
    receive((data, from) => {
      if (type === 'hello') {
        const known = peers.has(from);
        peers.set(from, { ...peers.get(from), ...sanitizeHello(data) });
        if (!known) emit('join', from);
        else emit('hello', from);
        return;
      }
      if (!peers.has(from)) return;
      emit(type, data, from);
    });
  }
  let me = sanitizeHello(hello);
  transport.onPeerJoin((id) => senders.hello(me, id));
  transport.onPeerLeave((id) => {
    if (peers.delete(id)) emit('leave', id);
  });
  return {
    selfId: transport.selfId,
    roomId,
    peers,
    /** Updates name/colour and tells everyone. */
    setHello(next) {
      me = sanitizeHello({ ...me, ...next });
      if (peers.size) senders.hello(me);
    },
    send(type, data, to) {
      senders[type](data, to);
    },
    on(type, fn) {
      (listeners[type] ??= []).push(fn);
      return () => (listeners[type] = listeners[type].filter((f) => f !== fn));
    },
    leave() {
      transport.leave();
      for (const id of [...peers.keys()]) {
        peers.delete(id);
        emit('leave', id);
      }
    },
  };
}

// Whatever arrives from other players is untrusted: keep only short, plain values.
export function sanitizeName(name) {
  return String(name ?? '')
    .replace(/[<>&"'`\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 16);
}

function sanitizeHello(h) {
  return { name: sanitizeName(h?.name) || 'Buddy', color: typeof h?.color === 'string' ? h.color.slice(0, 12) : 'blau' };
}
