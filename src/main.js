import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

import { createSky, createClouds, SUN_DIRECTION } from './world/sky.js';
import { createTerrain, createPath, heightAt, pathCurve } from './world/terrain.js';
import { createGrass } from './world/grass.js';
import { createWater, createFish, createBubbles } from './world/water.js';
import { createBuildings } from './world/buildings.js';
import { createTrees, createFlowers } from './world/nature.js';
import { createCharacter } from './world/character.js';
import { SHOTS } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(shotName ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcdeeff, 260, 900);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2500);

// Sky + environment reflections (this is what makes glass and water shine).
const sky = createSky();
scene.add(sky);
const envScene = new THREE.Scene();
envScene.add(createSky());
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0, 0.1, 3000).texture;
scene.environmentIntensity = 0.9;

// Lights: warm sun, sky/grass bounce.
const sun = new THREE.DirectionalLight(0xfff6e0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
const sc = sun.shadow.camera;
sc.left = sc.bottom = -90;
sc.right = sc.top = 90;
sc.near = 1;
sc.far = 500;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x5fbf4a, 0.9));

function focusShadows(x, z) {
  sun.target.position.set(x, 0, z);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIRECTION, 250);
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
flareLight.position.copy(SUN_DIRECTION).multiplyScalar(900);
const lensflare = new Lensflare();
lensflare.addElement(new LensflareElement(glow, 420, 0, new THREE.Color(1, 0.97, 0.9)));
lensflare.addElement(new LensflareElement(ring, 90, 0.35, new THREE.Color(0.6, 1, 0.8)));
lensflare.addElement(new LensflareElement(ring, 160, 0.55, new THREE.Color(0.5, 0.85, 1)));
lensflare.addElement(new LensflareElement(glow, 50, 0.7, new THREE.Color(0.6, 1, 0.9)));
lensflare.addElement(new LensflareElement(ring, 240, 0.95, new THREE.Color(0.7, 0.9, 1)));
flareLight.add(lensflare);
scene.add(flareLight);

// World.
const updatables = [];
const add = (obj) => {
  scene.add(obj);
  if (obj.userData.update) updatables.push(obj);
  return obj;
};
add(createTerrain());
add(createPath());
add(createWater());
add(createFish());
add(createBubbles());
add(createGrass());
add(createFlowers());
add(createTrees());
add(createBuildings());
add(createClouds());

const character = add(createCharacter());
const spawnT = 0.05;
const spawn = pathCurve.getPointAt(spawnT);
const ahead = pathCurve.getPointAt(spawnT + 0.02);
character.position.set(spawn.x, heightAt(spawn.x, spawn.z) + 0.08, spawn.z);
character.rotation.y = Math.atan2(ahead.x - spawn.x, ahead.z - spawn.z);

// Post-processing: soft bloom for that dreamy glow.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let controls = null;
if (shotName && SHOTS[shotName]) {
  const shot = SHOTS[shotName](character);
  camera.position.copy(shot.position);
  camera.lookAt(shot.target);
  camera.fov = shot.fov ?? 55;
  camera.updateProjectionMatrix();
  focusShadows(shot.target.x, shot.target.z);
} else {
  camera.position.set(character.position.x + 4, character.position.y + 3, character.position.z + 7);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(character.position).add(new THREE.Vector3(0, 1.2, 0));
  controls.enableDamping = true;
  focusShadows(character.position.x, character.position.z - 40);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
let frames = 0;
function frame() {
  // Screenshot mode freezes time so every render is identical.
  const t = shotName ? 14 : clock.getElapsedTime();
  for (const u of updatables) u.userData.update(t);
  character.userData.animate(t, shotName === 'spielansicht' ? 0.6 : 0);
  sky.position.copy(camera.position);
  controls?.update();
  composer.render();
  if (++frames === 3) window.__ready = true;
  if (!shotName || frames < 3) requestAnimationFrame(frame);
}
frame();
