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
    dropRadius = 2,
    prefetch = 1,
    resolution = 2,
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
  }, [sampleHeight, tileSize, resolution, anchorMinX, anchorMinZ]);

  // Calculate lattice step size for cache key generation
  const latticeStep = useMemo(() => {
    const seg = Math.max(2, resolution | 0);
    return tileSize / seg;
  }, [tileSize, resolution]);

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
        // Ensure key is a string to prevent type mismatches
        if (typeof data.key !== "string") {
          console.error("TerrainTiled: received non-string key from worker", data.key);
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

        // Set bounding volumes directly from worker-computed values
        if (data.boundingBox) {
          const box = geom.boundingBox || new THREE.Box3();
          box.min.set(
            data.boundingBox.minX,
            data.boundingBox.minY,
            data.boundingBox.minZ
          );
          box.max.set(
            data.boundingBox.maxX,
            data.boundingBox.maxY,
            data.boundingBox.maxZ
          );
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
        // Ensure key is a string to prevent type mismatches
        if (typeof data.key !== "string") {
          console.error("TerrainTiled: received non-string key in error from worker", data.key);
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
  }, [canUseWorker]);

  // Convert world coordinates to lattice coordinates and pack into BigInt key
  const sampleHeightCached = (x, z) => {
    // Convert to lattice coordinates: ix = round((x - anchorMinX) / step)
    const ix = Math.round((x - anchorMinX) / latticeStep);
    const iz = Math.round((z - anchorMinZ) / latticeStep);
    
    // Pack two integers into BigInt to avoid collisions with large coordinates
    // Uses 32 bits for each coordinate, giving essentially no collision risk
    // BigInt is slower than number but avoids string allocations and guarantees correctness
    const key = (BigInt(ix) << 32n) ^ (BigInt(iz) & 0xffffffffn);
    
    const cache = heightCacheRef.current;
    if (cache.has(key)) return cache.get(key);
    const value = sampleHeight(x, z);
    cache.set(key, value);
    return value;
  };

  const acquireGeometry = () => {
    // Compute seg at the top to validate pooled geometries
    const seg = Math.max(2, resolution | 0);
    const vertsX = seg + 1;
    const vertsZ = seg + 1;

    // Search pool for geometry with matching seg, dispose mismatched ones
    const pool = geometryPoolRef.current;
    while (pool.length > 0) {
      const geom = pool.pop();
      if (geom?.userData?._poolMeta?.seg === seg) {
        return geom;
      }
      // Dispose geometry with wrong seg to prevent buffer length mismatches
      if (geom) geom.dispose();
    }

    // No matching geometry in pool, create a new one
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(vertsX * vertsZ * 3);
    const posAttr = new THREE.BufferAttribute(pos, 3);
    geom.setAttribute("position", posAttr);

    const norm = new Float32Array(vertsX * vertsZ * 3);
    const normAttr = new THREE.BufferAttribute(norm, 3);
    geom.setAttribute("normal", normAttr);

    // Use Uint16Array when vertex count < 65536 to reduce memory usage
    const vertexCount = vertsX * vertsZ;
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

  const mountTileMesh = (rec, geom) => {
    // Normals and bounding volumes are already computed, skip compute calls

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
    const norm = geom.attributes.normal.array;
    const dx = (maxX - minX) / seg;
    const dz = (maxZ - minZ) / seg;

    // First pass: compute all positions and store heights, track minY/maxY
    const heights = new Float32Array(vertsX * vertsZ);
    let p = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let z = 0; z < vertsZ; z++) {
      const wz = minZ + z * dz;
      for (let x = 0; x < vertsX; x++) {
        const wx = minX + x * dx;
        const wy = sampleHeightCached(wx, wz);
        heights[z * vertsX + x] = wy;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
        pos[p++] = wx;
        pos[p++] = wy;
        pos[p++] = wz;
      }
    }

    // Second pass: compute normals using finite differences
    for (let z = 0; z < vertsZ; z++) {
      for (let x = 0; x < vertsX; x++) {
        const idx = z * vertsX + x;
        let ddx, ddz;

        // Compute gradient in X direction using central differences
        if (x === 0) {
          // Left edge: forward difference
          const h0 = heights[idx];
          const h1 = heights[z * vertsX + (x + 1)];
          ddx = (h1 - h0) / dx;
        } else if (x === vertsX - 1) {
          // Right edge: backward difference
          const h0 = heights[idx];
          const h1 = heights[z * vertsX + (x - 1)];
          ddx = (h0 - h1) / dx;
        } else {
          // Interior: central difference
          const h1 = heights[z * vertsX + (x + 1)];
          const h0 = heights[z * vertsX + (x - 1)];
          ddx = (h1 - h0) / (2 * dx);
        }

        // Compute gradient in Z direction using central differences
        if (z === 0) {
          // Top edge: forward difference
          const h0 = heights[idx];
          const h1 = heights[(z + 1) * vertsX + x];
          ddz = (h1 - h0) / dz;
        } else if (z === vertsZ - 1) {
          // Bottom edge: backward difference
          const h0 = heights[idx];
          const h1 = heights[(z - 1) * vertsX + x];
          ddz = (h0 - h1) / dz;
        } else {
          // Interior: central difference
          const h1 = heights[(z + 1) * vertsX + x];
          const h0 = heights[(z - 1) * vertsX + x];
          ddz = (h1 - h0) / (2 * dz);
        }

        // Compute normal vector: normal = normalize([-ddx, 1, -ddz])
        const nx = -ddx;
        const ny = 1;
        const nz = -ddz;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const invLen = len > 0 ? 1 / len : 1;

        const normalIdx = idx * 3;
        norm[normalIdx] = nx * invLen;
        norm[normalIdx + 1] = ny * invLen;
        norm[normalIdx + 2] = nz * invLen;
      }
    }

    // Compute bounding box from known tile bounds and tracked Y range
    const box = geom.boundingBox || new THREE.Box3();
    box.min.set(minX, minY, minZ);
    box.max.set(maxX, maxY, maxZ);
    geom.boundingBox = box;

    // Compute bounding sphere from bounding box
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const dxBox = maxX - minX;
    const dyBox = maxY - minY;
    const dzBox = maxZ - minZ;
    const radius = Math.sqrt(dxBox * dxBox + dyBox * dyBox + dzBox * dzBox) * 0.5;
    const sphere = geom.boundingSphere || new THREE.Sphere();
    sphere.center.set(centerX, centerY, centerZ);
    sphere.radius = radius;
    geom.boundingSphere = sphere;

    geom.attributes.position.needsUpdate = true;
    geom.attributes.normal.needsUpdate = true;
    return geom;
  };

  useEffect(() => {
    // Enqueue newly required tiles
    required.forEach((key) => {
      // Ensure key is a string (tile keys must be strings like "ix,iz")
      if (typeof key !== "string") {
        console.error("TerrainTiled: required set contains non-string key", key, typeof key);
        return;
      }
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
      // Ensure job.key is a string
      if (typeof job.key !== "string") {
        console.error("TerrainTiled: job has non-string key", job.key, typeof job.key);
        continue;
      }
      const rec = tiles.current.get(job.key);
      if (!rec || rec.state !== "queued") continue;

      if (workerReady) {
        if (pendingWorkerJobsRef.current.size >= maxConcurrentJobs) {
          q.unshift(job);
          break;
        }

        rec.state = "building";
        rec.lastTouched = performance.now();
        // Ensure key is a string before sending to worker
        if (typeof rec.key !== "string") {
          console.error("TerrainTiled: tile key is not a string", rec.key, typeof rec.key);
          rec.state = "queued";
          q.unshift(job);
          continue;
        }
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
