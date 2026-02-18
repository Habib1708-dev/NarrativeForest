// src/utils/splineCameraPath.js
// Spline-based camera path with arc-length normalization and direction interpolation.
// Completely independent of the existing waypoint/camera system.

import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Waypoint data — 9 authored camera positions + look directions     */
/* ------------------------------------------------------------------ */

export const SPLINE_WAYPOINTS = [
  { pos: [-2.816893637286067, -3.2067743485167215, -8.376889215302246],
    dir: [0.20002479474854606, -0.23954654636708755, 0.9500565949507445],
    name: "Starting place" },

  { pos: [-2.333634799505573, -4.029594010528281, -4.856170626657576],
    dir: [0.311817264743037, -0.26043403413309546, 0.9137527604737141],
    name: "Butterfly fades" },

  { pos: [-2.226439158913638, -4.429710017515003, -3.901100780800079],
    dir: [0.6141963905759642, -0.06925810123429565, 0.7861082045220478],
    name: "Focus on man" },

  { pos: [-1.959358204104523, -4.255603846586547, -3.315397466991112],
    dir: [0.6254456604933333, -0.12561047542093048, 0.7700907311704162],
    name: "Focus on cat" },

  { pos: [-0.26214251379676456, -3.8656579355773606, -4.372777920792019],
    dir: [-0.6450087719764547, -0.1389709534520352, 0.7514324707983133],
    name: "Surrounded by nature" },

  { pos: [-2.916796367924667, -4.2813842816247725, -3.5099455795932846],
    dir: [0.9155067787235391, 0.34164523753358894, 0.21242850510669758],
    name: "Focus on tower" },

  { pos: [-1.3678624673659563, -3.4102265358042487, -3.6680525943822753],
    dir: [0.10455921319589376, 0.23323946174558335, 0.9667816322316465],
    name: "Seventh place" },

  { pos: [-1.8010822079796402, -2.8748063068460863, -0.05366466709301476],
    dir: [0.47261409071424826, 0.2279894150094293, 0.8512677298605901],
    name: "Eighth place" },

  { pos: [-0.596151208267888, -1.3101743927121208, 5.0447951625564675],
    dir: [-0.005415530093808769, 0.1990135394065256, 0.9799817769564343],
    name: "Ninth place" },
];

/* ------------------------------------------------------------------ */
/*  Build the CatmullRomCurve3 position spline                       */
/* ------------------------------------------------------------------ */

const ARC_LENGTH_DIVISIONS = 200;

function buildPositionSpline(waypoints) {
  const points = waypoints.map((w) => new THREE.Vector3(...w.pos));
  // centripetal Catmull-Rom avoids cusps and self-intersections
  return new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
}

/* ------------------------------------------------------------------ */
/*  Build look-direction quaternions from direction vectors            */
/* ------------------------------------------------------------------ */

const _lookPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _lookMat = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

function buildDirectionQuaternions(waypoints) {
  return waypoints.map((w) => {
    _lookPos.set(...w.pos);
    _lookTarget.set(...w.dir).normalize().add(_lookPos);
    _lookMat.lookAt(_lookPos, _lookTarget, _up);
    const q = new THREE.Quaternion().setFromRotationMatrix(_lookMat);
    // zero roll
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    e.z = 0;
    return new THREE.Quaternion().setFromEuler(e);
  });
}

/* ------------------------------------------------------------------ */
/*  Map parametric t → arc-length u for each waypoint                 */
/* ------------------------------------------------------------------ */

function computeWaypointArcLengths(curve, waypointCount) {
  const lengths = curve.getLengths(ARC_LENGTH_DIVISIONS);
  const totalLength = lengths[ARC_LENGTH_DIVISIONS];
  const N = waypointCount;
  const uValues = new Array(N);

  for (let i = 0; i < N; i++) {
    const paramT = i / (N - 1);
    const idx = paramT * ARC_LENGTH_DIVISIONS;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, ARC_LENGTH_DIVISIONS);
    const frac = idx - lo;
    const len = lengths[lo] + (lengths[hi] - lengths[lo]) * frac;
    uValues[i] = len / totalLength;
  }
  return uValues;
}

/* ------------------------------------------------------------------ */
/*  Create the sampler — the public API                               */
/* ------------------------------------------------------------------ */

// Pre-allocated objects reused every frame to avoid GC pressure
const _sampledPos = new THREE.Vector3();
const _sampledQuat = new THREE.Quaternion();

export function createSplineSampler(waypoints = SPLINE_WAYPOINTS) {
  const curve = buildPositionSpline(waypoints);
  const quats = buildDirectionQuaternions(waypoints);
  const N = waypoints.length;
  const uAtWaypoint = computeWaypointArcLengths(curve, N);

  function sample(u) {
    const cu = Math.max(0, Math.min(1, u));

    // Position via arc-length parameterisation
    curve.getPointAt(cu, _sampledPos);

    // Find which waypoint segment cu falls in
    let segIdx = N - 2; // default to last segment
    for (let i = 0; i < N - 1; i++) {
      if (cu <= uAtWaypoint[i + 1]) {
        segIdx = i;
        break;
      }
    }

    // Local blend within segment
    const segStart = uAtWaypoint[segIdx];
    const segEnd = uAtWaypoint[segIdx + 1];
    const localT =
      segEnd > segStart ? (cu - segStart) / (segEnd - segStart) : 0;

    // Slerp direction quaternions
    _sampledQuat.slerpQuaternions(quats[segIdx], quats[segIdx + 1], localT);

    return { position: _sampledPos, quaternion: _sampledQuat, segmentIndex: segIdx };
  }

  return { curve, sample, uAtWaypoint, quats };
}
