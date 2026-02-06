import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import FogParticles from "./FogParticles";

/**
 * FogParticleSystem (tile-aware, camera-windowed)
 *
 * - Accepts a tiled terrain GROUP (or a single mesh). Raycasts recursively.
 * - Builds fog anchor points per "cell" around the camera using a rays-per-frame budget.
 * - Cells outside the view window are dropped after a cooldown (retentionSeconds).
 * - Rebuilds visible cells automatically if the terrain group's child count changes
 *   (i.e., tiles streamed in/out).
 * - Respects an optional axis-aligned exclusion rectangle on XZ (e.g. the Lake).
 *
 * Props:
 *   terrainGroup?: THREE.Object3D  // preferred (works with groups)
 *   terrainMesh?: THREE.Object3D   // backward-compat alias
 *   occluders?: (THREE.Object3D | React.RefObject)[]  // forwarded to FogParticles prepass
 *   fogParams?: object             // UFF-ish params passed to FogParticles
 *   cellSize?: number              // world meters per fog cell (default 2)
 *   visibleRadiusCells?: number    // how many cells to show around camera (default 2)
 *   prefetchCells?: number         // how many extra rings to prebuild beyond visible (default 1)
 *   raysPerFrame?: number          // build budget per frame (default 120)
 *   retentionSeconds?: number      // drop cells after leaving view for this long (default 2)
 *   samplesPerCell?: number        // how many sample rays per cell (default 5: center + 4 edges)
 *   exclusion?: { centerX, centerZ, width, depth } | null // optional "no fog" zone in XZ
 */
export default function FogParticleSystem({
  terrainGroup,
  terrainMesh, // keep backwards compatibility with older usage
  occluders = [],
  fogParams,
  cellSize = 2,
  visibleRadiusCells = 2,
  prefetchCells = 1,
  raysPerFrame = 120,
  retentionSeconds = 2.0,
  samplesPerCell = 5,
  exclusion = null,
}) {
  const group = terrainGroup || terrainMesh || null;
  const { camera } = useThree();

  // ======= BUILD / CACHE STRUCTURES =======
  const cacheRef = useRef(new Map()); // key -> { pts:[ [x,y,z], ... ], built:true, lastTouched:number }
  const buildQueueRef = useRef([]); // [{ key, ix, iz, enqueuedAt }]
  const dropTimesRef = useRef(new Map()); // key -> timestamp
  const modesRef = useRef({ viewSet: new Set(), visibleSet: new Set() }); // track current windows

  const raycasterRef = useRef(new THREE.Raycaster());
  raycasterRef.current.firstHitOnly = true;
  const down = useMemo(() => new THREE.Vector3(0, -1, 0), []);

  // Track camera cell to trigger recomputes only when crossing boundaries
  const lastCellRef = useRef({ ix: 1e9, iz: 1e9 });

  // A small, local "state version" to trigger render updates when positions change
  const [version, setVersion] = useState(0);

  // Detect terrain streaming (children count change) to rebuild visible cells
  const prevChildrenCountRef = useRef(-1);

  // Convenience
  const keyFor = (ix, iz) => `${ix},${iz}`;
  const parseKey = (key) => key.split(",").map((n) => parseInt(n, 10));

  const insideExclusion = (x, z) => {
    if (!exclusion) return false;
    const { centerX, centerZ, width, depth } = exclusion;
    return (
      Math.abs(x - centerX) <= width * 0.5 &&
      Math.abs(z - centerZ) <= depth * 0.5
    );
  };

  // ======= VIEW WINDOWS =======
  const computeWindows = (cx, cz) => {
    const visibleR = Math.max(0, visibleRadiusCells | 0);
    const buildR = Math.max(visibleR, visibleR + (prefetchCells | 0));

    const visibleSet = new Set();
    const viewSet = new Set(); // includes visible + prefetch
    for (let dz = -buildR; dz <= buildR; dz++) {
      for (let dx = -buildR; dx <= buildR; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        const k = keyFor(ix, iz);
        viewSet.add(k);
        if (Math.max(Math.abs(dx), Math.abs(dz)) <= visibleR) {
          visibleSet.add(k);
        }
      }
    }
    return { visibleSet, viewSet };
  };

  // ======= CELL BUILDER =======
  function buildCell(ix, iz, rayBudget, opts) {
    const { group, raycaster, samplesPerCell } = opts;

    // Terrain top bound for ray origin
    const bb = new THREE.Box3().setFromObject(group);
    const originY = (bb.max.y || 0) + 5;

    // Cell world bounds (anchored at world 0)
    const x0 = ix * cellSize;
    const z0 = iz * cellSize;
    const x1 = x0 + cellSize;
    const z1 = z0 + cellSize;

    // Sampling pattern: center + 4 edges (or fewer if samplesPerCell < 5)
    const pattern = [
      [0.5, 0.5], // center
      [0.0, 0.5],
      [1.0, 0.5],
      [0.5, 0.0],
      [0.5, 1.0],
    ];

    const count = Math.max(1, Math.min(samplesPerCell | 0, pattern.length));
    const pts = [];
    let raysUsed = 0;

    for (let i = 0; i < count && raysUsed < rayBudget; i++) {
      const [ux, uz] = pattern[i];
      const wx = THREE.MathUtils.lerp(x0, x1, ux);
      const wz = THREE.MathUtils.lerp(z0, z1, uz);

      if (insideExclusion(wx, wz)) continue; // skip frosting the lake etc.

      const origin = new THREE.Vector3(wx, originY, wz);
      raycaster.set(origin, down);
      const hit = raycaster.intersectObject(group, true)[0] || null;
      raysUsed++;
      if (!hit) continue;

      const y = hit.point.y;
      pts.push([wx, y, wz]);
    }

    return { pts, raysUsed };
  }

  // ======= UPDATE WINDOWS ON CAMERA CELL CHANGE =======
  useFrame(() => {
    if (!group) return;

    const cx = Math.floor(camera.position.x / cellSize);
    const cz = Math.floor(camera.position.z / cellSize);
    const last = lastCellRef.current;
    const childrenCount = group.children?.length ?? 0;

    const childrenChanged = childrenCount !== prevChildrenCountRef.current;
    if (childrenChanged) {
      prevChildrenCountRef.current = childrenCount;
    }

    // Recompute when crossing cell boundaries OR tiles changed
    if (cx === last.cx && cz === last.cz && !childrenChanged) return;
    lastCellRef.current = { cx, cz };

    const { visibleSet, viewSet } = computeWindows(cx, cz);
    modesRef.current = { visibleSet, viewSet };

    // Enqueue builds for any view cells missing in cache
    const now = performance.now();
    for (const k of viewSet) {
      if (!cacheRef.current.has(k)) {
        const [ix, iz] = parseKey(k);
        buildQueueRef.current.push({ key: k, ix, iz, enqueuedAt: now });
      }
      dropTimesRef.current.delete(k); // cancel pending drop if now in view
    }

    // Mark cells outside view for drop
    cacheRef.current.forEach((_, key) => {
      if (!viewSet.has(key)) dropTimesRef.current.set(key, now);
    });

    // If terrain changed, re-enqueue all *visible* cells to rebuild quickly
    if (childrenChanged) {
      const now2 = performance.now();
      for (const k of visibleSet) {
        const [ix, iz] = parseKey(k);
        cacheRef.current.delete(k);
        buildQueueRef.current.push({ key: k, ix, iz, enqueuedAt: now2 });
      }
    }

    // Trigger a render so FogParticles can update positions even if nothing built yet
    setVersion((v) => v + 1);
  });

  // ======= DROP OLD CELLS AFTER RETENTION =======
  useFrame(() => {
    if (dropTimesRef.current.size === 0) return;
    const now = performance.now();
    const cooldown = Math.max(0, retentionSeconds) * 1000.0;

    dropTimesRef.current.forEach((t0, key) => {
      if (now - t0 >= cooldown) {
        cacheRef.current.delete(key);
        dropTimesRef.current.delete(key);
      }
    });
  });

  // ======= BUILD CADENCE (RAY BUDGET) =======
  useFrame(() => {
    if (!group || buildQueueRef.current.length === 0) return;

    const raycaster = raycasterRef.current;
    let raysLeft = raysPerFrame | 0;
    let touched = false;

    while (raysLeft > 0 && buildQueueRef.current.length > 0) {
      const job = buildQueueRef.current.shift();
      if (cacheRef.current.has(job.key)) continue; // built already/race

      const result = buildCell(job.ix, job.iz, raysLeft, {
        group,
        raycaster,
        samplesPerCell,
      });

      raysLeft -= result.raysUsed;
      cacheRef.current.set(job.key, {
        pts: result.pts,
        built: true,
        lastTouched: performance.now(),
      });
      touched = true;
    }

    if (touched) setVersion((v) => v + 1); // positions changed
  });

  // ======= AGGREGATE VISIBLE POSITIONS =======
  const positions = useMemo(() => {
    const out = [];
    const visibleSet = modesRef.current.visibleSet;
    if (!visibleSet || visibleSet.size === 0) return out;

    visibleSet.forEach((key) => {
      const rec = cacheRef.current.get(key);
      if (!rec || !rec.pts || rec.pts.length === 0) return;
      out.push(...rec.pts);
    });
    return out;
    // depend on `version` so we re-aggregate after builds/drops/moves
  }, [version]);

  if (!group) return null;
  if (positions.length === 0) return null;

  return (
    <FogParticles
      count={positions.length}
      positions={positions}
      occluders={occluders}
      fogParams={fogParams}
    />
  );
}
