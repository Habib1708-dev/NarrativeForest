// src/hooks/InstancedTree.jsx
import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

// keep track of which URLs i've already logged to avoid spam
const __logged = new Set();

// summarize helpers
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
    /leaf|leaves|foliage|needle|pine|branch/i.test(mat.name || "") ||
    !!mat.alphaMap;
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

/**
 * Loads a GLTF and returns an array of parts: [{ geometry, material, name, materialName }, ...]
 * I bake each mesh's world transform relative to root into the geometry so instancing uses correct size.
 * I also log a compact summary of parts and unique materials (once per URL).
 */
export function useInstancedTree(url) {
  const { scene } = useGLTF(url);

  return useMemo(() => {
    scene.updateMatrixWorld(true);

    const invRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const parts = [];

    scene.traverse((child) => {
      if (!child.isMesh) return;

      // handle multi-material meshes (instancing expects single material)
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      if (mats.length > 1) {
        console.warn(
          `[useInstancedTree] ${url}: mesh "${child.name}" has ${mats.length} materials; instancedMesh expects a single material. Using the first one.`
        );
      }
      const mat = mats[0];

      // bake transform relative to GLTF root into a cloned geometry
      const geom = child.geometry.clone();
      const baked = new THREE.Matrix4()
        .copy(invRoot)
        .multiply(child.matrixWorld);
      geom.applyMatrix4(baked);
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      geom.computeBoundingBox();

      parts.push({
        geometry: geom,
        material: mat, // share material (fine for instancing)
        name: child.name,
        materialName: mat?.name || "",
      });
    });

    // log once per url
    if (!__logged.has(url)) {
      __logged.add(url);

      // geometry table
      const geoRows = parts.map((p) => ({
        mesh: p.name || "",
        material: p.materialName || p.material?.type || "",
        ...summarizeGeometry(p.geometry),
      }));

      // unique material table
      const unique = new Map();
      parts.forEach(
        (p) => p.material && unique.set(p.material.uuid, p.material)
      );
      const matRows = [...unique.values()].map(summarizeMaterial);

      console.groupCollapsed(`%cuseInstancedTree: ${url}`, "color:#888");
      console.log(
        `meshes: ${parts.length}, unique materials: ${matRows.length}`
      );
      console.groupCollapsed("%cparts (geometry)", "color:#888");
      console.table(geoRows);
      console.groupEnd();
      console.groupCollapsed("%cmaterials", "color:#888");
      console.table(matRows);
      console.groupEnd();
      console.groupEnd();

      // stash for quick inspection from DevTools
      if (typeof window !== "undefined") {
        window.__instancedTreeLast = { url, geoRows, matRows };
      }
    }

    return parts;
  }, [scene, url]);
}

// Preload so Suspense batches fetches (paths are /public-relative)
useGLTF.preload("/models/tree/PineTrees2/PineTreeHighLOD6065.glb"); // High
useGLTF.preload("/models/tree/PineTrees2/PineTree2MediumLODDecimated1668.glb"); // Medium
useGLTF.preload("/models/tree/PineTrees2/PineTree2LowLODDecimated89.glb"); // Low
