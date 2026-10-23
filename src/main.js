import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

import { createSky, SUN_DIRECTION } from './world/sky.js';
import { createTerrain, heightAt, CLUSTER_Y } from './world/terrain.js';
import { createGrass } from './world/grass.js';
import { createBuildings } from './world/buildings.js';
import { createBuddy, BUDDY_COLORS } from './world/character.js';
import { createCity } from './world/city/city.js';
import { allLoaded } from './world/assets.js';
import { SPAWN, CLUSTER, TURBINES } from './world/layout.js';
import { CollisionWorld } from './game/collision.js';
import { PlayerController } from './game/controls.js';
import { createHud } from './game/hud.js';
import { DuelGame } from './game/duel.js';
import { startMenu, terminalPrompt, duelMenu, flash, roomBadge, toast, waitingPanel } from './game/menus.js';
import { menuFlight } from './game/flight.js';
import { connect, cleanRoomId, sanitizeName } from './net/net.js';
import { RemotePlayers } from './net/remote.js';
import { audio } from './audio/engine.js';
import { SHOTS } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');

// Progress on the loading screen (index.html); yields so the text gets painted.
async function step(text) {
  window.__setLoading?.(text);
  await new Promise((r) => setTimeout(r, 0));
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!shotName });
renderer.setPixelRatio(shotName ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Soft, bright haze: the far towers fade into it like in a daydream.
scene.fog = new THREE.Fog(0xd4f3ff, 420, 4200);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 7000);

// Sky + environment reflections (this is what makes glass and water shine).
await step('Himmel und Wolken entstehen …');
const sky = createSky();
scene.add(sky);
sky.userData.update(14);
const envScene = new THREE.Scene();
envScene.add(createSky());
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0, 0.1, 3000).texture;
scene.environmentIntensity = 0.9;

// Lights: warm sun, sky/grass bounce.
const sun = new THREE.DirectionalLight(0xfff6e0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.04;
const sc = sun.shadow.camera;
// A wide shadow area so its edge stays out of view.
sc.left = sc.bottom = -220;
sc.right = sc.top = 220;
sc.near = 1;
sc.far = 900;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc8ecff, 0x6fe04a, 1.0));

function focusShadows(x, z, y = 0) {
  sun.target.position.set(x, y, z);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIRECTION, 450);
}

// Lens flare on a far light placed along the sun direction.
function flareTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glow = flareTexture((g) => {
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,250,220,0.8)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
});
const ring = flareTexture((g) => {
  const grad = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  grad.addColorStop(0, 'rgba(120,220,255,0)');
  grad.addColorStop(0.7, 'rgba(160,240,255,0.35)');
  grad.addColorStop(1, 'rgba(160,240,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
});
const flareLight = new THREE.PointLight(0xffffff, 0);
flareLight.position.copy(SUN_DIRECTION).multiplyScalar(3000);
const lensflare = new Lensflare();
lensflare.addElement(new LensflareElement(glow, 420, 0, new THREE.Color(1, 0.97, 0.9)));
lensflare.addElement(new LensflareElement(ring, 90, 0.35, new THREE.Color(0.6, 1, 0.8)));
lensflare.addElement(new LensflareElement(ring, 160, 0.55, new THREE.Color(0.5, 0.85, 1)));
lensflare.addElement(new LensflareElement(glow, 50, 0.7, new THREE.Color(0.6, 1, 0.9)));
lensflare.addElement(new LensflareElement(ring, 240, 0.95, new THREE.Color(0.7, 0.9, 1)));
flareLight.add(lensflare);
scene.add(flareLight);

// ---------- World ----------
const updatables = [];
const add = (obj) => {
  scene.add(obj);
  if (obj.userData.update) updatables.push(obj);
  return obj;
};
await step('Hügel und Wiesen werden geformt …');
add(createTerrain());
add(createBuildings());
await step('Hochhäuser werden gebaut …');
const city = add(createCity());

// Just meadow: dense grass that travels with the camera, everywhere you go.
await step('Gras wächst …');
const grassPromise = createGrass();

// The player: a buddy figure on the meadow, looking towards the towers (?figur=rot|blau|gold|tuerkis|gruen|pink|glas).
const playerColor = params.get('figur') in BUDDY_COLORS ? params.get('figur') : 'gruen';
const character = createBuddy({ color: playerColor });
character.position.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z) + 0.02, SPAWN.z);
character.rotation.y = Math.atan2(CLUSTER.x - SPAWN.x, CLUSTER.z - SPAWN.z);
// Animated by the controller (or posed for screenshots), so not in the updatables list.
scene.add(character);

// Grass lives on layer 1: the main camera sees it, the reflection and shadow cameras skip it.
camera.layers.enable(1);
const grass = await grassPromise;
grass.traverse((o) => o.layers.set(1));
add(grass);
await step('Texturen werden geladen …');
await allLoaded();
await texturesReady(scene);

await step('Spiegelungen werden berechnet …');
// Glass towers reflect the actual meadow and their neighbours, captured once from inside the cluster.
{
  // 8-bit target: a half-float capture can carry NaNs that the bloom pass would smear over the whole frame.
  const target = new THREE.WebGLCubeRenderTarget(512, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
  const cubeCam = new THREE.CubeCamera(1, 5000, target);
  cubeCam.position.set(CLUSTER.x, CLUSTER_Y + 30, CLUSTER.z + 10);
  scene.add(cubeCam);
  character.visible = false;
  cubeCam.update(renderer, scene);
  character.visible = true;
  const cityEnv = pmrem.fromCubemap(target.texture).texture;
  scene.getObjectByName('city').traverse((o) => {
    if (o.isMesh && o.material?.isMeshPhysicalMaterial && (o.material.metalness > 0.1 || o.material.transparent)) {
      o.material.envMap = cityEnv;
    }
  });
}

// Post-processing: soft bloom for that dreamy glow.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.65, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let controls = null;
let player = character;
// menu → play ⇄ duelMenu → duel → play
let mode = 'play';
let tick = () => {};
let netTick = () => {};
const shot = shotName && SHOTS[shotName] ? SHOTS[shotName](character) : null;
if (shot) {
  camera.position.copy(shot.position);
  camera.lookAt(shot.target);
  camera.fov = shot.fov ?? 55;
  camera.updateProjectionMatrix();
  focusShadows(shot.target.x * 0.5 + shot.position.x * 0.5, shot.target.z * 0.5 + shot.position.z * 0.5);
} else {
  // Play mode: physics world from the walkable towers and the turbine masts.
  const world = new CollisionWorld();
  world.add(city.userData.colliders);
  world.add({ circles: TURBINES.map(([x, z]) => ({ x, z, r: 1.0, y0: heightAt(x, z) - 1, y1: heightAt(x, z) + 40 })) });
  controls = new PlayerController({ player: character, camera, dom: renderer.domElement, world });
  let color = playerColor;
  let net = null;
  const setColor = (key) => {
    color = key;
    net?.setHello({ color: key });
    const next = createBuddy({ color: key });
    next.visible = player.visible;
    scene.remove(player);
    controls.setPlayer(next);
    player = next;
    scene.add(next);
  };
  const hud = createHud({ color, onColor: setColor });
  controls.bindTouch(hud);

  // The duel tower: terminal prompt in the lobby, menu, and the rooftop duel.
  const arena = city.userData.arena;
  const duel = new DuelGame({ scene, camera, dom: renderer.domElement, arena, input: controls });
  const prompt = terminalPrompt(() => openDuelMenu());
  async function openDuelMenu() {
    if (mode !== 'play') return;
    mode = 'duelMenu';
    prompt.visible = false;
    controls.keys.clear();
    const choice = await duelMenu({
      room: net?.roomId ?? null,
      friends: () => [...(net?.peers ?? new Map())].map(([id, p]) => ({ id, name: p.name })),
    });
    if (choice?.level) startDuel(choice.level);
    else if (choice?.friend && net?.peers.has(choice.friend)) challenge(choice.friend);
    else mode = 'play';
  }
  async function startDuel(level, online = null) {
    await flash();
    mode = 'duel';
    hud.visible = false;
    player.visible = false;
    duel.start({
      difficulty: level,
      color,
      online,
      onExit: async () => {
        await flash();
        // Back in the lobby, standing in front of the terminal.
        player.position.copy(arena.terminal).addScaledVector(arena.terminalFacing, 2.2).setY(arena.lobbyFloorY);
        player.rotation.y = Math.atan2(-arena.terminalFacing.x, -arena.terminalFacing.z);
        controls.yaw = player.rotation.y + Math.PI;
        controls.velocity.set(0, 0, 0);
        controls.jumpQueued = false;
        controls.firstUpdate = true;
        player.visible = true;
        hud.visible = true;
        mode = 'play';
        audio.play('lobby');
      },
    });
  }

  // ---------- Playing together ----------
  // Challenges: the challenger hosts the duel, the one who accepts joins as guest.
  let pending = null; // our open challenge: { peer, panel, timer }
  const invites = new Map(); // challenges we received: peer -> toast
  const onlineDuel = (role, peer) => {
    const p = net.peers.get(peer);
    return { role, net, peer, foeName: p?.name ?? 'Freund', foeColor: p?.color ?? 'blau' };
  };
  function challenge(peer) {
    const name = net.peers.get(peer)?.name ?? 'Freund';
    mode = 'duelMenu';
    net.send('duel', { t: 'invite' }, peer);
    const finish = () => {
      clearTimeout(pending?.timer);
      pending?.panel.close();
      pending = null;
    };
    pending = {
      peer,
      finish,
      panel: waitingPanel(name, () => {
        net.send('duel', { t: 'cancel' }, peer);
        finish();
        mode = 'play';
      }),
      timer: setTimeout(() => {
        net.send('duel', { t: 'cancel' }, peer);
        finish();
        mode = 'play';
        toast(`${name} hat nicht geantwortet.`);
      }, 30_000),
    };
  }
  function onDuelMessage(m, from) {
    const name = net.peers.get(from)?.name ?? 'Freund';
    if (m.t === 'invite') {
      if (mode !== 'play' || invites.has(from)) {
        net.send('duel', { t: 'busy' }, from);
        return;
      }
      audio.select();
      const t = toast(`${name} fordert dich zum Aero-Duell heraus!`, {
        seconds: 30,
        actions: [
          {
            label: 'Annehmen',
            kind: 'green',
            onClick: () => {
              invites.delete(from);
              if (mode !== 'play' || !net.peers.has(from)) {
                net.send('duel', { t: 'decline' }, from);
                return;
              }
              net.send('duel', { t: 'accept' }, from);
              startDuel('normal', onlineDuel('guest', from));
            },
          },
          {
            label: 'Ablehnen',
            onClick: () => {
              invites.delete(from);
              net.send('duel', { t: 'decline' }, from);
            },
          },
        ],
      });
      invites.set(from, t);
      setTimeout(() => invites.get(from) === t && invites.delete(from), 30_000);
    } else if (m.t === 'cancel') {
      invites.get(from)?.close();
      invites.delete(from);
    } else if (pending?.peer === from) {
      pending.finish();
      if (m.t === 'accept') startDuel('normal', onlineDuel('host', from));
      else {
        mode = 'play';
        toast(m.t === 'busy' ? `${name} ist gerade beschäftigt.` : `${name} hat abgelehnt.`);
      }
    } else if (m.t === 'accept') {
      // Too late: we already gave up waiting. Tell them so their duel ends right away.
      net.send('duel', { t: 'leave' }, from);
    }
  }

  const remotes = new RemotePlayers(scene);
  let badge = null;
  async function joinRoom(roomId, name) {
    try {
      net = await connect(roomId, { local: params.get('netz') === 'lokal', hello: { name, color } });
    } catch (e) {
      console.error(e);
      toast('Verbindung zum Raum fehlgeschlagen – du spielst allein.', { seconds: 6 });
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('raum', roomId);
    history.replaceState(null, '', url);
    badge = roomBadge(roomId);
    const recount = () => (badge.count = net.peers.size + 1);
    net.on('join', (id) => {
      remotes.upsert(id, net.peers.get(id));
      recount();
      toast(`${net.peers.get(id).name} ist da! 👋`);
      audio.click();
    });
    net.on('hello', (id) => remotes.upsert(id, net.peers.get(id)));
    net.on('leave', (id) => {
      const p = remotes.players.get(id);
      remotes.remove(id);
      recount();
      invites.get(id)?.close();
      invites.delete(id);
      if (pending?.peer === id) {
        pending.finish();
        mode = 'play';
      }
      if (p) toast(`${p.name} ist gegangen.`);
    });
    net.on('pos', (s, id) => remotes.receive(id, s, performance.now() / 1000));
    net.on('duel', (m, id) => m && typeof m.t === 'string' && onDuelMessage(m, id));
    window.__game.net = net;
  }
  let sendTimer = 0;
  function sendPresence(dt) {
    sendTimer -= dt;
    if (!net || sendTimer > 0 || !net.peers.size) return;
    sendTimer = 0.1;
    const r = (v) => Math.round(v * 100) / 100;
    net.send('pos', {
      x: r(player.position.x),
      y: r(player.position.y),
      z: r(player.position.z),
      r: r(player.rotation.y),
      a: player.userData.state,
      m: mode === 'duel' ? 'duel' : 'play',
    });
  }
  netTick = (dt) => {
    sendPresence(dt);
    remotes.update(dt, performance.now() / 1000);
    if (badge) badge.visible = mode !== 'duel' && mode !== 'menu';
  };

  // Each frame in play mode: terminal prompt and the music zone (lobby inside the duel tower).
  tick = () => {
    const nearTerminal = player.position.distanceTo(arena.terminal) < 2.8;
    prompt.visible = mode === 'play' && nearTerminal;
    const inDuelTower =
      Math.hypot(player.position.x - arena.tower.x, player.position.z - arena.tower.z) < 11.5 && player.position.y < arena.lobbyFloorY + 9;
    audio.play(inDuelTower ? 'lobby' : 'welt');
  };

  // Handle for automated tests (and the browser console).
  window.__game = { audio, camera, debug: { menuFlight, heightAt, camera }, controls, world, duel, remotes, openDuelMenu, startDuel, joinRoom, netTick: (dt) => netTick(dt), get mode() { return mode; }, get player() { return player; } };

  // Start screen over a camera flight across the meadow (skipped with ?pause for tests).
  const room = cleanRoomId(params.get('raum')) || null;
  const storedName = () => {
    try {
      return sanitizeName(localStorage.getItem('aero-name'));
    } catch {
      return '';
    }
  };
  const name = storedName() || `Buddy ${Math.floor(100 + Math.random() * 900)}`;
  if (!params.has('pause')) {
    mode = 'menu';
    hud.visible = false;
    // Music from the first moment: browsers only let it sound after the first click or key
    // press, so it starts right away where allowed and otherwise with the first touch.
    audio.unlock();
    audio.play('welt');
    const wake = () => {
      audio.unlock();
      removeEventListener('pointerdown', wake, true);
      removeEventListener('keydown', wake, true);
    };
    addEventListener('pointerdown', wake, true);
    addEventListener('keydown', wake, true);
    startMenu({ color, onColor: setColor, name, room }).then((choice) => {
      try {
        localStorage.setItem('aero-name', choice.name);
      } catch {}
      mode = 'play';
      hud.visible = true;
      controls.firstUpdate = true;
      audio.play('welt');
      if (choice.room) joinRoom(choice.room, choice.name);
    });
  } else if (room) {
    joinRoom(room, params.get('name') ? sanitizeName(params.get('name')) : name);
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

if (shot) {
  for (const u of updatables) u.userData.update(14, camera);
  await renderer.compileAsync(scene, camera);
}

const clock = new THREE.Clock();
let frames = 0;
let last = 0;
function frame() {
  // Screenshot mode freezes time so every render is identical.
  const t = shot ? 14 : clock.getElapsedTime();
  const dt = Math.min(0.05, t - last);
  last = t;
  for (const u of updatables) u.userData.update(t, camera);
  if (shot) {
    character.userData.pose(shotName === 'spielansicht' ? 'walk' : 'idle', 0.4);
  } else if (mode === 'menu') {
    // Calm flight over the meadow, showing the towers and the far skyline.
    const focus = menuFlight(camera, t + 18);
    focusShadows(focus.x, focus.z, heightAt(focus.x, focus.z));
  } else if (mode === 'duel') {
    window.__game.duel.update(dt);
    const c = city.userData.arena.center;
    focusShadows(c.x, c.z, c.y);
  } else if (mode === 'play') {
    controls.update(dt);
    focusShadows(player.position.x, player.position.z, player.position.y);
    tick();
  }
  netTick(dt);
  sky.position.copy(camera.position);
  sky.userData.update(t);
  composer.render();
  if (++frames === 1) {
    window.__ready = true;
    document.getElementById('loading')?.remove();
  }
  // ?pause stops after the first frame (used by the physics test).
  if ((!shot && !params.has('pause')) || !window.__ready) requestAnimationFrame(frame);
}
frame();

// Waits until every texture referenced by a material has its image decoded.
async function texturesReady(root) {
  const textures = new Set();
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      for (const u of Object.values(m.uniforms ?? {})) if (u.value?.isTexture) textures.add(u.value);
    }
  });
  const ready = (t) => {
    const img = t.image;
    if (!img) return false;
    if (img instanceof HTMLImageElement) return img.complete && img.naturalWidth > 0;
    return true;
  };
  for (let i = 0; i < 200; i++) {
    if ([...textures].every((t) => ready(t) || t.isRenderTargetTexture || t.isCubeTexture || t.isDataTexture)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}
