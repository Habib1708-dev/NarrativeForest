// src/utils/useFoliageTuner.js
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useControls } from "leva";

function getLeafMaterials(parts) {
  const set = new Set();
  (parts || []).forEach((p) => {
    const m = p?.material;
    if (!m) return;
    const n = (m.name || p.materialName || "").toLowerCase();
    if (/^branch\d/.test(n) || m.userData?.isLeaf === true) set.add(m);
  });
  return Array.from(set);
}

export function useFoliageTuner(parts, label = "Foliage") {
  const leafMats = useMemo(() => getLeafMaterials(parts), [parts]);

  // Flat controls
  const vals = useControls(label, {
    Mode: { value: "Alpha Hash", options: ["Alpha Hash", "Alpha Test"] },
    AlphaTest: { value: 0.5, min: 0, max: 1, step: 0.01 },
    DoubleSided: { value: true },
    AlphaToCoverage: { value: true },
    DepthWrite: { value: true },
    PO_Enabled: { value: false, label: "PolygonOffset Enabled" },
    PO_Factor: { value: -0.1, min: -2, max: 2, step: 0.01 },
    PO_Units: { value: -1.0, min: -4, max: 4, step: 0.1 },
    TF_Aniso: { value: 8, min: 1, max: 16, step: 1 },
    TF_Mipmaps: { value: true },
    TF_Premult: { value: false, label: "Premultiply Alpha" },
    SH_Rough: { value: 1.0, min: 0, max: 1, step: 0.01 },
    SH_Metal: { value: 0.0, min: 0, max: 1, step: 0.01 },
    SH_Env: { value: 0.5, min: 0, max: 3, step: 0.05 },
  });

  // Destructure so deps change when sliders change
  const {
    Mode,
    AlphaTest,
    DoubleSided,
    AlphaToCoverage,
    DepthWrite,
    PO_Enabled,
    PO_Factor,
    PO_Units,
    TF_Aniso,
    TF_Mipmaps,
    TF_Premult,
    SH_Rough,
    SH_Metal,
    SH_Env,
  } = vals;

  useEffect(() => {
    if (!leafMats.length) return;

    const useHash = Mode === "Alpha Hash";

    leafMats.forEach((mat) => {
      if (!mat) return;

      mat.transparent = false;
      mat.depthWrite = !!DepthWrite;
      mat.depthTest = true;
      mat.side = DoubleSided ? THREE.DoubleSide : THREE.FrontSide;

      if (useHash && "alphaHash" in mat) {
        mat.alphaHash = true;
        mat.alphaTest = 0.0;
        if ("alphaToCoverage" in mat) mat.alphaToCoverage = !!AlphaToCoverage;
      } else {
        if ("alphaHash" in mat) mat.alphaHash = false;
        if ("alphaToCoverage" in mat) mat.alphaToCoverage = false;
        mat.alphaTest = Number(AlphaTest) || 0.0;
      }
      mat.blending = THREE.NormalBlending;

      mat.polygonOffset = !!PO_Enabled;
      if (mat.polygonOffset) {
        mat.polygonOffsetFactor = Number(PO_Factor) || 0.0;
        mat.polygonOffsetUnits = Number(PO_Units) || 0.0;
      }

      if ("roughness" in mat) mat.roughness = Number(SH_Rough);
      if ("metalness" in mat) mat.metalness = Number(SH_Metal);
      if ("envMapIntensity" in mat) mat.envMapIntensity = Number(SH_Env);

      const tex = mat.map;
      if (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = !!TF_Mipmaps;
        tex.minFilter = tex.generateMipmaps
          ? THREE.LinearMipmapLinearFilter
          : THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = Number(TF_Aniso) || 1;
        tex.premultiplyAlpha = !!TF_Premult;
        tex.needsUpdate = true;
      }

      mat.needsUpdate = true;
    });
  }, [
    leafMats,
    Mode,
    AlphaTest,
    DoubleSided,
    AlphaToCoverage,
    DepthWrite,
    PO_Enabled,
    PO_Factor,
    PO_Units,
    TF_Aniso,
    TF_Mipmaps,
    TF_Premult,
    SH_Rough,
    SH_Metal,
    SH_Env,
  ]);
}
