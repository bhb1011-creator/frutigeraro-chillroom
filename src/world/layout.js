// Where things are in the dream meadow. Terrain, grass and towers all read from here.

export const SPAWN = { x: 0, z: 70 };

// The towers stand together as one cluster in the meadow; the ground under the cluster is levelled.
export const CLUSTER = { x: 42, z: -110, r: 62 };

// Tower footprints in world coordinates (x, z, radius) — kept free of grass.
// Tower designs per site live in city/city.js.
export const TOWER_SITES = {
  aqua: { x: 42, z: -154, r: 12 },
  wave: { x: 1, z: -124, r: 14 },
  capsula: { x: 83, z: -124, r: 10 },
  terraces: { x: 2, z: -80, r: 13 },
  helix: { x: 68, z: -150, r: 11 },
  nimbus: { x: 17, z: -150, r: 9 },
  twinA: { x: 76, z: -79, r: 8 },
  twinB: { x: 90, z: -93, r: 8 },
};

export const TURBINES = [
  [-130, -120],
  [-100, -150],
  [-160, -80],
  [125, 40],
  [150, 5],
  [175, -40],
  [-95, 95],
  [-220, -10],
  [235, -150],
  [-40, -300],
  [150, -320],
];

// Near terrain is detailed; the far ring is coarse and only shows rolling hills to the horizon.
export const NEAR_SIZE = 760;
export const FAR_SIZE = 6000;
