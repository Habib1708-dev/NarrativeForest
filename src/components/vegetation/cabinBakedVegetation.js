import * as THREE from "three";
import {
  CABIN_PROPS_PLACED_ROCKS,
  CABIN_PROPS_PLACED_TREES,
} from "../../state/useCabinPropsPlacementStore";

const deg2rad = (deg) => (deg * Math.PI) / 180;

// Original 5 cabin rocks that existed before placement data.
const ORIGINAL_5_ROCKS = [
  {
    position: [-1.944, -4.792, -1.841],
    scale: 0.178,
    rotDeg: [0, -100.9, -67.3],
  },
  {
    position: [-1.505, -4.822, -1.664],
    scale: 0.21,
    rotDeg: [3.4, 53.8, -6.7],
  },
  {
    position: [-1.411, -4.983, -1.72],
    scale: 0.288,
    rotDeg: [40.3, -10.1, 0],
  },
  {
    position: [-1.262, -4.801, -1.623],
    scale: 0.304,
    rotDeg: [0, 0, -97.6],
  },
  { position: [-1.0, -4.815, -1.804], scale: 0.251, rotDeg: [0, 0, 0] },
];

function composeMatrix({
  position,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
  scale,
}) {
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3(position[0], position[1], position[2]);
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotationX, rotationY, rotationZ)
  );
  const s = new THREE.Vector3(scale, scale, scale);
  m4.compose(p, q, s);
  return m4;
}

const bakedTreeMatrices = Object.freeze(
  CABIN_PROPS_PLACED_TREES.map((e) =>
    composeMatrix({
      position: e.position,
      rotationX: e.rotationX ?? 0,
      rotationY: e.rotationY ?? 0,
      rotationZ: e.rotationZ ?? 0,
      scale: e.scale,
    })
  )
);

const bakedRockMatrices = (() => {
  const out = [];

  for (let i = 0; i < ORIGINAL_5_ROCKS.length; i++) {
    const r = ORIGINAL_5_ROCKS[i];
    out.push(
      composeMatrix({
        position: r.position,
        rotationX: deg2rad(r.rotDeg[0]),
        rotationY: deg2rad(r.rotDeg[1]),
        rotationZ: deg2rad(r.rotDeg[2]),
        scale: r.scale,
      })
    );
  }

  for (let i = 0; i < CABIN_PROPS_PLACED_ROCKS.length; i++) {
    const e = CABIN_PROPS_PLACED_ROCKS[i];
    out.push(
      composeMatrix({
        position: e.position,
        rotationX: e.rotationX ?? 0,
        rotationY: e.rotationY ?? 0,
        rotationZ: e.rotationZ ?? 0,
        scale: e.scale,
      })
    );
  }

  return Object.freeze(out);
})();

export function getCabinBakedTreeMatrices() {
  return bakedTreeMatrices;
}

export function getCabinBakedRockMatrices() {
  return bakedRockMatrices;
}

