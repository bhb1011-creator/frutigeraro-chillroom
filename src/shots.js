import * as THREE from 'three';
import { heightAt, CLUSTER_Y } from './world/terrain.js';
import { CLUSTER, SPAWN, TOWER_SITES } from './world/layout.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const ground = (x, z, up) => v(x, heightAt(x, z) + up, z);
// Cluster-local coordinates → world (the cluster ground is at CLUSTER_Y).
const c = (x, y, z) => v(CLUSTER.x + x, CLUSTER_Y + y, CLUSTER.z + z);

// Fixed camera positions for screenshots, opened with ?shot=<name>.
export const SHOTS = {
  ueberblick: () => ({
    position: ground(-170, 190, 45),
    target: v(40, 40, -200),
    fov: 52,
  }),
  spielansicht: (ch) => {
    const p = ch.position;
    const back = v(Math.sin(ch.rotation.y), 0, Math.cos(ch.rotation.y));
    return {
      position: p.clone().addScaledVector(back, -4.2).add(v(1.0, 2.1, 0)),
      target: p.clone().addScaledVector(back, 10).add(v(0, 2.6, 0)),
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
  horizont: () => ({
    position: ground(SPAWN.x - 20, SPAWN.z + 10, 2.2),
    target: v(-120, 110, -1500),
    fov: 55,
  }),
  boden: () => ({
    position: ground(SPAWN.x - 8, SPAWN.z - 8, 0.45),
    target: ground(30, -120, 30),
    fov: 60,
  }),
  hochhaeuser: () => ({
    position: c(-6, 1.8, 32),
    target: c(0, 32, -30),
    fov: 72,
  }),
  arenaTurm: () => {
    const s = TOWER_SITES.arena;
    return { position: ground(s.x - 38, s.z + 70, 2.2), target: v(s.x, CLUSTER_Y + 48, s.z), fov: 62 };
  },
  arenaDach: () => {
    const s = TOWER_SITES.arena;
    return { position: v(s.x + 14, CLUSTER_Y + 100, s.z + 12), target: v(s.x, CLUSTER_Y + 91, s.z), fov: 60 };
  },
  arenaLobby: () => {
    const s = TOWER_SITES.arena;
    const d = v(SPAWN.x - s.x, 0, SPAWN.z - s.z).normalize();
    return {
      position: v(s.x + d.x * 10.2, CLUSTER_Y + 1.8, s.z + d.z * 10.2),
      target: v(s.x + d.x * 5, CLUSTER_Y + 1.3, s.z + d.z * 5),
      fov: 70,
    };
  },
  lobby: () => {
    const s = TOWER_SITES.aqua;
    return {
      position: v(s.x - 2.5, CLUSTER_Y + 1.7, s.z + 7.8),
      target: v(s.x + 2.5, CLUSTER_Y + 2.4, s.z - 2),
      fov: 72,
    };
  },
  stock1: () => {
    const s = TOWER_SITES.aqua;
    return {
      position: v(s.x + 4, CLUSTER_Y + 6.9, s.z + 7),
      target: v(s.x - 4, CLUSTER_Y + 6.4, s.z - 2),
      fov: 72,
    };
  },
};
