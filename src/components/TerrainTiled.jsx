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
    resolution = 26,
    materialFactory,
    unloadCooldownMs = 2000,
  },
  ref
) {
  if (typeof sampleHeight !== "function") {
    throw new Error("<TerrainTiled> needs sampleHeight(x,z).");
  }

  const groupRef = useRef();
  useImperativeHandle(ref, () => groupRef.current, []);

  const tiles = useRef(new Map());
  const buildQueue = useRef([]);

  const { required, retention, math } = useInfiniteTiles({
    tileSize,
    anchorMinX,
    anchorMinZ,
    loadRadius,
    dropRadius,
    prefetch,
  });

  const makeMaterial = useMemo(() => {
    if (materialFactory) return materialFactory;
    return () =>
      new THREE.MeshStandardMaterial({
        color: "#0a0a0a",
        roughness: 1,
        metalness: 0,
      });
  }, [materialFactory]);

  const buildTileGeometry = (ix, iz) => {
    const { minX, minZ, maxX, maxZ } = math.tileBounds(ix, iz);
    const seg = Math.max(2, resolution | 0);
    const vertsX = seg + 1;
    const vertsZ = seg + 1;

    const pos = new Float32Array(vertsX * vertsZ * 3);
    const idx = new Uint32Array(seg * seg * 6);

    const dx = (maxX - minX) / seg;
    const dz = (maxZ - minZ) / seg;

    let p = 0;
    for (let z = 0; z < vertsZ; z++) {
      const wz = minZ + z * dz;
      for (let x = 0; x < vertsX; x++) {
        const wx = minX + x * dx;
        const wy = sampleHeight(wx, wz);
        pos[p++] = wx;
        pos[p++] = wy;
        pos[p++] = wz;
      }
    }

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

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    // BVH if three-bvh is installed (three-bvh-setup typically patches this):
    g.computeBoundsTree?.();
    return g;
  };

  useEffect(() => {
    // Enqueue newly required tiles
    required.forEach((key) => {
      if (tiles.current.has(key)) return;
      const [ix, iz] = math.parse(key);
      buildQueue.current.push({ key, ix, iz, enqueuedAt: performance.now() });
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

  // Build/remove cadence (one tile/frame)
  useFrame(() => {
    const now = performance.now();

    // Remove expired tiles
    tiles.current.forEach((rec) => {
      if (
        rec.markedForRemovalAt &&
        now - rec.markedForRemovalAt >= unloadCooldownMs
      ) {
        if (rec.mesh) {
          groupRef.current?.remove(rec.mesh);
          rec.mesh.geometry?.dispose();
          if (rec.mesh.material?.isMaterial) rec.mesh.material.dispose?.();
        }
        tiles.current.delete(rec.key);
      }
    });

    // Build one tile per frame
    const q = buildQueue.current;
    if (!q.length) return;
    const job = q.shift();
    const rec = tiles.current.get(job.key);
    if (!rec || rec.state !== "queued") return;

    rec.state = "building";
    const geom = buildTileGeometry(rec.ix, rec.iz);
    const mat = makeMaterial();
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    mesh.visible = false; // stay hidden until DistanceFade patches fade logic

    groupRef.current?.add(mesh);
    rec.mesh = mesh;
    rec.state = "ready";
    rec.lastTouched = performance.now();
    emitDistanceFadeTileReady({ mesh, key: rec.key });
  });

  return <group ref={groupRef} name="TerrainTiled" />;
});

export default TerrainTiled;
