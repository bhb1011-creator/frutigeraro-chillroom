import * as THREE from 'three';
import { heightAt, CLUSTER_Y } from '../world/terrain.js';
import { CLUSTER, SKYLINE_CENTER } from '../world/layout.js';

// The camera flight behind the start screen: a slow, closed loop over the meadow south of the
// tower cluster. It always looks somewhere between the walkable towers and the giant skyline far
// behind them, so both skylines stay in the picture while the view drifts.

const LOOP_SECONDS = 150;
// Control points (x, z, height above the meadow). Every point keeps clear of the cluster.
const PATH = [
  [10, 215, 16],
  [125, 175, 26],
  [205, 125, 40],
  [75, 30, 58],
  [-20, 40, 50],
  [-80, 135, 34],
  [-120, 205, 24],
  [-60, 240, 14],
];

const curve = new THREE.CatmullRomCurve3(
  PATH.map(([x, z, h]) => new THREE.Vector3(x, h, z)),
  true,
  'centripetal',
);
const clusterTarget = new THREE.Vector3(CLUSTER.x, CLUSTER_Y + 45, CLUSTER.z);
const skylineTarget = new THREE.Vector3(SKYLINE_CENTER.x, 170, SKYLINE_CENTER.z);
const p = new THREE.Vector3();
const toCluster = new THREE.Vector3();
const toSkyline = new THREE.Vector3();
const look = new THREE.Vector3();

/** Places the camera on the flight for time t (seconds); returns a point to centre shadows on. */
export function menuFlight(camera, t, out = new THREE.Vector3()) {
  curve.getPointAt(((t / LOOP_SECONDS) % 1 + 1) % 1, p);
  // Heights are relative to the rolling meadow below (smoothed a little so hills don't jolt).
  const ground = Math.max(heightAt(p.x, p.z), heightAt(p.x + 15, p.z), heightAt(p.x - 15, p.z), heightAt(p.x, p.z + 15), heightAt(p.x, p.z - 15));
  camera.position.set(p.x, ground + p.y, p.z);
  toCluster.subVectors(clusterTarget, camera.position).normalize();
  toSkyline.subVectors(skylineTarget, camera.position).normalize();
  // Slowly sway the gaze between the two skylines; when they lie far apart, look right between
  // them so neither leaves the picture.
  const apart = Math.acos(THREE.MathUtils.clamp(toCluster.dot(toSkyline), -1, 1));
  const w = 0.5 + 0.2 * THREE.MathUtils.clamp(1 - apart / 0.9, 0, 1) * Math.sin(t * 0.07);
  look.copy(toCluster).multiplyScalar(w).addScaledVector(toSkyline, 1 - w).normalize();
  camera.lookAt(look.clone().multiplyScalar(100).add(camera.position));
  // Shadows follow the area in front of the camera.
  return out.copy(camera.position).addScaledVector(look.setY(0).normalize(), 120);
}

export const MENU_PATH = { curve, LOOP_SECONDS };
