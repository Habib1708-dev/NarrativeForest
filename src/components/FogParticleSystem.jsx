// src/components/FogParticleSystem.jsx
import React, { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import FogParticles from "./FogParticles";

/**
 * FogParticleSystem (cell-culling version)
 * - Bakes points once, buckets by grid cell, and only shows camera cell + neighbors.
 * - For depth prepass, forwards explicit `occluders` (Object3D or refs) to FogParticles.
 */
export default function FogParticleSystem({
  terrainMesh,
  occluders = [],
  cellSize = 2,
  includeEdges = true,
  visibleRadiusCells = 1,
  fogParams,
}) {
  const { camera } = useThree();

  // Stable key to rebuild baked data only when geometry instance changes.
  const geomKey = terrainMesh?.geometry?.uuid;

  const baked = useMemo(() => {
    if (!terrainMesh || !terrainMesh.geometry) return null;

    terrainMesh.updateWorldMatrix(true, false);

    const worldBB = new THREE.Box3().setFromObject(terrainMesh);
    if (!worldBB || !isFinite(worldBB.min.x)) return null;

    const minX = worldBB.min.x;
    const maxX = worldBB.max.x;
    const minZ = worldBB.min.z;
    const maxZ = worldBB.max.z;
    const maxY = worldBB.max.y;

    const sizeX = Math.max(0.0001, maxX - minX);
    const sizeZ = Math.max(0.0001, maxZ - minZ);

    const nx = Math.max(1, Math.floor(sizeX / cellSize));
    const nz = Math.max(1, Math.floor(sizeZ / cellSize));

    const clampIX = (ix) => Math.min(nx - 1, Math.max(0, ix));
    const clampIZ = (iz) => Math.min(nz - 1, Math.max(0, iz));
    const toKey = (ix, iz) => `${ix},${iz}`;

    // Accelerated raycaster (BVH if available)
    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    const down = new THREE.Vector3(0, -1, 0);

    const castAtXZ = (wx, wz) => {
      const origin = new THREE.Vector3(wx, maxY + 5, wz);
      raycaster.set(origin, down);
      const hit = raycaster.intersectObject(terrainMesh, false)[0];
      return hit ? hit.point : null;
    };

    const cells = new Map();
    const addPointToCell = (p) => {
      const ix = clampIX(Math.floor((p.x - minX) / cellSize));
      const iz = clampIZ(Math.floor((p.z - minZ) / cellSize));
      const key = toKey(ix, iz);
      let arr = cells.get(key);
      if (!arr) {
        arr = [];
        cells.set(key, arr);
      }
      arr.push([p.x, p.y, p.z]);
    };

    // centers
    for (let ix = 0; ix < nx; ix++) {
      const cx = minX + (ix + 0.5) * cellSize;
      for (let iz = 0; iz < nz; iz++) {
        const cz = minZ + (iz + 0.5) * cellSize;
        const p = castAtXZ(cx, cz);
        if (p) addPointToCell(p);
      }
    }

    if (includeEdges) {
      // verticals
      for (let k = 0; k <= nx; k++) {
        const gx = minX + k * cellSize;
        for (let iz = 0; iz < nz; iz++) {
          const gz = minZ + (iz + 0.5) * cellSize;
          const p = castAtXZ(gx, gz);
          if (p) addPointToCell(p);
        }
      }
      // horizontals
      for (let l = 0; l <= nz; l++) {
        const gz = minZ + l * cellSize;
        for (let ix = 0; ix < nx; ix++) {
          const gx = minX + (ix + 0.5) * cellSize;
          const p = castAtXZ(gx, gz);
          if (p) addPointToCell(p);
        }
      }
    }

    return {
      cells,
      grid: {
        minX,
        minZ,
        maxX,
        maxZ,
        nx,
        nz,
        cellSize,
        toKey,
        clampIX,
        clampIZ,
      },
    };
  }, [terrainMesh, geomKey, cellSize, includeEdges]);

  // Track which cell the camera is in; update only on boundary crossings
  const [activeCell, setActiveCell] = useState({ ix: -9999, iz: -9999 });
  const lastCellRef = useRef(activeCell);

  useFrame(() => {
    if (!baked) return;
    const { minX, minZ, cellSize, clampIX, clampIZ } = baked.grid;

    const ix = clampIX(Math.floor((camera.position.x - minX) / cellSize));
    const iz = clampIZ(Math.floor((camera.position.z - minZ) / cellSize));

    const last = lastCellRef.current;
    if (ix !== last.ix || iz !== last.iz) {
      lastCellRef.current = { ix, iz };
      setActiveCell({ ix, iz });
    }
  });

  // Visible positions
  const visiblePositions = useMemo(() => {
    if (!baked) return [];
    const { cells, grid } = baked;
    const { nx, nz, toKey } = grid;
    const { ix: cx, iz: cz } = activeCell;
    if (cx < 0 || cz < 0) return [];

    const out = [];
    for (let dz = -visibleRadiusCells; dz <= visibleRadiusCells; dz++) {
      for (let dx = -visibleRadiusCells; dx <= visibleRadiusCells; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
        const arr = cells.get(toKey(ix, iz));
        if (arr && arr.length) out.push(...arr);
      }
    }
    return out;
  }, [baked, activeCell, visibleRadiusCells]);

  if (!terrainMesh || !baked) return null;
  if (visiblePositions.length === 0) return null;

  return (
    <FogParticles
      count={visiblePositions.length}
      positions={visiblePositions}
      occluders={occluders}
      fogParams={fogParams}
    />
  );
}
