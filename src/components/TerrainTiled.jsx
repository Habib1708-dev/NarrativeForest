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
import { createTerrainMaterial, updateTerrainTileUniforms } from "./TerrainMaterial";

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

  // Base material template - will be cloned per tile for per-tile uniforms
  const baseMaterial = useMemo(() => {
    if (materialFactory) {
      const mat = materialFactory();
      if (mat?.isMaterial) return mat;
    }
    // Use GPU terrain material by default
    return createTerrainMaterial();
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
        // For GPU terrain, we ignore worker-generated positions/normals
        // Worker path is kept for fallback but GPU path doesn't use it
        const bounds = math.tileBounds(rec.ix, rec.iz);
        mountTileMesh(rec, geom, bounds);
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

    // Create flat grid geometry: positions in [0, tileSize] range, Y=0
    // GPU shader will displace vertices
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(vertsX * vertsZ * 3);
    const posAttr = new THREE.BufferAttribute(pos, 3);
    
    // Fill with flat grid coordinates (normalized to [0,1] range)
    // Actual world coordinates computed in shader using uTileMin + localPos * uTileSize
    let p = 0;
    for (let z = 0; z < vertsZ; z++) {
      for (let x = 0; x < vertsX; x++) {
        // Store normalized coordinates [0,1] for X and Z, Y=0
        pos[p++] = x / seg; // normalized X: [0, 1]
        pos[p++] = 0.0;     // Y: flat plane, GPU will displace
        pos[p++] = z / seg; // normalized Z: [0, 1]
      }
    }
    
    geom.setAttribute("position", posAttr);

    // Normals will be computed in GPU shader, but we need the attribute
    const norm = new Float32Array(vertsX * vertsZ * 3);
    // Initialize to up vector (will be overwritten by shader)
    for (let i = 0; i < norm.length; i += 3) {
      norm[i] = 0;
      norm[i + 1] = 1;
      norm[i + 2] = 0;
    }
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

  const mountTileMesh = (rec, geom, bounds) => {
    // Clone material per tile to support per-tile uniforms
    const tileMaterial = baseMaterial.clone();
    
    // CRITICAL: Set per-tile uniforms BEFORE creating mesh
    // This ensures tileUniforms are set before onBeforeCompile is called
    const { minX, minZ, maxX, maxZ } = bounds ?? math.tileBounds(rec.ix, rec.iz);
    const tileSize = maxX - minX; // Assuming square tiles
    const seg = Math.max(2, resolution | 0);
    const latticeStep = tileSize / seg;
    
    // Set tile uniforms in material.userData BEFORE mesh creation
    // This ensures onBeforeCompile can read them when shader compiles
    tileMaterial.userData.tileUniforms = {
      uTileMin: new THREE.Vector2(minX, minZ),
      uTileSize: tileSize,
      uLatticeStep: latticeStep,
    };
    
    const mesh = new THREE.Mesh(geom, tileMaterial);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    // CRITICAL: Disable frustum culling for GPU terrain
    // Shader sets transformed = worldPos, so Three.js culling/bounds can be wrong
    mesh.frustumCulled = false;
    // CRITICAL: Set visible to true immediately for GPU terrain
    // DistanceFade will patch the material and handle fade logic, but tiles must be visible
    // If DistanceFade fails to patch, tiles will still render (better than invisible)
    mesh.visible = true;

    // Also call updateTerrainTileUniforms to update uniforms if shader is already compiled
    // and to store references in mesh.userData
    updateTerrainTileUniforms(mesh, minX, minZ, tileSize, latticeStep);

    // Compute conservative bounding volumes (XZ from tile bounds, Y from terrain params)
    // For GPU terrain, we use a safe Y range since we don't compute exact heights on CPU
    // NOTE: These bounds are conservative and may cause incorrect frustum culling
    // For now, frustum culling is disabled for GPU terrain to prevent tiles from disappearing
    const params = getTerrainParams();
    // More conservative bounds to ensure all displaced vertices are included
    // elevation * 2 accounts for abs() in height function, + baseHeight + worldYOffset
    const maxHeight = params.elevation * 2 + params.baseHeight + Math.abs(params.worldYOffset) + 10;
    const minHeight = params.worldYOffset - 10;
    
    const box = geom.boundingBox || new THREE.Box3();
    box.min.set(minX, minHeight, minZ);
    box.max.set(maxX, maxHeight, maxZ);
    geom.boundingBox = box;

    const centerX = (minX + maxX) * 0.5;
    const centerY = (minHeight + maxHeight) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const dxBox = maxX - minX;
    const dyBox = maxHeight - minHeight;
    const dzBox = maxZ - minZ;
    const radius = Math.sqrt(dxBox * dxBox + dyBox * dyBox + dzBox * dzBox) * 0.5;
    const sphere = geom.boundingSphere || new THREE.Sphere();
    sphere.center.set(centerX, centerY, centerZ);
    sphere.radius = radius;
    geom.boundingSphere = sphere;

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

  // Use function declaration (hoisted) so it can be called before its declaration
  function flushPendingWorkerJobs() {
    if (!pendingWorkerJobsRef.current.size) return;
    const pending = Array.from(pendingWorkerJobsRef.current.values());
    pendingWorkerJobsRef.current.clear();
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      buildQueue.current.unshift(pending[i]);
    }
  }

  const buildTileGeometry = (ix, iz, boundsOverride) => {
    // For GPU terrain, we just create a flat grid geometry
    // Heights and normals are computed in the GPU shader
    const geom = acquireGeometry();
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
      mountTileMesh(rec, geom, job.bounds);
    }
  });

  return <group ref={groupRef} name="TerrainTiled" />;
});

export default TerrainTiled;
