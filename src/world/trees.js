import * as THREE from 'three';
import { Tree, LeafType } from '@dgreenheck/ez-tree';

// Textured procedural trees (EZ-Tree: real bark and leaf textures) drawn as instanced meshes
// with two levels of detail that swap by distance to the camera.

const SPECIES = {
  oak: { preset: 'Oak Medium', scale: 0.16, tint: 0xd8f5a8 },
  oakSmall: { preset: 'Oak Small', scale: 0.19, tint: 0xd0f59a },
  ash: { preset: 'Ash Medium', scale: 0.14, tint: 0xd2f7a0 },
  ashSmall: { preset: 'Ash Small', scale: 0.17, tint: 0xc8f590 },
  aspen: { preset: 'Aspen Medium', scale: 0.15, tint: 0xc8f590, leaf: LeafType.Ash },
  pine: { preset: 'Pine Medium', scale: 0.19, tint: 0xc0e8a8 },
  bush: { preset: 'Bush 1', scale: 0.07, tint: 0xd0f5a0 },
  bush2: { preset: 'Bush 2', scale: 0.075, tint: 0xc8f090 },
};

export const MEADOW_SPECIES = ['oak', 'oak', 'ash', 'ash', 'oakSmall', 'ashSmall', 'aspen', 'pine'];

const LOD_DISTANCE = 120;
const MAX_DISTANCE = 2200;

function generate(spec, seed, low) {
  const tree = new Tree();
  tree.loadPreset(spec.preset);
  const o = tree.options;
  o.seed = seed;
  o.leaves.tint = spec.tint;
  if (spec.leaf) o.leaves.type = spec.leaf;
  if (low) {
    // Far version: fewer branch levels and segments, bigger leaf cards to keep the silhouette.
    const lvl = o.branch.levels;
    o.branch.levels = Math.max(1, lvl - 1);
    for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(1, Math.ceil(o.branch.sections[k] / 3));
    for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = 3;
    if (o.type === 'evergreen') {
      // Needle clusters are dense; keep far pines to a few hundred triangles.
      o.branch.levels = 1;
      o.branch.children[0] = Math.min(o.branch.children[0], 12);
      o.leaves.count = Math.max(4, Math.round(o.leaves.count * 0.25));
      o.leaves.size *= 3;
    } else {
      // Fewer, much bigger leaf cards keep the crown full from a distance.
      o.leaves.count = Math.round(o.leaves.count * 2.2);
      o.leaves.size *= 2.8;
    }
    o.leaves.billboard = 'single';
  }
  tree.generate();
  return tree;
}

function leafMaterial(map, tint, uniforms) {
  // Push the photo leaves towards the saturated Aero green (values above 1 brighten the texture).
  const color = new THREE.Color(tint).multiply(new THREE.Color(1.2, 1.45, 0.85));
  const mat = new THREE.MeshStandardMaterial({
    map,
    color,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.55,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 tw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = tw.x * 0.3 + tw.z * 0.2 + position.y * 0.05;
        transformed.xz += uv.y * vec2(sin(uTime * 1.3 + ph), cos(uTime * 1.1 + ph)) * 0.35;`,
      );
  };
  mat.customProgramCacheKey = () => 'ez-leaf-v1';
  return mat;
}

function leafDepthMaterial(map) {
  return new THREE.MeshDepthMaterial({ map, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
}

function barkMaterial(src) {
  return new THREE.MeshStandardMaterial({
    map: src.map,
    normalMap: src.normalMap,
    aoMap: src.aoMap,
    color: src.color,
    roughness: 0.9,
  });
}

export class TreeField {
  constructor({ variantsPerSpecies = 2 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'trees';
    this.variantsPerSpecies = variantsPerSpecies;
    this.instances = [];
    this.uniforms = { uTime: { value: 0 } };
    this.lastCamera = new THREE.Vector3(Infinity, 0, 0);
  }

  add(species, x, y, z, { scale = 1, rotation = 0, lowOnly = false } = {}) {
    this.instances.push({ species, x, y, z, scale, rotation, lowOnly, variant: this.instances.length % this.variantsPerSpecies });
  }

  build() {
    const used = [...new Set(this.instances.map((i) => i.species))];
    this.buckets = [];
    this.pairs = [];
    let seed = 1000;
    for (const key of used) {
      const spec = SPECIES[key];
      for (let v = 0; v < this.variantsPerSpecies; v++) {
        seed += 7919;
        const members = this.instances.filter((i) => i.species === key && i.variant === v);
        if (!members.length) continue;
        const pair = { members, near: null, far: null };
        this.pairs.push(pair);
        for (const low of [false, true]) {
          if (!low && members.every((m) => m.lowOnly)) continue;
          const tree = generate(spec, seed, low);
          const leafMap = tree.leavesMesh.material.map;
          const branches = new THREE.InstancedMesh(
            tree.branchesMesh.geometry,
            barkMaterial(tree.branchesMesh.material),
            members.length,
          );
          const leaves = new THREE.InstancedMesh(
            tree.leavesMesh.geometry,
            leafMaterial(leafMap, tree.leavesMesh.material.color, this.uniforms),
            members.length,
          );
          leaves.customDepthMaterial = leafDepthMaterial(leafMap);
          for (const im of [branches, leaves]) {
            im.castShadow = !low;
            im.receiveShadow = true;
            im.frustumCulled = false;
            im.count = 0;
            this.group.add(im);
          }
          const bucket = { branches, leaves, spec };
          this.buckets.push(bucket);
          pair[low ? 'far' : 'near'] = bucket;
        }
      }
    }
    return this.group;
  }

  // Re-sort instances into near/far meshes when the camera has moved enough.
  update(t, camera) {
    this.uniforms.uTime.value = t;
    if (camera.position.distanceToSquared(this.lastCamera) < 64) return;
    this.lastCamera.copy(camera.position);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const b of this.buckets) {
      b.branches.count = 0;
      b.leaves.count = 0;
    }
    for (const { members, near, far } of this.pairs) {
      for (const inst of members) {
        const d = Math.hypot(inst.x - camera.position.x, inst.z - camera.position.z);
        if (d > MAX_DISTANCE) continue;
        const target = !inst.lowOnly && near && d < LOD_DISTANCE ? near : far;
        const sc = target.spec.scale * inst.scale;
        p.set(inst.x, inst.y, inst.z);
        q.setFromAxisAngle(yAxis, inst.rotation);
        s.set(sc, sc, sc);
        m.compose(p, q, s);
        target.branches.setMatrixAt(target.branches.count++, m);
        target.leaves.setMatrixAt(target.leaves.count++, m);
      }
    }
    for (const b of this.buckets) {
      b.branches.instanceMatrix.needsUpdate = true;
      b.leaves.instanceMatrix.needsUpdate = true;
    }
  }
}
