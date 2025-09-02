import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useInfiniteTiles } from "../hooks/useInfiniteTiles";

/**
 * TerrainTiled — CPU-built tiles that exactly sample your Terrain.jsx height math.
 * - sampleHeight(x,z) MUST be the function from proc/heightfield (heightAt).
 * - We compute positions in WORLD space directly (no rotation/offset tricks).
 * - We call computeVertexNormals() for parity with your original mesh.
 */
export default function TerrainTiled({
  sampleHeight, // REQUIRED
  tileSize = 4, // 5x5 tiles cover your original 20x20 base
  anchorMinX = -10, // aligns 20×20 base to [-10..+10]
  anchorMinZ = -10,
  loadRadius = 2, // 5x5 visible set
  dropRadius = 3, // hysteresis band
  prefetch = 1,
  resolution = 26, // ~128 segs / 20m → 6.4 segs/m → 4m tile ≈ 25.6 → 26
  materialFactory,
  unloadCooldownMs = 2000,
}) {
  if (typeof sampleHeight !== "function") {
    throw new Error("<TerrainTiled> needs sampleHeight(x,z).");
  }

  const groupRef = useRef();
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
    // Match your Terrain.jsx material color
    return () =>
      new THREE.MeshStandardMaterial({
        color: "#0a0a0a",
        roughness: 1,
        metalness: 0,
      });
  }, [materialFactory]);

  // Build one tile geometry (positions + indices; let three compute normals)
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
        const wy = sampleHeight(wx, wz); // world-space height, includes baseHeight & -10 offset
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
    // Normals like your original Terrain.jsx (computed from triangles)
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  };

  // Diff application
  useEffect(() => {
    // Enqueue builds for newly required tiles
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

    // Mark for removal when outside retention
    tiles.current.forEach((rec, key) => {
      if (!retention.has(key)) {
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

    // Build one tile
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

    groupRef.current?.add(mesh);
    rec.mesh = mesh;
    rec.state = "ready";
    rec.lastTouched = performance.now();
  });

  return <group ref={groupRef} name="TerrainTiled" />;
}
