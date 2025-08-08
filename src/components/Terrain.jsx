// src/components/Terrain.jsx
import React, { useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import {
  computeBoundsTree,
  acceleratedRaycast,
  disposeBoundsTree,
} from "three-mesh-bvh";
import { useControls } from "leva";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Simplex noise implementation for JavaScript
function permute(x) {
  return ((x * 34.0 + 1.0) * x) % 289.0;
}

function simplexNoise(x, y) {
  const C = [
    0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439,
  ];

  let i = Math.floor(x + (x + y) * C[1]);
  let j = Math.floor(y + (x + y) * C[1]);

  let x0 = x - i + (i + j) * C[0];
  let y0 = y - j + (i + j) * C[0];

  let i1 = x0 > y0 ? 1.0 : 0.0;
  let j1 = x0 > y0 ? 0.0 : 1.0;

  let x1 = x0 - i1 + C[0];
  let y1 = y0 - j1 + C[0];
  let x2 = x0 - 1.0 + 2.0 * C[0];
  let y2 = y0 - 1.0 + 2.0 * C[0];

  i %= 289.0;
  j %= 289.0;

  const p0 = permute(permute(j) + i);
  const p1 = permute(permute(j + j1) + i + i1);
  const p2 = permute(permute(j + 1.0) + i + 1.0);

  let m0 = Math.max(0.5 - x0 * x0 - y0 * y0, 0.0);
  let m1 = Math.max(0.5 - x1 * x1 - y1 * y1, 0.0);
  let m2 = Math.max(0.5 - x2 * x2 - y2 * y2, 0.0);

  m0 = m0 ** 4;
  m1 = m1 ** 4;
  m2 = m2 ** 4;

  const px0 = 2.0 * ((p0 * C[3]) % 1.0) - 1.0;
  const py0 = Math.abs(px0) - 0.5;
  const ax0 = px0 - Math.floor(px0 + 0.5);

  const px1 = 2.0 * ((p1 * C[3]) % 1.0) - 1.0;
  const py1 = Math.abs(px1) - 0.5;
  const ax1 = px1 - Math.floor(px1 + 0.5);

  const px2 = 2.0 * ((p2 * C[3]) % 1.0) - 1.0;
  const py2 = Math.abs(px2) - 0.5;
  const ax2 = px2 - Math.floor(px2 + 0.5);

  m0 *= 1.79284291400159 - 0.85373472095314 * (ax0 * ax0 + py0 * py0);
  m1 *= 1.79284291400159 - 0.85373472095314 * (ax1 * ax1 + py1 * py1);
  m2 *= 1.79284291400159 - 0.85373472095314 * (ax2 * ax2 + py2 * py2);

  const g0 = ax0 * x0 + py0 * y0;
  const g1 = ax1 * x1 + py1 * y1;
  const g2 = ax2 * x2 + py2 * y2;

  return 130.0 * (m0 * g0 + m1 * g1 + m2 * g2);
}

// Fractional Brownian Motion (fBm)
function fbm(x, y, frequency, octaves, seed, scale) {
  let value = 0.0;
  let amplitude = 0.5;
  let freq = frequency;

  for (let o = 0; o < octaves; o++) {
    value +=
      amplitude *
      simplexNoise(
        (x + seed * 100) * freq * scale,
        (y + seed * 100) * freq * scale
      );
    freq *= 2;
    amplitude *= 0.5;
  }

  return value;
}

// Plateau smoothing
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function plateauize(h, threshold, smoothing) {
  const low = Math.max(0, threshold - smoothing);
  const high = Math.min(1, threshold + smoothing);
  if (h < low || h > high) return h;
  const n = (h - low) / (high - low);
  return low + (h - low) * smoothstep(0, 1, n);
}

export default forwardRef(function Terrain(props, ref) {
  const meshRef = useRef();

  // 1) Leva controls
  const terrainParams = useControls("Terrain", {
    elevation: { value: 5, min: 0, max: 150, step: 1 },
    frequency: { value: 0.004, min: 0.001, max: 0.05, step: 0.001 },
    octaves: { value: 8, min: 1, max: 8, step: 1 },
    seed: { value: 2.2, min: 0.1, max: 10, step: 0.1 },
    scale: { value: 5, min: 0.1, max: 5, step: 0.1 },
    color: { value: "#4b7d23" },
    plateauHeight: { value: 0, min: 0, max: 1, step: 0.01 },
    plateauSmoothing: { value: 0.2, min: 0, max: 1, step: 0.01 },
    segments: { value: 256, min: 32, max: 512, step: 32 },
    size: { value: 30, min: 10, max: 100, step: 5 },
    baseHeight: { value: 5, min: 0, max: 20, step: 1 },
  });

  // 2) Build & displace the plane, then accelerate it
  const terrainGeometry = useMemo(() => {
    const {
      size,
      segments,
      elevation,
      frequency,
      octaves,
      seed,
      scale,
      plateauHeight,
      plateauSmoothing,
      baseHeight,
    } = terrainParams;

    const geom = new THREE.PlaneGeometry(size, size, segments, segments);
    const pos = geom.attributes.position.array;
    const segs = segments;
    const count = segs + 1;

    // Directly displace each vertex
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < count; j++) {
        const idx = 3 * (i * count + j);
        const x = (i / segs) * size - size / 2;
        const z = (j / segs) * size - size / 2;

        const d = fbm(x, z, frequency, octaves, seed, scale) * elevation;
        const n =
          plateauize(d / elevation, plateauHeight, plateauSmoothing) *
          elevation;
        pos[idx + 2] = Math.abs(n) + baseHeight;
      }
    }

    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();
    geom.attributes.normal.needsUpdate = true;

    //Build the BVH for accelerated raycasting
    geom.computeBoundsTree();

    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    return geom;
  }, [terrainParams]);

  useEffect(() => {
    const geom = terrainGeometry;
    return () => {
      // this runs before the next terrainGeometry is set, and on unmount
      geom?.disposeBoundsTree?.();
      geom?.dispose();
    };
  }, [terrainGeometry]);

  // 3) Expose the mesh instance to parent via ref
  useImperativeHandle(ref, () => meshRef.current, []);

  // 4) Render with Standard material
  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={terrainGeometry}
      position={[0, -10, 0]}
    >
      <meshStandardMaterial color={terrainParams.color} flatShading={false} />
    </mesh>
  );
});
