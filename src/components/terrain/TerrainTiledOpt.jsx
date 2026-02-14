// src/components/terrain/TerrainTiledOpt.jsx
// Optimized terrain tiling system:
//   - Worker-primary CPU displacement (no per-frame GPU noise)
//   - Single shared material (1 shader compilation, not N)
//   - Frustum culling enabled (exact bounds from worker)
//   - Distance-sorted build queue (closest tiles first)
//   - Keeps: hysteresis, pooling, budget, cooldown, prefetch from TerrainTiled

import React, {
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useInfiniteTiles } from "../../hooks/useInfiniteTiles";
import { emitDistanceFadeTileReady } from "../../utils/distanceFadeEvents";
import {
  heightAt as defaultHeightSampler,
  getTerrainParams,
} from "../../proc/heightfield";
import { usePerformanceMonitor } from "../../utils/usePerformanceMonitor";
import performanceMonitor from "../../utils/performanceMonitor";
import { createTerrainOptMaterial } from "./TerrainTiledOptMaterial";

const TerrainTiledOpt = forwardRef(function TerrainTiledOpt(
  {
    sampleHeight,
    tileSize = 4,
    anchorMinX = -10,
    anchorMinZ = -10,
    loadRadius = 2,
    dropRadius = 2,
    prefetch = 1,
    resolution = 4,
    materialFactory,
    unloadCooldownMs = 2000,
    buildBudgetMs = 4,
    maxConcurrentJobs = 2,
  },
  ref
) {
  if (typeof sampleHeight !== "function") {
    throw new Error("<TerrainTiledOpt> needs sampleHeight(x,z).");
  }

  const { markStart, markEnd } = usePerformanceMonitor("TerrainTiledOpt");
  const { camera } = useThree();

  const groupRef = useRef();
  useImperativeHandle(ref, () => groupRef.current, []);

  const tiles = useRef(new Map());
  const buildQueue = useRef([]);
  const workerRef = useRef(null);
  const pendingWorkerJobsRef = useRef(new Map());
  const workerFailedRef = useRef(false);
  const workerErrorCountRef = useRef(0);
  const firstTileStartedRef = useRef(false);
  const firstTileDoneRef = useRef(false);

  const { required, retention, math } = useInfiniteTiles({
    tileSize,
    anchorMinX,
    anchorMinZ,
    loadRadius,
    dropRadius,
    prefetch,
  });

  // Single shared material — no cloning, no per-tile uniforms
  const sharedMaterial = useMemo(() => {
    if (materialFactory) {
      const mat = materialFactory();
      if (mat?.isMaterial) return mat;
    }
    return createTerrainOptMaterial();
  }, [materialFactory]);

  const geometryPoolRef = useRef([]);
  useEffect(() => {
    const pool = geometryPoolRef.current;
    pool.forEach((geom) => geom.dispose());
    geometryPoolRef.current = [];
    return () => {
      geometryPoolRef.current.forEach((geom) => geom.dispose());
      geometryPoolRef.current = [];
    };
  }, [resolution]);

  useEffect(() => {
    if (!firstTileStartedRef.current) {
      firstTileStartedRef.current = true;
      markStart("first-tile");
    }
  }, [markStart]);

  // ─── Geometry pool ────────────────────────────────────────────────
  const acquireGeometry = () => {
    const seg = Math.max(2, resolution | 0);
    const vertsX = seg + 1;
    const vertsZ = seg + 1;

    const pool = geometryPoolRef.current;
    while (pool.length > 0) {
      const geom = pool.pop();
      if (geom?.userData?._poolMeta?.seg === seg) {
        return geom;
      }
      if (geom) geom.dispose();
    }

    // Create geometry with zeroed positions (worker will fill them)
    const geom = new THREE.BufferGeometry();
    const vertexCount = vertsX * vertsZ;

    const pos = new Float32Array(vertexCount * 3);
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    const norm = new Float32Array(vertexCount * 3);
    for (let i = 1; i < norm.length; i += 3) norm[i] = 1; // default up
    geom.setAttribute("normal", new THREE.BufferAttribute(norm, 3));

    const indexCount = seg * seg * 6;
    const idx =
      vertexCount < 65536
        ? new Uint16Array(indexCount)
        : new Uint32Array(indexCount);
    let t = 0;
    for (let z = 0; z < seg; z++) {
      for (let x = 0; x < seg; x++) {
        const i0 = z * vertsX + x;
        const i1 = i0 + 1;
        const i2 = i0 + vertsX;
        const i3 = i2 + 1;
        idx[t++] = i0;
        idx[t++] = i2;
        idx[t++] = i1;
        idx[t++] = i1;
        idx[t++] = i2;
        idx[t++] = i3;
      }
    }
    geom.setIndex(new THREE.BufferAttribute(idx, 1));
    geom.userData._poolMeta = { vertsX, vertsZ, seg };
    return geom;
  };

  const releaseGeometry = (geom) => {
    if (!geom) return;
    geometryPoolRef.current.push(geom);
  };

  // ─── Mount tile mesh (shared material, frustum culling ON) ────────
  const mountTileMesh = (rec, geom) => {
    // Geometry already has world-space positions and exact bounds from worker
    const mesh = new THREE.Mesh(geom, sharedMaterial);
    mesh.frustumCulled = true;
    mesh.visible = true;

    groupRef.current?.add(mesh);
    rec.mesh = mesh;
    rec.state = "ready";
    rec.lastTouched = performance.now();
    emitDistanceFadeTileReady({ mesh, key: rec.key });

    if (!firstTileDoneRef.current) {
      firstTileDoneRef.current = true;
      markEnd("first-tile");
    }
  };

  // ─── Flush pending worker jobs back to queue ──────────────────────
  function flushPendingWorkerJobs() {
    if (!pendingWorkerJobsRef.current.size) return;
    const pending = Array.from(pendingWorkerJobsRef.current.values());
    pendingWorkerJobsRef.current.clear();
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      buildQueue.current.unshift(pending[i]);
    }
  }

  // ─── Main-thread fallback: CPU tile generation ────────────────────
  const buildTileOnMainThread = (ix, iz, boundsOverride) => {
    const bounds = boundsOverride ?? math.tileBounds(ix, iz);
    const { minX, minZ, maxX, maxZ } = bounds;
    const seg = Math.max(2, resolution | 0);
    const vertsX = seg + 1;
    const vertsZ = seg + 1;
    const dx = (maxX - minX) / seg;
    const dz = (maxZ - minZ) / seg;

    const geom = acquireGeometry();
    const posArr = geom.attributes.position.array;
    const normArr = geom.attributes.normal.array;

    // First pass: positions + track Y range
    const heights = new Float32Array(vertsX * vertsZ);
    let cursor = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let z = 0; z < vertsZ; z++) {
      const wz = minZ + z * dz;
      for (let x = 0; x < vertsX; x++) {
        const wx = minX + x * dx;
        const wy = sampleHeight(wx, wz);
        heights[z * vertsX + x] = wy;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
        posArr[cursor++] = wx;
        posArr[cursor++] = wy;
        posArr[cursor++] = wz;
      }
    }

    // Second pass: finite-difference normals
    for (let z = 0; z < vertsZ; z++) {
      for (let x = 0; x < vertsX; x++) {
        const idx = z * vertsX + x;
        let ddx, ddz;
        if (x === 0) {
          ddx = (heights[idx + 1] - heights[idx]) / dx;
        } else if (x === vertsX - 1) {
          ddx = (heights[idx] - heights[idx - 1]) / dx;
        } else {
          ddx = (heights[idx + 1] - heights[idx - 1]) / (2 * dx);
        }
        if (z === 0) {
          ddz = (heights[(z + 1) * vertsX + x] - heights[idx]) / dz;
        } else if (z === vertsZ - 1) {
          ddz = (heights[idx] - heights[(z - 1) * vertsX + x]) / dz;
        } else {
          ddz = (heights[(z + 1) * vertsX + x] - heights[(z - 1) * vertsX + x]) / (2 * dz);
        }
        const nx = -ddx;
        const ny = 1;
        const nz = -ddz;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const inv = len > 0 ? 1 / len : 1;
        const ni = idx * 3;
        normArr[ni] = nx * inv;
        normArr[ni + 1] = ny * inv;
        normArr[ni + 2] = nz * inv;
      }
    }

    geom.attributes.position.needsUpdate = true;
    geom.attributes.normal.needsUpdate = true;

    // Exact bounding volumes
    const box = geom.boundingBox || new THREE.Box3();
    box.min.set(minX, minY, minZ);
    box.max.set(maxX, maxY, maxZ);
    geom.boundingBox = box;

    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const dxB = maxX - minX;
    const dyB = maxY - minY;
    const dzB = maxZ - minZ;
    const radius = Math.sqrt(dxB * dxB + dyB * dyB + dzB * dzB) * 0.5;
    const sphere = geom.boundingSphere || new THREE.Sphere();
    sphere.center.set(cx, cy, cz);
    sphere.radius = radius;
    geom.boundingSphere = sphere;

    return geom;
  };

  // ─── Worker setup (primary path) ──────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.Worker === "undefined") {
      workerFailedRef.current = true;
      return;
    }

    workerFailedRef.current = false;
    workerErrorCountRef.current = 0;

    let worker;
    const t0 = performance.now();
    try {
      worker = new Worker(
        new URL("../../workers/terrainTileWorker.js", import.meta.url),
        { type: "module" }
      );
    } catch (err) {
      console.warn("TerrainTiledOpt: failed to initialize worker", err);
      workerFailedRef.current = true;
      return;
    }

    workerRef.current = worker;
    performanceMonitor.markSystemInit("terrain-opt-worker", performance.now() - t0);

    const handleMessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "build-complete") {
        if (typeof data.key !== "string") {
          workerErrorCountRef.current += 1;
          return;
        }
        const job = pendingWorkerJobsRef.current.get(data.key);
        pendingWorkerJobsRef.current.delete(data.key);
        if (!job) return;

        if (!data.positions || !data.normals) {
          workerErrorCountRef.current += 1;
          buildQueue.current.unshift(job);
          return;
        }

        const geom = acquireGeometry();
        const targetPos = geom.attributes.position.array;
        const targetNorm = geom.attributes.normal.array;
        const incomingPos = new Float32Array(data.positions);
        const incomingNorm = new Float32Array(data.normals);

        if (
          targetPos.length !== incomingPos.length ||
          targetNorm.length !== incomingNorm.length
        ) {
          releaseGeometry(geom);
          workerErrorCountRef.current += 1;
          buildQueue.current.unshift(job);
          return;
        }

        targetPos.set(incomingPos);
        targetNorm.set(incomingNorm);
        geom.attributes.position.needsUpdate = true;
        geom.attributes.normal.needsUpdate = true;

        // Set exact bounding volumes from worker
        if (data.boundingBox) {
          const box = geom.boundingBox || new THREE.Box3();
          box.min.set(data.boundingBox.minX, data.boundingBox.minY, data.boundingBox.minZ);
          box.max.set(data.boundingBox.maxX, data.boundingBox.maxY, data.boundingBox.maxZ);
          geom.boundingBox = box;
        }
        if (data.boundingSphere) {
          const sphere = geom.boundingSphere || new THREE.Sphere();
          sphere.center.set(
            data.boundingSphere.center.x,
            data.boundingSphere.center.y,
            data.boundingSphere.center.z
          );
          sphere.radius = data.boundingSphere.radius;
          geom.boundingSphere = sphere;
        }

        const rec = tiles.current.get(data.key);
        if (!rec || rec.state !== "building") {
          releaseGeometry(geom);
          return;
        }
        mountTileMesh(rec, geom);

      } else if (data.type === "build-error") {
        if (typeof data.key !== "string") {
          workerErrorCountRef.current += 1;
          return;
        }
        workerErrorCountRef.current += 1;
        const job = pendingWorkerJobsRef.current.get(data.key);
        pendingWorkerJobsRef.current.delete(data.key);
        if (job) {
          buildQueue.current.unshift(job);
        }
        if (workerErrorCountRef.current >= 3) {
          workerFailedRef.current = true;
          worker.removeEventListener("message", handleMessage);
          workerRef.current?.terminate?.();
          workerRef.current = null;
          flushPendingWorkerJobs();
        }
      }
    };

    worker.addEventListener("message", handleMessage);
    worker.postMessage({ type: "sync-params", payload: getTerrainParams() });

    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.terminate();
      workerRef.current = null;
      flushPendingWorkerJobs();
    };
  }, []); // Worker always initialized — no canUseWorker conditional

  // ─── Enqueue required tiles (distance-sorted) ────────────────────
  useEffect(() => {
    const newJobs = [];

    required.forEach((key) => {
      if (typeof key !== "string") return;
      if (tiles.current.has(key)) return;
      const [ix, iz] = math.parse(key);
      const bounds = math.tileBounds(ix, iz);
      newJobs.push({ key, ix, iz, bounds, enqueuedAt: performance.now() });
      tiles.current.set(key, {
        state: "queued",
        ix,
        iz,
        key,
        lastTouched: performance.now(),
        mesh: null,
      });
    });

    // Distance-sort: closest tiles first
    if (newJobs.length > 1) {
      const camX = camera.position.x;
      const camZ = camera.position.z;
      newJobs.sort((a, b) => {
        const ax = (a.bounds.minX + a.bounds.maxX) * 0.5;
        const az = (a.bounds.minZ + a.bounds.maxZ) * 0.5;
        const bx = (b.bounds.minX + b.bounds.maxX) * 0.5;
        const bz = (b.bounds.minZ + b.bounds.maxZ) * 0.5;
        return (
          (ax - camX) * (ax - camX) + (az - camZ) * (az - camZ) -
          ((bx - camX) * (bx - camX) + (bz - camZ) * (bz - camZ))
        );
      });
    }

    for (const job of newJobs) {
      buildQueue.current.push(job);
    }

    // Mark removals outside retention
    tiles.current.forEach((rec) => {
      if (!retention.has(rec.key)) {
        rec.markedForRemovalAt ??= performance.now();
      } else {
        rec.markedForRemovalAt = undefined;
        rec.lastTouched = performance.now();
      }
    });
  }, [required, retention, math, camera]);

  // ─── Build/remove cadence (budgeted dispatch) ─────────────────────
  useFrame(() => {
    const frameStart = performance.now();
    const now = frameStart;

    // Remove expired tiles
    tiles.current.forEach((rec) => {
      if (
        rec.markedForRemovalAt &&
        now - rec.markedForRemovalAt >= unloadCooldownMs
      ) {
        if (rec.mesh) {
          groupRef.current?.remove(rec.mesh);
          releaseGeometry(rec.mesh.geometry);
          // Do NOT dispose material — it's shared
          rec.mesh.geometry = null;
          rec.mesh.material = null;
        }
        pendingWorkerJobsRef.current.delete(rec.key);
        tiles.current.delete(rec.key);
      }
    });

    // Build tiles until budget exhausted
    const q = buildQueue.current;
    if (!q.length) return;

    const budget = buildBudgetMs ?? 4;
    const unlimited = budget <= 0;
    const workerReady =
      !workerFailedRef.current &&
      !!workerRef.current &&
      typeof workerRef.current.postMessage === "function";

    while (q.length && (unlimited || performance.now() - frameStart < budget)) {
      const job = q.shift();
      if (!job) break;
      if (typeof job.key !== "string") continue;

      const rec = tiles.current.get(job.key);
      if (!rec || rec.state !== "queued") continue;

      if (workerReady) {
        if (pendingWorkerJobsRef.current.size >= maxConcurrentJobs) {
          q.unshift(job);
          break;
        }

        rec.state = "building";
        rec.lastTouched = performance.now();
        pendingWorkerJobsRef.current.set(rec.key, job);
        workerRef.current.postMessage({
          type: "build",
          payload: {
            key: rec.key,
            ix: rec.ix,
            iz: rec.iz,
            resolution,
            minX: job.bounds.minX,
            minZ: job.bounds.minZ,
            maxX: job.bounds.maxX,
            maxZ: job.bounds.maxZ,
          },
        });
        continue;
      }

      // Main-thread fallback (worker failed)
      rec.state = "building";
      const geom = buildTileOnMainThread(rec.ix, rec.iz, job.bounds);
      mountTileMesh(rec, geom);
    }
  });

  return <group ref={groupRef} name="TerrainTiledOpt" />;
});

export default TerrainTiledOpt;
