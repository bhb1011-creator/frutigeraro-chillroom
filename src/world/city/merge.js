import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clean } from './tower.js';

/**
 * Bakes every static Mesh under `root` into one mesh per material (thousands of draw calls → a few dozen).
 * Instanced meshes, lines and anything listed in a parent's userData.dynamic are left alone.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const dynamic = new Set();
  root.traverse((o) => {
    for (const d of o.userData.dynamic ?? []) d.traverse((c) => dynamic.add(c));
  });

  const byMaterial = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || dynamic.has(o) || Array.isArray(o.material)) return;
    const geo = clean(o.geometry.clone());
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    let entry = byMaterial.get(o.material);
    if (!entry) {
      entry = { geos: [], cast: false, receive: false };
      byMaterial.set(o.material, entry);
    }
    entry.geos.push(geo);
    entry.cast ||= o.castShadow;
    entry.receive ||= o.receiveShadow;
    remove.push(o);
  });
  for (const o of remove) o.removeFromParent();

  const merged = new THREE.Group();
  merged.name = 'merged-static';
  for (const [material, { geos, cast, receive }] of byMaterial) {
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    merged.add(m);
  }
  root.add(merged);
  return merged;
}
