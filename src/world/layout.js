// Where things are in the world. Terrain, path, grass and props all read from here.
import * as THREE from 'three';

export const WATER_LEVEL = 0;
export const LAKE = { x: -52, z: -8, r: 36 };
export const CITY = { x: 42, z: -110, r: 62, height: 2.2 };

// Walkway from the meadow spawn to the south entrance of the city plaza.
export const PATH_POINTS = [
  [0, 70],
  [1, 48],
  [-6, 28],
  [3, 6],
  [16, -16],
  [28, -32],
  [38, -46],
].map(([x, z]) => new THREE.Vector2(x, z));

export const TURBINES = [
  [-130, -120],
  [-100, -150],
  [-160, -80],
  [125, 40],
  [150, 5],
  [170, -40],
];

// Near terrain is detailed; the far ring is coarse and only shows rolling hills to the horizon.
export const NEAR_SIZE = 760;
export const FAR_SIZE = 6000;
