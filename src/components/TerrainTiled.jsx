// src/components/TerrainTiled.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useInfiniteTiles } from "../hooks/useInfiniteTiles";
import { emitDistanceFadeTileReady } from "../utils/distanceFadeEvents";
import {
  heightAt as defaultHeightSampler,
  getTerrainParams,
} from "../proc/heightfield";
import { usePerformanceMonitor } from "../utils/usePerformanceMonitor";
import performanceMonitor from "../utils/performanceMonitor";

/**
 * TerrainTiled — forwardRef so other systems (Forest/Fog) can raycast recursively.
 * Each tile geometry gets a BVH if available (three-mesh-bvh) for fast raycasts.
 */
const TerrainTiled = forwardRef(function TerrainTiled(
  {
    sampleHeight, // REQUIRED function (x,z) -> y
    tileSize = 4,
    anchorMinX = -10,
    anchorMinZ = -10,
    loadRadius = 2,
    dropRadius = 3,
    prefetch = 1,
    resolution = 14,
    materialFactory,
    unloadCooldownMs = 2000,
    buildBudgetMs = 4,
    maxConcurrentJobs = 2,
  },
  ref
) {
  if (typeof sampleHeight !== "function") {
    throw new Error("<TerrainTiled> needs sampleHeight(x,z).");
  }

  const { markStart, markEnd } = usePerformanceMonitor("TerrainTiled");

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

  const canUseWorker = useMemo(() => {
    if (typeof window === "undefined" || typeof window.Worker === "undefined") {
      return false;
    }
    return sampleHeight === defaultHeightSampler;
  }, [sampleHeight]);

  const { required, retention, math } = useInfiniteTiles({
    tileSize,
    anchorMinX,
    anchorMinZ,
    loadRadius,
    dropRadius,
    prefetch,
  });

  const sharedMaterial = useMemo(() => {
    if (materialFactory) {
      const mat = materialFactory();
      if (mat?.isMaterial) return mat;
    }
    return new THREE.MeshStandardMaterial({
      color: "#0a0a0a",
      roughness: 1,
      metalness: 0,
    });
  }, [materialFactory]);

  const heightCacheRef = useRef(new Map());
  useEffect(() => {
    heightCacheRef.current.clear();
  }, [sampleHeight, tileSize, resolution]);

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

  useEffect(() => {
    if (!canUseWorker) {
      workerRef.current?.terminate?.();
      workerRef.current = null;
      flushPendingWorkerJobs();
      workerFailedRef.current = !canUseWorker;
      return;
    }

    workerFailedRef.current = false;
    workerErrorCountRef.current = 0;

    let worker;
    const t0 = performance.now();
    try {
      worker = new Worker(
        new URL("../workers/terrainTileWorker.js", import.meta.url),
        { type: "module" }
      );
    } catch (err) {
      console.warn("TerrainTiled: failed to initialize worker", err);
      workerFailedRef.current = true;
      return;
    }

    workerRef.current = worker;
    performanceMonitor.markSystemInit("terrain-worker", performance.now() - t0);

    const handleMessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "build-complete") {
        const job = pendingWorkerJobsRef.current.get(data.key);
        pendingWorkerJobsRef.current.delete(data.key);
        if (!job) return;
        if (!data.positions) {
          workerErrorCountRef.current += 1;
          buildQueue.current.unshift(job);
          return;
        }
        const geom = acquireGeometry();
        const target = geom.attributes.position.array;
        const incoming = new Float32Array(data.positions);
        if (target.length !== incoming.length) {
          releaseGeometry(geom);
          workerErrorCountRef.current += 1;
          buildQueue.current.unshift(job);
          return;
        }
        target.set(incoming);
        geom.attributes.position.needsUpdate = true;
        const rec = tiles.current.get(data.key);
        if (!rec || rec.state !== "building") {
          releaseGeometry(geom);
          return;
        }
        mountTileMesh(rec, geom);
      } else if (data.type === "build-error") {
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
  }, [canUseWorker]);

  const precisionFactor = 1e5;
  const sampleHeightCached = (x, z) => {
    const keyX = Math.round(x * precisionFactor);
    const keyZ = Math.round(z * precisionFactor);
    const key = keyX + ":" + keyZ;
    const cache = heightCacheRef.current;
    if (cache.has(key)) return cache.get(key);
    const value = sampleHeight(x, z);
    cache.set(key, value);
    return value;
  };

  const acquireGeometry = () => {
    const pool = geometryPoolRef.current;
    if (pool.length) return pool.pop();

    const seg = Math.max(2, resolution | 0);
    const vertsX = seg + 1;
    const vertsZ = seg + 1;

    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(vertsX * vertsZ * 3);
    const posAttr = new THREE.BufferAttribute(pos, 3);
    geom.setAttribute("position", posAttr);

    const idx = new Uint32Array(seg * seg * 6);
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
    geom.userData._poolMeta = { vertsX, vertsZ };
    return geom;
  };

  const releaseGeometry = (geom) => {
    if (!geom) return;
    geometryPoolRef.current.push(geom);
  };

  const mountTileMesh = (rec, geom) => {
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    const mesh = new THREE.Mesh(geom, sharedMaterial);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    mesh.visible = false; // stay hidden until DistanceFade patches fade logic

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

  const flushPendingWorkerJobs = () => {
    if (!pendingWorkerJobsRef.current.size) return;
    const pending = Array.from(pendingWorkerJobsRef.current.values());
    pendingWorkerJobsRef.current.clear();
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      buildQueue.current.unshift(pending[i]);
    }
  };

  const buildTileGeometry = (ix, iz, boundsOverride) => {
    const { minX, minZ, maxX, maxZ } =
      boundsOverride ?? math.tileBounds(ix, iz);
    const seg = Math.max(2, resolution | 0);
    const geom = acquireGeometry();
    const { vertsX, vertsZ } = geom.userData._poolMeta;

    const pos = geom.attributes.position.array;
    const dx = (maxX - minX) / seg;
    const dz = (maxZ - minZ) / seg;

    let p = 0;
    for (let z = 0; z < vertsZ; z++) {
      const wz = minZ + z * dz;
      for (let x = 0; x < vertsX; x++) {
        const wx = minX + x * dx;
        const wy = sampleHeightCached(wx, wz);
        pos[p++] = wx;
        pos[p++] = wy;
        pos[p++] = wz;
      }
    }

    geom.attributes.position.needsUpdate = true;
    return geom;
  };

  useEffect(() => {
    // Enqueue newly required tiles
    required.forEach((key) => {
      if (tiles.current.has(key)) return;
      const [ix, iz] = math.parse(key);
      const bounds = math.tileBounds(ix, iz);
      buildQueue.current.push({
        key,
        ix,
        iz,
        bounds,
        enqueuedAt: performance.now(),
      });
      tiles.current.set(key, {
        state: "queued",
        ix,
        iz,
        key,
        lastTouched: performance.now(),
        mesh: null,
      });
    });

    // Mark removals outside retention
    tiles.current.forEach((rec) => {
      if (!retention.has(rec.key)) {
        rec.markedForRemovalAt ??= performance.now();
      } else {
        rec.markedForRemovalAt = undefined;
        rec.lastTouched = performance.now();
      }
    });
  }, [required, retention, math]);

  // Build/remove cadence (budgeted dispatch + async worker builds)
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
          rec.mesh.geometry = null;
        }
        pendingWorkerJobsRef.current.delete(rec.key);
        tiles.current.delete(rec.key);
      }
    });

    // Build tiles until the frame budget is exhausted
    const q = buildQueue.current;
    if (!q.length) return;

    const budget = buildBudgetMs ?? 4;
    const unlimited = budget <= 0;
    const workerReady =
      canUseWorker &&
      !workerFailedRef.current &&
      !!workerRef.current &&
      typeof workerRef.current.postMessage === "function";

    while (q.length && (unlimited || performance.now() - frameStart < budget)) {
      const job = q.shift();
      if (!job) break;
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

      rec.state = "building";
      const geom = buildTileGeometry(rec.ix, rec.iz, job.bounds);
      mountTileMesh(rec, geom);
    }
  });

  return <group ref={groupRef} name="TerrainTiled" />;
});

export default TerrainTiled;
