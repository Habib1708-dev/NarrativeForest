import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

const __logged = new Set();

function colorHex(c) {
  if (!c || !(c instanceof THREE.Color)) return null;
  return `#${c.getHexString()}`;
}
function texInfo(tex) {
  if (!tex) return null;
  const img = tex.image;
  const size =
    img && typeof img === "object" && "width" in img && "height" in img
      ? `${img.width}x${img.height}`
      : null;
  return { name: tex.name || null, size };
}
function summarizeGeometry(geom) {
  if (!geom || !geom.attributes || !geom.attributes.position) return null;
  const pos = geom.attributes.position;
  const vertCount = pos.count;
  const triCount = geom.index
    ? geom.index.count / 3
    : Math.floor(vertCount / 3);
  const bbox = geom.boundingBox || null;
  return {
    verts: vertCount,
    tris: Math.round(triCount),
    indexed: !!geom.index,
    hasUV: !!geom.attributes.uv,
    hasNormal: !!geom.attributes.normal,
    bbox: bbox && [
      [
        Number(bbox.min.x.toFixed(3)),
        Number(bbox.min.y.toFixed(3)),
        Number(bbox.min.z.toFixed(3)),
      ],
      [
        Number(bbox.max.x.toFixed(3)),
        Number(bbox.max.y.toFixed(3)),
        Number(bbox.max.z.toFixed(3)),
      ],
    ],
  };
}
function summarizeMaterial(mat) {
  if (!mat) return null;
  const isFoliage =
    /leaf|leaves|foliage|needle|pine|branch|spruce|fir|billboard/i.test(
      mat.name || ""
    ) || !!mat.alphaMap;
  return {
    id: mat.uuid,
    name: mat.name || "",
    type: mat.type,
    color: colorHex(mat.color),
    metalness: mat.metalness ?? null,
    roughness: mat.roughness ?? null,
    transparent: !!mat.transparent,
    opacity: mat.opacity ?? 1,
    alphaTest: mat.alphaTest ?? 0,
    alphaToCoverage: !!mat.alphaToCoverage,
    depthWrite: !!mat.depthWrite,
    depthTest: !!mat.depthTest,
    map: texInfo(mat.map),
    alphaMap: texInfo(mat.alphaMap),
    normalMap: texInfo(mat.normalMap),
    onBeforeCompile: typeof mat.onBeforeCompile === "function",
    isFoliageGuess: isFoliage,
  };
}

// Narrow foliage detection:
// - Treat names like "Spruce_1_Mat", "Spruce_1_Billboard_Mat", "needle", etc. as foliage
// - "Bark" is explicitly NOT foliage
function isFoliageMaterial(m) {
  if (!m) return false;
  const n = (m.name || "").toLowerCase();
  if (/bark/.test(n)) return false; // e.g. "Bark1_Mat.001"
  if (/billboard/.test(n)) return true; // "Spruce_1_Billboard_Mat"
  if (/leaf|leaves|foliage|needle|pine|spruce|fir|branch/.test(n)) return true;
  if (m.alphaMap) return true;
  return false;
}

/**
 * Loads a GLTF and returns an array of parts suitable for instancing.
 * Each part: { geometry, material, name, materialName }
 */
export function useInstancedTree(url) {
  const { scene } = useGLTF(url);

  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);

    const invRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const result = [];

    scene.traverse((child) => {
      if (!child.isMesh) return;

      // Single material per instanced mesh
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      if (mats.length > 1) {
        console.warn(
          `[useInstancedTree] ${url}: mesh "${child.name}" has ${mats.length} materials; using the first one for instancing.`
        );
      }
      const srcMat = mats[0];

      // Bake geometry to world, then to root space
      const geom = child.geometry.clone();
      const baked = new THREE.Matrix4()
        .copy(invRoot)
        .multiply(child.matrixWorld);
      geom.applyMatrix4(baked);
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      geom.computeBoundingBox();

      result.push({
        geometry: geom,
        material: srcMat, // will be normalized (and optionally cloned) below
        name: child.name,
        materialName: srcMat?.name || "",
      });
    });

    // Collect and (optionally) clone unique materials to avoid global side-effects
    const uniqueByUUID = new Map();
    result.forEach(
      (p) => p.material && uniqueByUUID.set(p.material.uuid, p.material)
    );

    // Clone so edits don't leak to other consumers of the glTF
    const clones = new Map();
    uniqueByUUID.forEach((m, id) => clones.set(id, m.clone()));
    result.forEach((p) => {
      p.material = clones.get(p.material.uuid) || p.material;
    });

    // Normalize materials:
    // - Foliage → alphaTest cutout, depthWrite=true, transparent=false, DoubleSide, rough=1, metal=0
    // - Bark/other → sane rough/metal
    clones.forEach((m) => {
      if (isFoliageMaterial(m)) {
        m.transparent = false;
        m.alphaTest = Math.max(0.35, m.alphaTest ?? 0.4);
        m.alphaToCoverage = false;
        m.depthWrite = true;
        m.depthTest = true;
        m.side = THREE.DoubleSide;
        m.metalness = 0.0;
        m.roughness = 1.0;
        m.dithering = true;
        m.needsUpdate = true;
      } else {
        if (typeof m.metalness === "number") m.metalness = 0.0;
        if (typeof m.roughness === "number")
          m.roughness = Math.min(1.0, Math.max(0.6, m.roughness ?? 1.0));
      }
    });

    if (!__logged.has(url)) {
      __logged.add(url);

      const geoRows = result.map((p) => ({
        mesh: p.name || "",
        material: p.materialName || p.material?.type || "",
        ...summarizeGeometry(p.geometry),
      }));

      const matRows = [...clones.values()].map(summarizeMaterial);

      console.groupCollapsed(`%cuseInstancedTree: ${url}`, "color:#888");
      console.log(
        `meshes: ${result.length}, unique materials: ${matRows.length}`
      );
      console.groupCollapsed("%cparts (geometry)", "color:#888");
      console.table(geoRows);
      console.groupEnd();
      console.groupCollapsed("%cmaterials", "color:#888");
      console.table(matRows);
      console.groupEnd();
      console.groupEnd();

      if (typeof window !== "undefined") {
        window.__instancedTreeLast = { url, geoRows, matRows };
      }
    }

    return result;
  }, [scene, url]);

  // Dispose cloned geometries on unmount
  useEffect(() => {
    return () => {
      parts.forEach((p) => p.geometry?.dispose());
    };
  }, [parts]);

  return parts;
}

// Preload both Spruce variants (high + low LOD)
useGLTF.preload("/models/tree/Spruce_Fir/Spruce1.glb");
useGLTF.preload("/models/tree/Spruce_Fir/Spruce1_LOD.glb");
