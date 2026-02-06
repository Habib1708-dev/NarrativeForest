// src/components/FakeLake.jsx
// Simple static gray plane for performance testing - replaces Lake component
// Maintains same API (getFootprint) and dimensions for exclusion zone compatibility
import React, {
  useMemo,
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useControls, folder } from "leva";
import { useDebugStore } from "../../state/useDebugStore";

// === Static defaults (used when debug mode is off) ===
const LAKE_DEFAULTS = Object.freeze({
  lakePosX: -1.8,
  lakePosY: -4.79,
  lakePosZ: -2.8,
  lakeSizeX: 2.0,
  lakeSizeZ: 2.0,
});

// === Debug-only panel (only mounted when debug mode is active) ===
function LakeDebugPanel({ onChange }) {
  const values = useControls("Lake", {
    Transform: folder({
      lakePosX: { value: LAKE_DEFAULTS.lakePosX, min: -20, max: 20, step: 0.01 },
      lakePosY: { value: LAKE_DEFAULTS.lakePosY, min: -10, max: 10, step: 0.01 },
      lakePosZ: { value: LAKE_DEFAULTS.lakePosZ, min: -20, max: 20, step: 0.01 },
    }),
    Size: folder({
      lakeSizeX: {
        value: LAKE_DEFAULTS.lakeSizeX,
        min: 0.25,
        max: 10,
        step: 0.01,
        label: "Size X",
      },
      lakeSizeZ: {
        value: LAKE_DEFAULTS.lakeSizeZ,
        min: 0.25,
        max: 10,
        step: 0.01,
        label: "Size Z",
      },
    }),
  });

  useEffect(() => {
    onChange(values);
  }, [values.lakePosX, values.lakePosY, values.lakePosZ, values.lakeSizeX, values.lakeSizeZ]);

  return null;
}

const FakeLake = forwardRef(function FakeLake(
  {
    position = [-2, 0.0, -2],
    rotation = [Math.PI * 0.5, 0, 0],
    resolution = 140,
  },
  ref
) {
  const meshRef = useRef();

  // === Debug mode gating ===
  const isDebugMode = useDebugStore((s) => s.isDebugMode);
  const [debugValues, setDebugValues] = useState(null);

  useEffect(() => {
    if (!isDebugMode) setDebugValues(null);
  }, [isDebugMode]);

  const activeVals = debugValues ?? LAKE_DEFAULTS;
  const { lakePosX, lakePosY, lakePosZ, lakeSizeX, lakeSizeZ } = activeVals;

  // === Simple gray material ===
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0x808080, // Gray color
        side: THREE.DoubleSide,
      }),
    []
  );

  // === Geometry (same as Lake) ===
  const geom = useMemo(
    () => new THREE.PlaneGeometry(1, 1, resolution, resolution),
    [resolution]
  );

  const lakePosition = useMemo(
    () => [lakePosX, lakePosY, lakePosZ],
    [lakePosX, lakePosY, lakePosZ]
  );
  const lakeScale = useMemo(
    () => [lakeSizeX, lakeSizeZ, 1],
    [lakeSizeX, lakeSizeZ]
  );

  // === Ref API: footprint (same as Lake) ===
  useImperativeHandle(ref, () => ({
    getFootprint: (extraMargin = 0.45) => {
      const m = meshRef.current;
      if (!m) return null;

      const corners = [
        new THREE.Vector3(-0.5, -0.5, 0.0),
        new THREE.Vector3(0.5, -0.5, 0.0),
        new THREE.Vector3(0.5, 0.5, 0.0),
        new THREE.Vector3(-0.5, 0.5, 0.0),
      ].map((c) => c.clone().applyMatrix4(m.matrixWorld));

      let minX = +Infinity,
        maxX = -Infinity,
        minZ = +Infinity,
        maxZ = -Infinity;
      for (const p of corners) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const centerX = (minX + maxX) * 0.5,
        centerZ = (minZ + maxZ) * 0.5;
      const worldWidth = maxX - minX,
        worldDepth = maxZ - minZ;
      const sx = Math.max(1e-6, lakeSizeX),
        sz = Math.max(1e-6, lakeSizeZ);
      return {
        centerX,
        centerZ,
        width: worldWidth / sx + 2 * extraMargin,
        depth: worldDepth / sz + 2 * extraMargin,
      };
    },
  }));

  return (
    <group position={lakePosition} rotation={rotation} scale={lakeScale}>
      <mesh ref={meshRef} geometry={geom} material={material} frustumCulled renderOrder={10} />
      {isDebugMode && <LakeDebugPanel onChange={setDebugValues} />}
    </group>
  );
});

export default FakeLake;
