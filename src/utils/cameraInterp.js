// src/utils/cameraInterp.js
// Pure utilities for camera waypoint interpolation
// Uses Three.js math but returns plain objects/instances for consumers

import * as THREE from "three";

/**
 * @typedef {Object} EaseSpec
 * @property {('linear'|'easeIn'|'easeOut'|'easeInOut'|'sineInOut')} [name]
 * @property {number} [tension] - optional tension [0..1+] used by some curves
 */

/**
 * @typedef {Object} Waypoint
 * @property {[number, number, number]} position
 * @property {{ lookAt: [number, number, number], roll?: number } | { yaw: number, pitch: number }} orientation
 * @property {number} [fov]
 * @property {EaseSpec} [ease]
 * @property {string} [name]
 */

const DEFAULT_FOV = 50;
const UP = new THREE.Vector3(0, 1, 0);

/** Small hysteresis to avoid jitter at segment boundaries */
const EPS = 1e-3;

/** Clamp to [0, 1] */
export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/** Map an ease name to a function */
export function easeFn(name = "linear", tension = 0.5) {
  switch (name) {
    case "easeIn":
      return (t) => t * t;
    case "easeOut":
      return (t) => t * (2 - t);
    case "easeInOut":
      return (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    case "sineInOut":
      return (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
    case "linear":
    default:
      return (t) => t;
  }
}

/** Convert waypoint orientation to a quaternion */
export function quaternionFromWaypoint(wp) {
  const q = new THREE.Quaternion();
  if ("lookAt" in wp.orientation) {
    const pos = new THREE.Vector3(...wp.position);
    const target = new THREE.Vector3(...wp.orientation.lookAt);
    const m = new THREE.Matrix4();
    m.lookAt(pos, target, UP);
    q.setFromRotationMatrix(m);
    // Optional roll (rotate around camera forward/local-Z)
    if (
      typeof wp.orientation.roll === "number" &&
      isFinite(wp.orientation.roll)
    ) {
      const qRoll = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, -1),
        wp.orientation.roll
      );
      q.multiply(qRoll);
    }
    return q;
  }
  // yaw (y), pitch (x)
  const { yaw = 0, pitch = 0 } = wp.orientation;
  const e = new THREE.Euler(pitch, yaw, 0, "YXZ");
  q.setFromEuler(e);
  return q;
}

/**
 * Compute segment index and local t with hysteresis
 * @param {number} t normalized [0..1]
 * @param {number} count number of waypoints
 */
export function segmentAt(t, count) {
  const nSeg = Math.max(0, count - 1);
  if (nSeg === 0) return { i: 0, u: 0 };
  let s = clamp01(t) * nSeg;
  // Prevent bouncing exactly at boundaries
  // Move slightly inward for numeric stability
  const isLast = s >= nSeg;
  if (isLast) s = nSeg - EPS;
  let i = Math.floor(s);
  let u = s - i;
  if (u < EPS) u = EPS;
  if (u > 1 - EPS) u = 1 - EPS;
  // Clamp i range
  i = Math.max(0, Math.min(nSeg - 1, i));
  return { i, u };
}

/**
 * Pure pose interpolation between two waypoints
 * @param {Waypoint} a
 * @param {Waypoint} b
 * @param {number} u local [0..1]
 * @returns {{ position: THREE.Vector3, quaternion: THREE.Quaternion, fov: number }}
 */
export function interpolatePose(a, b, u) {
  const ea = easeFn(a?.ease?.name, a?.ease?.tension);
  const eb = easeFn(b?.ease?.name, b?.ease?.tension);
  // Blend the ease by u (softly transition ease types)
  const tA = ea(u);
  const tB = eb(u);
  const ue = (1 - u) * tA + u * tB;

  const pa = new THREE.Vector3(...a.position);
  const pb = new THREE.Vector3(...b.position);
  const pos = pa.clone().lerp(pb, ue);

  const qa = quaternionFromWaypoint(a);
  const qb = quaternionFromWaypoint(b);
  const quat = new THREE.Quaternion();
  quat.slerpQuaternions(qa, qb, ue);

  const fovA = a.fov ?? DEFAULT_FOV;
  const fovB = b.fov ?? fovA;
  const fov = THREE.MathUtils.lerp(fovA, fovB, ue);

  return { position: pos, quaternion: quat, fov };
}

/**
 * Compute pose at normalized t across waypoints
 * @param {Waypoint[]} waypoints
 * @param {number} t normalized [0..1]
 */
export function getPoseAt(waypoints, t) {
  const count = waypoints?.length ?? 0;
  if (count === 0) {
    return {
      position: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion(),
      fov: DEFAULT_FOV,
      segmentIndex: 0,
    };
  }
  if (count === 1) {
    const wp = waypoints[0];
    return {
      position: new THREE.Vector3(...wp.position),
      quaternion: quaternionFromWaypoint(wp),
      fov: wp.fov ?? DEFAULT_FOV,
      segmentIndex: 0,
    };
  }
  const { i, u } = segmentAt(t, count);
  const a = waypoints[i];
  const b = waypoints[i + 1];
  const pose = interpolatePose(a, b, u);
  return { ...pose, segmentIndex: i };
}

/**
 * Compute yaw/pitch (in radians) from a quaternion
 * Returns { yaw, pitch }
 */
export function yawPitchFromQuaternion(q) {
  const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
  return { yaw: e.y, pitch: e.x };
}
