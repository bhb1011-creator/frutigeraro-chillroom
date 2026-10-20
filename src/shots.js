import * as THREE from 'three';
import { heightAt } from './world/terrain.js';
import { LAKE, CITY } from './world/layout.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const ground = (x, z, up) => v(x, Math.max(heightAt(x, z), 0) + up, z);

// Fixed camera positions for screenshots, opened with ?shot=<name>.
export const SHOTS = {
  ueberblick: () => ({
    position: v(-110, 62, 125),
    target: v(10, 2, -35),
    fov: 50,
  }),
  spielansicht: (c) => {
    const p = c.position;
    const back = v(Math.sin(c.rotation.y), 0, Math.cos(c.rotation.y));
    return {
      position: p.clone().addScaledVector(back, -6.5).add(v(1.6, 2.6, 0)),
      target: p.clone().addScaledVector(back, 12).add(v(0, 2.5, 0)),
      fov: 60,
    };
  },
  figur: (c) => {
    const p = c.position;
    const fwd = v(Math.sin(c.rotation.y), 0, Math.cos(c.rotation.y));
    const side = v(fwd.z, 0, -fwd.x);
    return {
      position: p.clone().addScaledVector(fwd, 3.6).addScaledVector(side, 1.6).add(v(0, 1.5, 0)),
      target: p.clone().add(v(0, 1.25, 0)),
      fov: 45,
    };
  },
  see: () => ({
    position: v(LAKE.x - 22, 5, LAKE.z + 22),
    target: v(LAKE.x + 40, 10, LAKE.z - 40),
    fov: 62,
  }),
  stadt: () => ({
    position: v(CITY.x + 6, CITY.height + 3.2, CITY.z + 26),
    target: v(CITY.x - 4, CITY.height + 17, CITY.z - 20),
    fov: 68,
  }),
};
