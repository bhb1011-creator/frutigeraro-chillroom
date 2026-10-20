import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel } from './assets.js';

// Translucent glass people, the classic Frutiger Aero figure: a clear, iridescent body with an
// aqua rim glow and a softly glowing core in the chest.

function glassMaterial(tint) {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    metalness: 0,
    roughness: 0.05,
    // Plain alpha instead of transmission: looks the same at this size and saves a full extra render pass.
    transparent: true,
    opacity: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    iridescence: 0.45,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [180, 600],
    envMapIntensity: 1.8,
    specularIntensity: 1,
  });
}

function rimMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: 2.2 }, uStrength: { value: 1.6 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vN = normalize(normalMatrix * objectNormal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uStrength;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        gl_FragColor = vec4(uColor * f * uStrength, f);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

let source = null;
async function loadSource() {
  source ??= loadModel('Xbot.glb');
  return source;
}

/**
 * Creates one glass figure. Returns a Group with userData:
 *  mixer, actions { idle, walk, run }, play(name), update(dt), pose(name, time)
 */
export async function createGlassPerson({ tint = 0xdff8ff, rim = 0x5fe0ff, core = 0x7dffb0 } = {}) {
  const gltf = await loadSource();
  const root = cloneSkinned(gltf.scene);
  const body = glassMaterial(tint);
  const joints = glassMaterial(new THREE.Color(tint).lerp(new THREE.Color(0x7fe0ff), 0.6));
  const rimMat = rimMaterial(rim);
  const skinned = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) skinned.push(o);
  });
  for (const o of skinned) {
    o.material = o.material.name?.includes('Joints') ? joints : body;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false;
    const glow = new THREE.SkinnedMesh(o.geometry, rimMat);
    glow.bind(o.skeleton, o.bindMatrix);
    glow.frustumCulled = false;
    glow.renderOrder = 5;
    o.parent.add(glow);
  }

  // Glowing core inside the chest.
  let chest = null;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isBone && /Spine2$/.test(o.name)) chest = o;
  });
  if (chest) {
    const coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 24, 16),
      new THREE.MeshStandardMaterial({ color: core, emissive: core, emissiveIntensity: 3 }),
    );
    // Bones are in centimeter-ish units in this rig; scale the offset to the bone's world size.
    coreMesh.scale.setScalar(1 / chest.getWorldScale(new THREE.Vector3()).x);
    coreMesh.position.set(0, 5, 4);
    chest.add(coreMesh);
  }

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of gltf.animations) {
    if (['idle', 'walk', 'run'].includes(clip.name)) actions[clip.name] = mixer.clipAction(clip);
  }
  let current = null;
  const group = new THREE.Group();
  group.name = 'glass-person';
  group.add(root);
  group.userData = {
    mixer,
    actions,
    play(name, fade = 0.3) {
      const next = actions[name];
      if (!next || next === current) return;
      next.reset().play();
      if (current) current.crossFadeTo(next, fade, false);
      current = next;
    },
    update(dt) {
      mixer.update(dt);
    },
    pose(name, time) {
      mixer.stopAllAction();
      current = actions[name];
      current.reset().play();
      mixer.setTime(time);
    },
  };
  group.userData.play('idle');
  return group;
}
