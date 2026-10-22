import * as THREE from 'three';
import { heightAt } from './world/terrain.js';
import { LAKE, CITY, PODIUM } from './world/layout.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const ground = (x, z, up) => v(x, Math.max(heightAt(x, z), 0) + up, z);
// Plaza-local coordinates → world (plaza floor is at CITY.height).
const c = (x, y, z) => v(CITY.x + x, CITY.height + y, CITY.z + z);

// Fixed camera positions for screenshots, opened with ?shot=<name>.
export const SHOTS = {
  ueberblick: () => ({
    position: v(-190, 95, 170),
    target: v(20, 5, -70),
    fov: 50,
  }),
  spielansicht: (ch) => {
    const p = ch.position;
    const back = v(Math.sin(ch.rotation.y), 0, Math.cos(ch.rotation.y));
    return {
      position: p.clone().addScaledVector(back, -4.2).add(v(1.0, 2.1, 0)),
      target: p.clone().addScaledVector(back, 10).add(v(0, 1.8, 0)),
      fov: 60,
    };
  },
  figur: (ch) => {
    const p = ch.position;
    const fwd = v(Math.sin(ch.rotation.y), 0, Math.cos(ch.rotation.y));
    const side = v(fwd.z, 0, -fwd.x);
    return {
      position: p.clone().addScaledVector(fwd, 2.4).addScaledVector(side, 0.8).add(v(0, 1.25, 0)),
      target: p.clone().add(v(0, 0.75, 0)),
      fov: 45,
    };
  },
  figuren: () => ({
    position: ground(PODIUM.x + 0.3, PODIUM.z + 4.3, 1.55),
    target: ground(PODIUM.x, PODIUM.z - 0.6, 1.1),
    fov: 50,
  }),
  boden: () => ({
    position: ground(-26, 66, 0.45),
    target: ground(-42, 50, 0.8),
    fov: 60,
  }),
  see: () => ({
    position: v(LAKE.x - 26, 5, LAKE.z + 26),
    target: v(LAKE.x + 50, 14, LAKE.z - 60),
    fov: 62,
  }),
  stadt: () => ({
    position: c(-3, 2.4, 50),
    target: c(0, 14, -20),
    fov: 68,
  }),
  platz: () => ({
    position: c(24, 30, 36),
    target: c(-6, 6, -16),
    fov: 60,
  }),
  lobby: () => ({
    position: c(-2.5, 1.7, -36.2),
    target: c(2.5, 2.4, -46),
    fov: 72,
  }),
  stock1: () => ({
    position: c(4, 6.9, -37),
    target: c(-4, 6.4, -46),
    fov: 72,
  }),
};
