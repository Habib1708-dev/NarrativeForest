// src/components/FakeLake.jsx
// Simple static gray plane for performance testing - replaces Lake component
// Maintains same API (getFootprint) and dimensions for exclusion zone compatibility
import React, {
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useControls, folder } from "leva";

const FakeLake = forwardRef(function FakeLake(
  {
    position = [-2, 0.0, -2],
    rotation = [Math.PI * 0.5, 0, 0],
    resolution = 140,
  },
  ref
) {
  const meshRef = useRef();

  // === Controls (same as Lake for compatibility) ===
  const {
    lakePosX,
    lakePosY,
    lakePosZ,
    lakeSizeX,
    lakeSizeZ,
  } = useControls("Lake", {
    Transform: folder({
      lakePosX: { value: -1.8, min: -20, max: 20, step: 0.01 },
      lakePosY: { value: -4.79, min: -10, max: 10, step: 0.01 },
      lakePosZ: { value: -2.8, min: -20, max: 20, step: 0.01 },
    }),
    Size: folder({
      lakeSizeX: {
        value: 2.0,
        min: 0.25,
        max: 10,
        step: 0.01,
        label: "Size X",
      },
      lakeSizeZ: {
        value: 2.0,
        min: 0.25,
        max: 10,
        step: 0.01,
        label: "Size Z",
      },
    }),
  });

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
    </group>
  );
});

export default FakeLake;
