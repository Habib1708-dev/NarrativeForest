import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { makeTileMath, ringSet, addPrefetch, setDiff } from "../proc/tileMath";

// Reusable Vector3 to avoid per-call allocations
const _forward = new THREE.Vector3();

/**
 * Infinite grid indices with hysteresis + forward prefetch.
 */
export function useInfiniteTiles({
  tileSize = 4,
  anchorMinX = -10,
  anchorMinZ = -10,
  loadRadius = 2,
  dropRadius = 3,
  prefetch = 1,
  updateOn = "tile", // "tile" | "distance"
  moveThreshold = 0.25,
} = {}) {
  const { camera } = useThree();
  const math = useMemo(
    () => makeTileMath({ tileSize, anchorMinX, anchorMinZ }),
    [tileSize, anchorMinX, anchorMinZ]
  );

  const [currentTile, setCurrentTile] = useState([0, 0]);
  const [required, setRequired] = useState(() => new Set());
  const [retention, setRetention] = useState(() => new Set());

  const lastIxIz = useRef([Infinity, Infinity]);
  const lastPos = useRef({ x: Infinity, z: Infinity });

  const recompute = () => {
    const [ix, iz] = math.worldToTile(camera.position.x, camera.position.z);

    _forward.set(0, 0, 0);
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() > 0) _forward.normalize();

    const req0 = ringSet(ix, iz, loadRadius, math.key);
    const req =
      prefetch > 0
        ? addPrefetch(req0, ix, iz, _forward, [[loadRadius, prefetch]], math.key)
        : req0;
    const keep = ringSet(ix, iz, dropRadius, math.key);

    setCurrentTile([ix, iz]);
    setRequired(req);
    setRetention(keep);

    return { ix, iz };
  };

  useEffect(() => {
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileSize, anchorMinX, anchorMinZ, loadRadius, dropRadius, prefetch]);

  useFrame(() => {
    if (updateOn === "tile") {
      const [ix, iz] = math.worldToTile(camera.position.x, camera.position.z);
      const [lx, lz] = lastIxIz.current;
      if (ix !== lx || iz !== lz) {
        const r = recompute();
        lastIxIz.current = [r.ix, r.iz];
      }
    } else {
      const { x, z } = camera.position;
      const dx = x - lastPos.current.x;
      const dz = z - lastPos.current.z;
      if (dx * dx + dz * dz >= moveThreshold * moveThreshold) {
        recompute();
        lastPos.current = { x, z };
      }
    }
  });

  // Diffs if you ever need them
  const added = useMemo(
    () => setDiff(required, retention),
    [required, retention]
  );
  const removed = useMemo(
    () => setDiff(retention, required),
    [required, retention]
  );

  return { currentTile, required, retention, added, removed, math };
}
