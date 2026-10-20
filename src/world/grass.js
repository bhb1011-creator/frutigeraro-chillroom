import * as THREE from 'three';
import { createRng } from './noise.js';
import { heightAt, distanceToPath, distanceToCity } from './terrain.js';
import { CITY } from './layout.js';

// One tapered blade, bending slightly forward, with a dark base and bright tip.
function bladeGeometry() {
  const segments = 4;
  const positions = [];
  const colors = [];
  const indices = [];
  const base = new THREE.Color(0x1f8a3a);
  const tip = new THREE.Color(0xc8f56a);
  const c = new THREE.Color();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = 0.07 * (1 - t * 0.85);
    const bend = t * t * 0.18;
    positions.push(-w, t, bend, w, t, bend);
    c.copy(base).lerp(tip, Math.pow(t, 0.8));
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createGrass({ count = 160000, radius = 150, center = new THREE.Vector2(0, 0), seed = 3 } = {}) {
  const rng = createRng(seed);
  const geo = bladeGeometry();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.55,
  });

  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 iw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.6 + iw.x * 0.15 + iw.z * 0.1) * 0.12 + sin(uTime * 3.1 + iw.x * 0.7) * 0.03;
        transformed.z += sway * position.y * position.y;`,
      );
    // Grass faces up for lighting so it shades like a soft lawn.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      'vec3 objectNormal = vec3(0.0, 1.0, 0.0);',
    );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 4) {
    tries++;
    // Denser near the center so the foreground looks lush.
    const r = radius * Math.pow(rng(), 0.75);
    const a = rng() * Math.PI * 2;
    const x = center.x + Math.cos(a) * r;
    const z = center.y + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 0.7 || h > 30) continue;
    if (distanceToPath(x, z) < 1.7) continue;
    if (distanceToCity(x, z) < CITY.r - 2) continue;
    p.set(x, h - 0.05, z);
    q.setFromAxisAngle(yAxis, rng() * Math.PI * 2);
    const height = 0.45 + rng() * 0.7;
    s.set(1 + rng() * 0.6, height, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed++, m);
  }
  mesh.count = placed;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'grass';
  mesh.userData.update = (t) => {
    uniforms.uTime.value = t;
  };
  return mesh;
}
