import * as THREE from 'three';

// Shared glossy materials: lots of clearcoat and reflections is the core of the Aero look.
export const materials = {
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x8fe4ff,
    metalness: 0.15,
    roughness: 0.04,
    transparent: true,
    opacity: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.8,
  }),
  glassCore: new THREE.MeshPhysicalMaterial({
    color: 0x2f8fd8,
    metalness: 0.3,
    roughness: 0.15,
    clearcoat: 1,
    envMapIntensity: 1.2,
  }),
  white: new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  }),
  silver: new THREE.MeshPhysicalMaterial({
    color: 0xdfe9f2,
    metalness: 0.85,
    roughness: 0.12,
    clearcoat: 1,
  }),
  aqua: new THREE.MeshPhysicalMaterial({
    color: 0x00b8ec,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
  }),
  leaf: new THREE.MeshPhysicalMaterial({
    color: 0x5ccf38,
    roughness: 0.3,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
  }),
  leafLight: new THREE.MeshPhysicalMaterial({
    color: 0x9be84a,
    roughness: 0.3,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
  }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x9a7350, roughness: 0.8 }),
  fountainWater: new THREE.MeshPhysicalMaterial({
    color: 0x5fdcff,
    roughness: 0.02,
    transparent: true,
    opacity: 0.6,
    clearcoat: 1,
    envMapIntensity: 1.6,
  }),
};
