// src/debug/DebugTreeMaterials.jsx
import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/** Pretty-print helpers */
function texInfo(tex) {
  if (!tex) return null;
  return {
    name: tex.name || "",
    uuid: tex.uuid,
    image:
      tex.image?.src || tex.source?.data?.src || tex.image?.currentSrc || "",
    mapping: tex.mapping,
    wrapS: tex.wrapS,
    wrapT: tex.wrapT,
    magFilter: tex.magFilter,
    minFilter: tex.minFilter,
    format: tex.format,
    colorSpace: tex.colorSpace ?? tex.encoding, // three r152+ uses colorSpace
  };
}

function matInfo(mat) {
  if (!mat) return null;
  return {
    name: mat.name || "",
    uuid: mat.uuid,
    type: mat.type,
    transparent: !!mat.transparent,
    opacity: mat.opacity,
    alphaTest: mat.alphaTest ?? 0,
    depthWrite: mat.depthWrite,
    depthTest: mat.depthTest,
    colorWrite: mat.colorWrite,
    blending: mat.blending, // THREE.NoBlending, NormalBlending, AdditiveBlending, etc.
    side: mat.side, // 0:FrontSide, 1:BackSide, 2:DoubleSide
    polygonOffset: !!mat.polygonOffset,
    polygonOffsetFactor: mat.polygonOffsetFactor,
    polygonOffsetUnits: mat.polygonOffsetUnits,
    dithering: !!mat.dithering,
    toneMapped: !!mat.toneMapped,
    // Standard/Physical specific:
    metalness: mat.metalness,
    roughness: mat.roughness,
    envMapIntensity: mat.envMapIntensity,
    // Textures:
    map: texInfo(mat.map),
    alphaMap: texInfo(mat.alphaMap),
    normalMap: texInfo(mat.normalMap),
    roughnessMap: texInfo(mat.roughnessMap),
    metalnessMap: texInfo(mat.metalnessMap),
    emissiveMap: texInfo(mat.emissiveMap),
    aoMap: texInfo(mat.aoMap),
  };
}

function meshMatEntries(scene) {
  const entries = [];
  scene.traverse((obj) => {
    if (obj.isMesh) {
      const base = {
        meshName: obj.name || "",
        meshUUID: obj.uuid,
        geometryUUID: obj.geometry?.uuid,
        drawMode: obj.material?.wireframe ? "wireframe" : "triangles",
      };
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m, i) => {
          entries.push({
            ...base,
            materialSlot: i,
            material: m,
            materialInfo: matInfo(m),
          });
        });
      } else {
        entries.push({
          ...base,
          materialSlot: 0,
          material: obj.material,
          materialInfo: matInfo(obj.material),
        });
      }
    }
  });
  return entries;
}

function dedupeMaterials(entries) {
  const map = new Map();
  for (const e of entries) {
    const m = e.material;
    if (!m) continue;
    if (!map.has(m.uuid)) map.set(m.uuid, m);
  }
  return Array.from(map.values());
}

/**
 * Usage:
 * <DebugTreeMaterials url="/models/tree/PineTrees2/PineTreeHighLOD6065.glb" label="High LOD" />
 * <DebugTreeMaterials url="/models/tree/PineTrees2/PineTree2LowLODDecimated89.glb" label="Low LOD" />
 */
export default function DebugTreeMaterials({ url, label = "" }) {
  const { scene } = useGLTF(url);

  // Freeze a copy so logs stay stable
  const snapshot = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    snapshot.updateMatrixWorld(true);

    const entries = meshMatEntries(snapshot);
    const uniqueMats = dedupeMaterials(entries);

    // Grouped / readable console output
    const title = `🌲 Material Debug: ${label || url}`;
    console.groupCollapsed(title);

    // Summary
    console.log(
      "Meshes:",
      entries.length,
      "Unique materials:",
      uniqueMats.length
    );

    // Unique material table
    console.groupCollapsed("Unique Materials (by UUID)");
    console.table(
      uniqueMats.map((m) => ({
        name: m.name || "",
        uuid: m.uuid,
        type: m.type,
        transparent: !!m.transparent,
        opacity: m.opacity,
        alphaTest: m.alphaTest ?? 0,
        blending: m.blending,
        side: m.side,
        depthWrite: m.depthWrite,
        depthTest: m.depthTest,
        dithering: !!m.dithering,
        map: !!m.map,
        alphaMap: !!m.alphaMap,
      }))
    );
    console.groupEnd();

    // Per-mesh details
    console.groupCollapsed("Per-mesh material details");
    entries.forEach((e, i) => {
      const header = `${i}. ${e.meshName} [slot ${e.materialSlot}]`;
      console.groupCollapsed(header);
      console.log("Mesh UUID:", e.meshUUID);
      console.log("Geometry UUID:", e.geometryUUID);
      console.log("Material:", e.material);
      console.log("Material Info:", e.materialInfo);
      console.groupEnd();
    });
    console.groupEnd();

    console.groupEnd(); // title
  }, [snapshot, url, label]);

  return null;
}
