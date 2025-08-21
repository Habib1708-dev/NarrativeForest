import React, { useMemo } from "react";
import * as THREE from "three";
import FogParticles from "./FogParticles";

/**
 * FogParticleSystem
 * - Builds fog puff world positions once per terrain geometry + cell size.
 * - World-space grid over terrain world AABB (XZ), raycast down for Y.
 * - No setState here; purely derived -> renders FogParticles.
 */
export default function FogParticleSystem({
  terrainMesh,
  cellSize = 2,
  includeEdges = true,
}) {
  // A stable key that only changes when the underlying geometry instance changes
  const geomKey = terrainMesh?.geometry?.uuid;

  const positions = useMemo(() => {
    if (!terrainMesh || !terrainMesh.geometry) return [];

    terrainMesh.updateWorldMatrix(true, false);

    const worldBB = new THREE.Box3().setFromObject(terrainMesh);
    if (!worldBB) return [];

    const minX = worldBB.min.x;
    const maxX = worldBB.max.x;
    const minZ = worldBB.min.z;
    const maxZ = worldBB.max.z;
    const maxY = worldBB.max.y;

    const sizeX = Math.max(0.0001, maxX - minX);
    const sizeZ = Math.max(0.0001, maxZ - minZ);

    const nx = Math.max(1, Math.floor(sizeX / cellSize));
    const nz = Math.max(1, Math.floor(sizeZ / cellSize));

    const raycaster = new THREE.Raycaster();
    // If three-mesh-bvh is installed and terrain did geometry.computeBoundsTree(),
    // firstHitOnly will use the BVH accelerated path:
    raycaster.firstHitOnly = true;
    const down = new THREE.Vector3(0, -1, 0);

    const castAtXZ = (wx, wz, out) => {
      const origin = new THREE.Vector3(wx, maxY + 5, wz);
      raycaster.set(origin, down);
      const hit = raycaster.intersectObject(terrainMesh, false)[0];
      if (hit) out.push([hit.point.x, hit.point.y, hit.point.z]);
    };

    const pts = [];

    // Cell centers
    for (let ix = 0; ix < nx; ix++) {
      const cx = minX + (ix + 0.5) * cellSize;
      for (let iz = 0; iz < nz; iz++) {
        const cz = minZ + (iz + 0.5) * cellSize;
        castAtXZ(cx, cz, pts);
      }
    }

    if (includeEdges) {
      // Vertical edges (x fixed)
      for (let k = 0; k <= nx; k++) {
        const gx = minX + k * cellSize;
        for (let iz = 0; iz < nz; iz++) {
          const gz = minZ + (iz + 0.5) * cellSize;
          castAtXZ(gx, gz, pts);
        }
      }
      // Horizontal edges (z fixed)
      for (let l = 0; l <= nz; l++) {
        const gz = minZ + l * cellSize;
        for (let ix = 0; ix < nx; ix++) {
          const gx = minX + (ix + 0.5) * cellSize;
          castAtXZ(gx, gz, pts);
        }
      }
    }

    return pts;
  }, [terrainMesh, geomKey, cellSize, includeEdges]);

  if (!terrainMesh || positions.length === 0) return null;

  return (
    <FogParticles
      count={positions.length}
      positions={positions}
      occluder={terrainMesh}
    />
  );
}
