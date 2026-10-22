import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
import { SPAWN, CLUSTER } from './world/layout.js';
import { SHOTS } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');

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
sc.left = sc.bottom = -110;
sc.right = sc.top = 110;
sc.near = 1;
sc.far = 600;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc8ecff, 0x6fe04a, 1.0));

function focusShadows(x, z) {
  sun.target.position.set(x, 0, z);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIRECTION, 300);
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
add(createTerrain());
add(createBuildings());
add(createCity());

// Just meadow: dense grass that travels with the camera, everywhere you go.
const grassPromise = createGrass();

// The player: a buddy figure on the meadow, looking towards the towers (?figur=rot|blau|gold|tuerkis|gruen|pink|glas).
const playerColor = params.get('figur') in BUDDY_COLORS ? params.get('figur') : 'gruen';
const character = createBuddy({ color: playerColor });
character.position.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z) + 0.02, SPAWN.z);
character.rotation.y = Math.atan2(CLUSTER.x - SPAWN.x, CLUSTER.z - SPAWN.z);
add(character);

// Grass lives on layer 1: the main camera sees it, the reflection and shadow cameras skip it.
camera.layers.enable(1);
const grass = await grassPromise;
grass.traverse((o) => o.layers.set(1));
add(grass);
await allLoaded();
await texturesReady(scene);

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
const shot = shotName && SHOTS[shotName] ? SHOTS[shotName](character) : null;
if (shot) {
  camera.position.copy(shot.position);
  camera.lookAt(shot.target);
  camera.fov = shot.fov ?? 55;
  camera.updateProjectionMatrix();
  focusShadows(shot.target.x * 0.5 + shot.position.x * 0.5, shot.target.z * 0.5 + shot.position.z * 0.5);
} else {
  camera.position.set(character.position.x + 3, character.position.y + 2.2, character.position.z + 5);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(character.position).add(new THREE.Vector3(0, 1.1, 0));
  controls.enableDamping = true;
  focusShadows(character.position.x, character.position.z - 40);
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
  } else {
    character.userData.update(dt);
  }
  sky.position.copy(camera.position);
  sky.userData.update(t);
  controls?.update();
  composer.render();
  if (++frames === 1) window.__ready = true;
  if (!shot || !window.__ready) requestAnimationFrame(frame);
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
