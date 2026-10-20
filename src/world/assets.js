import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const pending = [];
const cache = new Map();

const BASE = `${import.meta.env.BASE_URL}assets/`;

// Returns the texture right away (it fills in once loaded) and remembers the load so
// allLoaded() can wait for it.
export function loadTexture(name, { srgb = true, repeat = true } = {}) {
  const key = `${name}|${srgb}`;
  if (cache.has(key)) return cache.get(key);
  const tex = new THREE.Texture();
  pending.push(
    textureLoader.loadAsync(BASE + name).then((loaded) => {
      tex.image = loaded.image;
      tex.needsUpdate = true;
    }),
  );
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

export function loadModel(name) {
  const p = gltfLoader.loadAsync(BASE + name);
  pending.push(p);
  return p;
}

export function allLoaded() {
  return Promise.all(pending);
}
