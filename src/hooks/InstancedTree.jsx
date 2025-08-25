import { useMemo } from "react";
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
    /leaf|leaves|foliage|needle|pine|branch|spruce|fir/i.test(mat.name || "") ||
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
 * Loads a GLTF and returns an array of parts suitable for instancing.
 */
export function useInstancedTree(url) {
  const { scene } = useGLTF(url);

  return useMemo(() => {
    scene.updateMatrixWorld(true);

    const invRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const parts = [];

    scene.traverse((child) => {
      if (!child.isMesh) return;

      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      if (mats.length > 1) {
        console.warn(
          `[useInstancedTree] ${url}: mesh "${child.name}" has ${mats.length} materials; instancedMesh expects a single material. Using the first one.`
        );
      }
      const mat = mats[0];

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
        material: mat,
        name: child.name,
        materialName: mat?.name || "",
      });
    });

    // Normalize foliage materials to CUTOUT (alphaTest) so trees occlude trees
    // Normalize foliage materials to CUTOUT (alphaTest) so trees occlude trees
    const unique = new Map();
    parts.forEach((p) => p.material && unique.set(p.material.uuid, p.material));

    unique.forEach((m) => {
      const looksLikeFoliage =
        /leaf|leaves|foliage|needle|pine|branch|spruce|fir/i.test(
          m.name || ""
        ) ||
        !!m.alphaMap ||
        !!m.map;

      if (looksLikeFoliage) {
        // Hard cutout, NO MSAA coverage dithering
        m.transparent = false; // no blend
        m.alphaTest = Math.max(0.35, m.alphaTest ?? 0.45);
        m.alphaToCoverage = false; // <- stop the noisy stipple
        m.depthWrite = true;
        m.depthTest = true;
        m.side = THREE.DoubleSide; // cards visible both ways
        m.metalness = 0.0;
        m.roughness = 1.0; // kill specular sparkle on tiny quads
        m.dithering = true; // mild post-dither for banding, not coverage
        m.needsUpdate = true;
      } else {
        if (typeof m.metalness === "number") m.metalness = 0.0;
        if (typeof m.roughness === "number")
          m.roughness = Math.min(1.0, Math.max(0.6, m.roughness ?? 1.0));
      }
    });

    if (!__logged.has(url)) {
      __logged.add(url);

      const geoRows = parts.map((p) => ({
        mesh: p.name || "",
        material: p.materialName || p.material?.type || "",
        ...summarizeGeometry(p.geometry),
      }));

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

      if (typeof window !== "undefined") {
        window.__instancedTreeLast = { url, geoRows, matRows };
      }
    }

    return parts;
  }, [scene, url]);
}

// Preload the spruce high-LOD and keep the existing low-LOD
useGLTF.preload("/models/tree/Spruce_Fir/Spruce1.glb"); // High
useGLTF.preload("/models/tree/PineTrees2/PineTree2LowLODDecimated89.glb"); // Low (kept)
