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

  { pos: [-1.8868430414547763, -4.298094640661437, -3.1099631340175717],
    dir: [0.6254456604933333, -0.12561047542093048, 0.7700907311704162],
    name: "Focus on cat" },

  /* Look along path toward arc/tower so view follows motion */
  { pos: [-0.26214251379676456, -3.8656579355773606, -4.372777920792019],
    dir: [-0.543, -0.113, 0.832],
    name: "Surrounded by nature" },

  { pos: [-2.916796367924667, -4.2813842816247725, -3.5099455795932846],
    dir: [0.9155067787235391, 0.34164523753358894, 0.21242850510669758],
    name: "Focus on tower" },

  /* Same look angle for stop 7–8 */
  { pos: [-1.3678624673659563, -3.4102265358042487, -3.6680525943822753],
    dir: [-0.10396332339736762, 0.25065747695331503, 0.9624772499314322],
    name: "Seventh place" },

  { pos: [-3.1679199941413945, -0.37895494540152597, 13.16602432749402],
    dir: [-0.10396332339736762, 0.25065747695331503, 0.9624772499314322],
    name: "Eighth place" },
];

export const DEFAULT_CURVE_PARAMS = {
  curveType: "catmullrom", // "centripetal" | "chordal" | "catmullrom"
  tension: 0.5,
  closed: false,
};

const _smoothStep = (x) => x * x * (3 - 2 * x);
const _clamp01 = (x) => Math.max(0, Math.min(1, x));

export const WEIGHT_FNS = {
  linear: (t) => _clamp01(t),
  bell: (t) => 4 * _clamp01(t) * (1 - _clamp01(t)),
  easeIn: (t) => {
    const c = _clamp01(t);
    return c * c * c;
  },
  easeOut: (t) => {
    const c = _clamp01(t);
    return 1 - Math.pow(1 - c, 3);
  },
  smooth: (t) => _smoothStep(_clamp01(t)),
};

export const WEIGHT_FN_LABELS = {
  linear: "Linear",
  bell: "Bell (middle bulge)",
  easeIn: "Ease In",
  easeOut: "Ease Out",
  smooth: "Smooth",
};

export const WEIGHT_FN_NAMES = Object.keys(WEIGHT_FNS);

export function formatWaypointsForExport(waypoints) {
  return JSON.stringify(waypoints, null, 2);
}

/* ------------------------------------------------------------------ */
/*  Build the CatmullRomCurve3 position spline                       */
/* ------------------------------------------------------------------ */

const ARC_LENGTH_DIVISIONS = 200;

function buildPositionSpline(waypoints, params = DEFAULT_CURVE_PARAMS) {
  const points = waypoints.map((w) => new THREE.Vector3(...w.pos));
  const curveType = params.curveType ?? DEFAULT_CURVE_PARAMS.curveType;
  const closed = !!params.closed;
  const tension = params.tension ?? DEFAULT_CURVE_PARAMS.tension;
  return new THREE.CatmullRomCurve3(points, closed, curveType, tension);
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
const _eulerNoRoll = new THREE.Euler(0, 0, 0, "YXZ");

export function createSplineSampler(
  waypoints = SPLINE_WAYPOINTS,
  curveParams = DEFAULT_CURVE_PARAMS,
  segmentOffsets = null,
  segmentWeightFns = null,
  segmentGroups = null
) {
  const curve = buildPositionSpline(waypoints, curveParams);
  const quats = buildDirectionQuaternions(waypoints);
  const N = waypoints.length;
  const uAtWaypoint = computeWaypointArcLengths(curve, N);
  const totalLength = curve.getLength();
  const uAtAuthored = uAtWaypoint;
  const segmentLengths = Array.from({ length: N - 1 }, (_, i) => {
    return (uAtAuthored[i + 1] - uAtAuthored[i]) * totalLength;
  });

  const normalizedOffsets = Array.from({ length: N - 1 }, (_, i) => {
    const off = segmentOffsets?.[i] ?? [0, 0, 0];
    return [off[0] ?? 0, off[1] ?? 0, off[2] ?? 0];
  });
  const normalizedWeightFns = Array.from({ length: N - 1 }, (_, i) => {
    const fnName = segmentWeightFns?.[i] ?? "bell";
    return WEIGHT_FNS[fnName] ? fnName : "bell";
  });
  const normalizedGroups = (segmentGroups ?? [])
    .map((g) => {
      const start = Number(g?.start);
      const end = Number(g?.end);
      if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
      if (start < 0 || end < start || end >= N - 1) return null;
      const off = g?.offset ?? [0, 0, 0];
      const fnName = WEIGHT_FNS[g?.weightFn] ? g.weightFn : "bell";
      return {
        start,
        end,
        offset: [Number(off[0]) || 0, Number(off[1]) || 0, Number(off[2]) || 0],
        weightFn: fnName,
      };
    })
    .filter(Boolean);

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

    // Group deformation: selected multiple segments behave as one long segment.
    // Internal waypoints are ignored by evaluating one weight function on the whole span.
    let handledByGroup = false;
    for (let i = 0; i < normalizedGroups.length; i++) {
      const g = normalizedGroups[i];
      if (segIdx < g.start || segIdx > g.end) continue;
      const uStart = uAtWaypoint[g.start];
      const uEnd = uAtWaypoint[g.end + 1];
      const rangeT = uEnd > uStart ? (cu - uStart) / (uEnd - uStart) : 0;
      const fn = WEIGHT_FNS[g.weightFn] ?? WEIGHT_FNS.bell;
      const w = fn(rangeT);
      _sampledPos.x += g.offset[0] * w;
      _sampledPos.y += g.offset[1] * w;
      _sampledPos.z += g.offset[2] * w;
      handledByGroup = true;
      break;
    }

    // Per-segment deformation for non-grouped segments.
    if (!handledByGroup) {
      const offset = normalizedOffsets[segIdx];
      if (offset) {
        const fnName = normalizedWeightFns[segIdx] ?? "bell";
        const fn = WEIGHT_FNS[fnName] ?? WEIGHT_FNS.bell;
        const w = fn(localT);
        _sampledPos.x += offset[0] * w;
        _sampledPos.y += offset[1] * w;
        _sampledPos.z += offset[2] * w;
      }
    }

    // Slerp direction quaternions
    _sampledQuat.slerpQuaternions(quats[segIdx], quats[segIdx + 1], localT);

    // Keep horizontal tilt (roll) always 0 for a stable horizon
    _eulerNoRoll.setFromQuaternion(_sampledQuat, "YXZ");
    _eulerNoRoll.z = 0;
    _sampledQuat.setFromEuler(_eulerNoRoll);

    return { position: _sampledPos, quaternion: _sampledQuat, segmentIndex: segIdx };
  }

  return {
    curve,
    sample,
    uAtWaypoint,
    uAtAuthored,
    quats,
    totalLength,
    segmentLengths,
    curveParams: {
      curveType: curveParams.curveType ?? DEFAULT_CURVE_PARAMS.curveType,
      tension: curveParams.tension ?? DEFAULT_CURVE_PARAMS.tension,
      closed: !!curveParams.closed,
    },
    segmentOffsets: normalizedOffsets,
    segmentWeightFns: normalizedWeightFns,
    segmentGroups: normalizedGroups,
  };
}
