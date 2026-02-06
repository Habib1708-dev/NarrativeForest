// src/components/TerrainAuthority.jsx
// Authority-Anchored Terrain System
// Extended version of TerrainTiled with support for freeflight mode coordinate offset
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
import {
  createTerrainAuthorityMaterial,
  updateTerrainAuthorityTileUniforms,
  updateTerrainAuthorityUniforms,
} from "./TerrainAuthorityMaterial";
import { useWorldAnchorStore } from "../../state/useWorldAnchorStore";

/**
 * TerrainAuthority — Authority-anchored infinite terrain system.
 *
 * This component extends TerrainTiled with support for the WorldAnchor system:
 * - In AUTHORED mode: terrain samples in absolute world space
 * - In FREEFLIGHT mode: terrain samples with travel offset for infinite illusion
 *
 * forwardRef so other systems (Forest/Fog) can raycast recursively.
 */
const TerrainAuthority = forwardRef(function TerrainAuthority(
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
    throw new Error("<TerrainAuthority> needs sampleHeight(x,z).");
  }

  const { camera } = useThree();
  const { markStart, markEnd } = usePerformanceMonitor("TerrainAuthority");

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
  // Uses the authority material with freeflight support
  const baseMaterial = useMemo(() => {
    if (materialFactory) {
      const mat = materialFactory();
      if (mat?.isMaterial) return mat;
    }
    // Use GPU terrain authority material by default
    return createTerrainAuthorityMaterial();
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
  const materialPoolRef = useRef([]);
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
    return () => {
      materialPoolRef.current.forEach((mat) => mat.dispose());
      materialPoolRef.current = [];
    };
  }, [baseMaterial]);

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
        new URL("../../workers/terrainTileWorker.js", import.meta.url),
        { type: "module" }
      );
    } catch (err) {
      console.warn("TerrainAuthority: failed to initialize worker", err);
      workerFailedRef.current = true;
      return;
    }

    workerRef.current = worker;
    performanceMonitor.markSystemInit("terrain-authority-worker", performance.now() - t0);

    const handleMessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "build-complete") {
        if (typeof data.key !== "string") {
          console.error("TerrainAuthority: received non-string key from worker", data.key);
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
        const bounds = math.tileBounds(rec.ix, rec.iz);
        mountTileMesh(rec, geom, bounds);
      } else if (data.type === "build-error") {
        if (typeof data.key !== "string") {
          console.error("TerrainAuthority: received non-string key in error from worker", data.key);
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

  const sampleHeightCached = (x, z) => {
    const ix = Math.round((x - anchorMinX) / latticeStep);
    const iz = Math.round((z - anchorMinZ) / latticeStep);
    const key = ix + "," + iz;

    const cache = heightCacheRef.current;
    if (cache.has(key)) return cache.get(key);
    const value = sampleHeight(x, z);
    cache.set(key, value);
    return value;
  };

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

    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(vertsX * vertsZ * 3);
    const posAttr = new THREE.BufferAttribute(pos, 3);

    let p = 0;
    for (let z = 0; z < vertsZ; z++) {
      for (let x = 0; x < vertsX; x++) {
        pos[p++] = x / seg;
        pos[p++] = 0.0;
        pos[p++] = z / seg;
      }
    }

    geom.setAttribute("position", posAttr);

    const norm = new Float32Array(vertsX * vertsZ * 3);
    for (let i = 0; i < norm.length; i += 3) {
      norm[i] = 0;
      norm[i + 1] = 1;
      norm[i + 2] = 0;
    }
    const normAttr = new THREE.BufferAttribute(norm, 3);
    geom.setAttribute("normal", normAttr);

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

  const acquireMaterial = () => {
    const pool = materialPoolRef.current;
    if (pool.length > 0) {
      return pool.pop();
    }
    const cloned = baseMaterial.clone();
    // Explicitly copy onBeforeCompile - some Three.js versions don't copy it properly
    if (baseMaterial.onBeforeCompile && !cloned.onBeforeCompile) {
      cloned.onBeforeCompile = baseMaterial.onBeforeCompile;
    }
    // Also copy customProgramCacheKey if present
    if (baseMaterial.customProgramCacheKey) {
      cloned.customProgramCacheKey = baseMaterial.customProgramCacheKey;
    }
    return cloned;
  };

  const releaseMaterial = (mat) => {
    if (!mat) return;
    materialPoolRef.current.push(mat);
  };

  const mountTileMesh = (rec, geom, bounds) => {
    const tileMaterial = acquireMaterial();

    const { minX, minZ, maxX, maxZ } = bounds ?? math.tileBounds(rec.ix, rec.iz);
    const tileSizeLocal = maxX - minX;
    const seg = Math.max(2, resolution | 0);
    const latticeStepLocal = tileSizeLocal / seg;

    tileMaterial.userData.tileUniforms = {
      uTileMin: new THREE.Vector2(minX, minZ),
      uTileSize: tileSizeLocal,
      uLatticeStep: latticeStepLocal,
    };

    const mesh = new THREE.Mesh(geom, tileMaterial);
    mesh.frustumCulled = true;
    mesh.visible = true;

    updateTerrainAuthorityTileUniforms(mesh, minX, minZ, tileSizeLocal, latticeStepLocal);

    const params = getTerrainParams();
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

  function flushPendingWorkerJobs() {
    if (!pendingWorkerJobsRef.current.size) return;
    const pending = Array.from(pendingWorkerJobsRef.current.values());
    pendingWorkerJobsRef.current.clear();
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      buildQueue.current.unshift(pending[i]);
    }
  }

  const buildTileGeometry = (ix, iz, boundsOverride) => {
    const geom = acquireGeometry();
    geom.attributes.position.needsUpdate = true;
    geom.attributes.normal.needsUpdate = true;
    return geom;
  };

  useEffect(() => {
    required.forEach((key) => {
      if (typeof key !== "string") {
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

    tiles.current.forEach((rec) => {
      if (!retention.has(rec.key)) {
        rec.markedForRemovalAt ??= performance.now();
      } else {
        rec.markedForRemovalAt = undefined;
        rec.lastTouched = performance.now();
      }
    });
  }, [required, retention, math]);

  // Build/remove cadence + Authority-anchor uniform sync
  useFrame(() => {
    const frameStart = performance.now();
    const now = frameStart;

    // ========================================
    // AUTHORITY-ANCHOR UNIFORM SYNC
    // Update all tile materials with current freeflight state
    // ========================================
    const { mode, origin } = useWorldAnchorStore.getState();
    const isFreeflight = mode === "FREEFLIGHT" ? 1.0 : 0.0;
    const travelOffsetX = isFreeflight ? camera.position.x - origin.x : 0;
    const travelOffsetZ = isFreeflight ? camera.position.z - origin.z : 0;

    tiles.current.forEach((rec) => {
      if (rec.mesh?.material) {
        updateTerrainAuthorityUniforms(
          rec.mesh.material,
          isFreeflight,
          travelOffsetX,
          travelOffsetZ
        );
      }
    });
    // ========================================

    // Remove expired tiles
    tiles.current.forEach((rec) => {
      if (
        rec.markedForRemovalAt &&
        now - rec.markedForRemovalAt >= unloadCooldownMs
      ) {
        if (rec.mesh) {
          groupRef.current?.remove(rec.mesh);
          releaseGeometry(rec.mesh.geometry);
          releaseMaterial(rec.mesh.material);
          rec.mesh.geometry = null;
          rec.mesh.material = null;
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
      if (typeof job.key !== "string") {
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

  return <group ref={groupRef} name="TerrainAuthority" />;
});

export default TerrainAuthority;
