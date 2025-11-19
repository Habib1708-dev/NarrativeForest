// src/components/Terrain.jsx
import React, {
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from "react";
import * as THREE from "three";
import { computeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";
import { setTerrainParams } from "../proc/heightfield";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const DEFAULT_TERRAIN_PARAMS = Object.freeze({
  elevation: 7,
  frequency: 0.004,
  octaves: 8,
  seed: 2.2,
  scale: 5,
  color: "#0a0a0a",
  plateauHeight: 0,
  plateauSmoothing: 0,
  segments: 128,
  size: 20,
  baseHeight: 5,
  worldYOffset: -10,
});

function permute(x) {
  return ((x * 34 + 1) * x) % 289;
}

function simplexNoise(x, y) {
  const C = [
    0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439,
  ];

  let i = Math.floor(x + (x + y) * C[1]);
  let j = Math.floor(y + (x + y) * C[1]);

  let x0 = x - i + (i + j) * C[0];
  let y0 = y - j + (i + j) * C[0];

  let i1 = x0 > y0 ? 1 : 0;
  let j1 = x0 > y0 ? 0 : 1;

  let x1 = x0 - i1 + C[0];
  let y1 = y0 - j1 + C[0];
  let x2 = x0 - 1 + 2 * C[0];
  let y2 = y0 - 1 + 2 * C[0];

  i %= 289;
  j %= 289;

  const p0 = permute(permute(j) + i);
  const p1 = permute(permute(j + j1) + i + i1);
  const p2 = permute(permute(j + 1) + i + 1);

  let m0 = Math.max(0.5 - x0 * x0 - y0 * y0, 0);
  let m1 = Math.max(0.5 - x1 * x1 - y1 * y1, 0);
  let m2 = Math.max(0.5 - x2 * x2 - y2 * y2, 0);

  m0 **= 4;
  m1 **= 4;
  m2 **= 4;

  const px0 = 2 * ((p0 * C[3]) % 1) - 1;
  const py0 = Math.abs(px0) - 0.5;
  const ax0 = px0 - Math.floor(px0 + 0.5);

  const px1 = 2 * ((p1 * C[3]) % 1) - 1;
  const py1 = Math.abs(px1) - 0.5;
  const ax1 = px1 - Math.floor(px1 + 0.5);

  const px2 = 2 * ((p2 * C[3]) % 1) - 1;
  const py2 = Math.abs(px2) - 0.5;
  const ax2 = px2 - Math.floor(px2 + 0.5);

  m0 *= 1.79284291400159 - 0.85373472095314 * (ax0 * ax0 + py0 * py0);
  m1 *= 1.79284291400159 - 0.85373472095314 * (ax1 * ax1 + py1 * py1);
  m2 *= 1.79284291400159 - 0.85373472095314 * (ax2 * ax2 + py2 * py2);

  const g0 = ax0 * x0 + py0 * y0;
  const g1 = ax1 * x1 + py1 * y1;
  const g2 = ax2 * x2 + py2 * y2;

  return 130 * (m0 * g0 + m1 * g1 + m2 * g2);
}

function fbm(x, y, frequency, octaves, seed, scale) {
  let value = 0;
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

export default forwardRef(function Terrain({ config, ...props }, ref) {
  const meshRef = useRef();

  const terrainParams = useMemo(() => {
    if (!config) return DEFAULT_TERRAIN_PARAMS;
    return { ...DEFAULT_TERRAIN_PARAMS, ...config };
  }, [config]);

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
    geom.computeBoundsTree();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    return geom;
  }, [terrainParams]);

  useImperativeHandle(ref, () => meshRef.current, []);

  useEffect(() => {
    setTerrainParams(terrainParams);
  }, [terrainParams]);

  useEffect(() => () => terrainGeometry.dispose(), [terrainGeometry]);

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={terrainGeometry}
      position={[0, DEFAULT_TERRAIN_PARAMS.worldYOffset, 0]}
      {...props}
    >
      <meshStandardMaterial color={terrainParams.color} flatShading={false} />
    </mesh>
  );
});
