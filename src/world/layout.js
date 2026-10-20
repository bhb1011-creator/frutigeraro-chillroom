// Where things are in the world. Terrain, path, grass and props all read from here.
import * as THREE from 'three';

export const WATER_LEVEL = 0;
export const SPAWN = new THREE.Vector2(0, 58);
export const LAKE = { x: -48, z: -4, r: 34 };
export const CITY = { x: 38, z: -72, r: 40, height: 2.2 };

export const PATH_POINTS = [
  [0, 66],
  [1, 44],
  [-6, 24],
  [3, 4],
  [17, -18],
  [27, -38],
  [36, -58],
].map(([x, z]) => new THREE.Vector2(x, z));

export const TURBINES = [
  [-105, -95],
  [-80, -125],
  [-128, -62],
  [95, 40],
  [118, 10],
];
