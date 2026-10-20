import * as THREE from 'three';
import { createRng } from './noise.js';

export const SUN_DIRECTION = new THREE.Vector3(0.78, 0.52, 0.18).normalize();

export function createSky() {
  const geo = new THREE.SphereGeometry(1000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x0a64cf) },
      uMid: { value: new THREE.Color(0x3fb0f2) },
      uHorizon: { value: new THREE.Color(0xd9f6ff) },
      uSunDir: { value: SUN_DIRECTION },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, y));
        col = mix(col, uTop, smoothstep(0.25, 0.9, y));
        col = mix(col, uHorizon * 0.97, smoothstep(0.0, -0.2, y));
        float s = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.97, 0.85) * (pow(s, 6.0) * 0.25 + pow(s, 64.0) * 0.6);
        col += vec3(1.0) * smoothstep(0.9993, 0.9997, s) * 6.0;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

function puffTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Fluffy cumulus clouds made of soft billboard puffs.
export function createClouds(seed = 7) {
  const rng = createRng(seed);
  const group = new THREE.Group();
  group.name = 'clouds';
  const tex = puffTexture();
  const top = new THREE.Color(0xffffff);
  const bottom = new THREE.Color(0xcfe0f2);

  for (let i = 0; i < 34; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 160 + rng() * 380;
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const cy = 70 + rng() * 90;
    const scale = 0.7 + rng() * 1.1;
    const cloud = new THREE.Group();
    cloud.position.set(cx, cy, cz);
    const puffs = 10 + Math.floor(rng() * 10);
    for (let p = 0; p < puffs; p++) {
      const t = p / puffs;
      const ox = (rng() - 0.5) * 70 * scale;
      const oy = Math.sin(t * Math.PI) * 14 * scale * rng() + rng() * 6;
      const oz = (rng() - 0.5) * 30 * scale;
      const s = (20 + rng() * 26) * scale * (1 - Math.abs(ox) / (90 * scale));
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: bottom.clone().lerp(top, Math.min(1, oy / (12 * scale))),
        transparent: true,
        depthWrite: false,
        fog: false,
        opacity: 0.95,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(ox, oy, oz);
      sprite.scale.setScalar(Math.max(8, s));
      cloud.add(sprite);
    }
    group.add(cloud);
  }
  return group;
}
