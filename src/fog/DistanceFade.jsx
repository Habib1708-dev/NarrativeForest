import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { useControls, folder, button } from "leva";
import { DISTANCE_FADE_TILE_READY_EVENT } from "../utils/distanceFadeEvents";
import { useDebugStore } from "../state/useDebugStore";

const DISTANCE_FADE_SKIP_FLAG = "distanceFadeSkip";

// Debug-only Leva panel — only mounts when isDebugMode is true
function DistanceFadeDebugPanel({ propDefaults, onChange, onRepatch }) {
  const controls = useControls(
    "Distance Fade",
    {
      enabled: { value: propDefaults.enabled },
      distStart: { value: propDefaults.distStart, min: 0, max: 200, step: 0.1 },
      distEnd: { value: propDefaults.distEnd, min: 0, max: 200, step: 0.1 },
      clipStart: { value: propDefaults.clipStart, min: 0, max: 1, step: 0.01 },
      clipEnd: { value: propDefaults.clipEnd, min: 0, max: 1, step: 0.01 },
      "Debug / Diagnostics": folder({
        forceKill: { value: propDefaults.forceKill },
        debugTint: { value: propDefaults.debugTint },
        RepatchNow: button(() => onRepatch?.()),
      }),
    },
    { collapsed: false }
  );
  useEffect(() => {
    onChange(controls);
  }, [
    controls.enabled,
    controls.distStart,
    controls.distEnd,
    controls.clipStart,
    controls.clipEnd,
    controls.forceKill,
    controls.debugTint,
  ]);
  return null;
}

/**
 * DistanceFade — bulletproof patcher with on-the-fly Leva controls.
 * - Toggle on/off and tune distStart/distEnd/clipStart/clipEnd live.
 * - Diagnostics: forceKill (prove injection) & debugTint (visualize fade band).
 * - View-space distance (modelViewMatrix), no cameraPosition reliance.
 */
export default function DistanceFade({
  // Defaults (used as initial values for Leva controls)
  enabled = true,
  distStart = 4,
  distEnd = 8,
  clipStart = 0.6,
  clipEnd = 0.9,
  // Diagnostics defaults
  forceKill = false,
  debugTint = false,
}) {
  const { scene, gl } = useThree();
  const isDebugMode = useDebugStore((s) => s.isDebugMode);
  const patched = useRef(new WeakSet());
  const patchedMeshesRef = useRef(new WeakSet());
  const fullSceneScanNeededRef = useRef(true);
  const didLog = useRef(false);
  const stats = useRef({ count: 0, byType: new Map() });

  // Debug overrides from Leva panel (null when not debugging)
  const [debugControls, setDebugControls] = useState(null);
  useEffect(() => {
    if (!isDebugMode) setDebugControls(null);
  }, [isDebugMode]);

  // Active control values: debug overrides or prop defaults
  const c = debugControls ?? {
    enabled,
    distStart,
    distEnd,
    clipStart,
    clipEnd,
    forceKill,
    debugTint,
  };

  // Normalize / clamp relationships to avoid degenerate ranges
  const effEnabled = !!c.enabled;
  const effDistStart = Math.max(
    0,
    Math.min(c.distStart, c.distEnd - 1e-6)
  );
  const effDistEnd = Math.max(effDistStart + 1e-6, c.distEnd);
  const effClipStart = Math.max(
    0,
    Math.min(c.clipStart, c.clipEnd - 1e-6)
  );
  const effClipEnd = Math.min(
    1,
    Math.max(effClipStart + 1e-6, c.clipEnd)
  );
  const effForceKill = !!c.forceKill;
  const effDebugTint = !!c.debugTint;

  // uniforms (stable object)
  const uniforms = useMemo(
    () => ({
      uDF_Enable: { value: effEnabled ? 1.0 : 0.0 },
      uDF_DistStart: { value: effDistStart },
      uDF_DistEnd: { value: effDistEnd },
      uDF_ClipStart: { value: effClipStart },
      uDF_ClipEnd: { value: effClipEnd },
      uDF_ForceKill: { value: effForceKill ? 1.0 : 0.0 },
      uDF_DebugTint: { value: effDebugTint ? 1.0 : 0.0 },
    }),
    []
  );

  // Consolidated uniform sync (replaces 7 individual useEffect hooks)
  useEffect(() => {
    uniforms.uDF_Enable.value = effEnabled ? 1.0 : 0.0;
    uniforms.uDF_DistStart.value = effDistStart;
    uniforms.uDF_DistEnd.value = effDistEnd;
    uniforms.uDF_ClipStart.value = effClipStart;
    uniforms.uDF_ClipEnd.value = effClipEnd;
    uniforms.uDF_ForceKill.value = effForceKill ? 1.0 : 0.0;
    uniforms.uDF_DebugTint.value = effDebugTint ? 1.0 : 0.0;
  }, [effEnabled, effDistStart, effDistEnd, effClipStart, effClipEnd, effForceKill, effDebugTint]);

  const GLSL_SHARED = `
uniform float uDF_Enable;
uniform float uDF_DistStart;
uniform float uDF_DistEnd;
uniform float uDF_ClipStart;
uniform float uDF_ClipEnd;
uniform float uDF_ForceKill;
uniform float uDF_DebugTint;

float dfDither(vec2 p){
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}

void DFade_doDiscard(float df_vViewDist){
  if (uDF_ForceKill > 0.5) { discard; }
  if (uDF_Enable < 0.5) return;
  if (uDF_DistEnd <= uDF_DistStart) return;

  float t = clamp((df_vViewDist - uDF_DistStart) / max(1e-6, (uDF_DistEnd - uDF_DistStart)), 0.0, 1.0);
  float ramp = smoothstep(uDF_ClipStart, uDF_ClipEnd, t);
  if (ramp > dfDither(gl_FragCoord.xy)) discard;

  if (uDF_DebugTint > 0.5) {
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0 - t, 0.0, t), 0.85);
  }
}
`.trim();

  // ---------- ultra-robust insertion ----------
  const insertDiscardBlock = (fragSrc) => {
    const snippet = `\nDFade_doDiscard(df_vViewDist);\n`.trim();

    if (fragSrc.includes("#include <clipping_planes_fragment>")) {
      return fragSrc.replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>\n${snippet}\n`
      );
    }
    if (fragSrc.includes("#include <fog_fragment>")) {
      return fragSrc.replace(
        "#include <fog_fragment>",
        `${snippet}\n#include <fog_fragment>\n`
      );
    }
    if (fragSrc.includes("#include <dithering_fragment>")) {
      return fragSrc.replace(
        "#include <dithering_fragment>",
        `${snippet}\n#include <dithering_fragment>\n`
      );
    }
    const mainOpen = fragSrc.match(/void\s+main\s*\(\s*\)\s*{\s*/);
    if (mainOpen) {
      return fragSrc.replace(mainOpen[0], `${mainOpen[0]}${snippet}\n`);
    }
    return fragSrc;
  };

  // ---------- shadow helpers ----------
  const depthMatCache = useRef(new WeakMap());
  const distMatCache = useRef(new WeakMap());

  const shouldSkipSubtree = (obj) =>
    !!obj?.userData?.[DISTANCE_FADE_SKIP_FLAG];

  function getDepthMat(srcMat) {
    if (depthMatCache.current.has(srcMat))
      return depthMatCache.current.get(srcMat);
    const m = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    m.skinning = !!srcMat?.skinning;
    m.morphTargets = !!srcMat?.morphTargets;
    m.side = srcMat?.side ?? THREE.FrontSide;
    m.onBeforeCompile = (shader) => {
      // Only patch if this shader uses the standard project_vertex chunk
      if (!shader.vertexShader.includes("#include <project_vertex>")) return;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        "varying float df_vViewDist;\n" +
        shader.vertexShader.replace(
          "#include <project_vertex>",
          `
#include <project_vertex>
df_vViewDist = length(mvPosition.xyz);
`
        );
      shader.fragmentShader =
        "varying float df_vViewDist;\n" +
        GLSL_SHARED +
        "\n" +
        shader.fragmentShader.replace(
          "gl_FragColor = vec4( vec3( 1.0 ), fragCoordZ );",
          `DFade_doDiscard(df_vViewDist);\ngl_FragColor = vec4( vec3( 1.0 ), fragCoordZ );`
        );
    };
    depthMatCache.current.set(srcMat, m);
    return m;
  }

  function getDistanceMat(srcMat) {
    if (distMatCache.current.has(srcMat))
      return distMatCache.current.get(srcMat);
    const m = new THREE.MeshDistanceMaterial();
    m.skinning = !!srcMat?.skinning;
    m.morphTargets = !!srcMat?.morphTargets;
    m.side = srcMat?.side ?? THREE.FrontSide;
    m.onBeforeCompile = (shader) => {
      if (!shader.vertexShader.includes("#include <project_vertex>")) return;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        "varying float df_vViewDist;\n" +
        shader.vertexShader.replace(
          "#include <project_vertex>",
          `
#include <project_vertex>
df_vViewDist = length(mvPosition.xyz);
`
        );
      shader.fragmentShader =
        "varying float df_vViewDist;\n" +
        GLSL_SHARED +
        "\n" +
        shader.fragmentShader.replace(
          "gl_FragColor = packDepthToRGBA( fragCoordZ );",
          `DFade_doDiscard(df_vViewDist);\ngl_FragColor = packDepthToRGBA( fragCoordZ );`
        );
    };
    distMatCache.current.set(srcMat, m);
    return m;
  }

  // ---------- patcher ----------
  const hasNoDistanceFade = (obj) => {
    let o = obj;
    while (o) {
      if (shouldSkipSubtree(o) || o.userData?.noDistanceFade) return true;
      o = o.parent;
    }
    return false;
  };

  const patchMaterial = (mat, mesh) => {
    if (!effEnabled || !mat) return false;
    if (hasNoDistanceFade(mesh) || mat?.userData?.noDistanceFade) return false;

    if (
      mat.isShaderMaterial ||
      mat.isPointsMaterial ||
      mat.isLineMaterial ||
      mat.isLineBasicMaterial
    )
      return false;

    const alreadyPatched = patched.current.has(mat);

    if (!alreadyPatched) {
      // Align flags to reduce odd blending/culling artifacts
      mat.fog = true; // helps some variants expose fog-related chunks

      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = function (shader) {
        // Only patch shaders that use the standard project_vertex chunk
        if (!shader.vertexShader.includes("#include <project_vertex>")) {
          prev?.call(this, shader);
          return;
        }
        prev?.call(this, shader);
        Object.assign(shader.uniforms, uniforms);

        shader.vertexShader =
          "varying float df_vViewDist;\n" +
          shader.vertexShader.replace(
            "#include <project_vertex>",
            `
#include <project_vertex>
df_vViewDist = length(mvPosition.xyz);
`
          );

        shader.fragmentShader =
          "varying float df_vViewDist;\n" +
          GLSL_SHARED +
          "\n" +
          insertDiscardBlock(shader.fragmentShader);
      };

      patched.current.add(mat);
      // One-shot recompile so our onBeforeCompile takes effect deterministically
      mat.needsUpdate = true;

      stats.current.count++;
      const t = mat.type || "UnknownMaterial";
      stats.current.byType.set(t, (stats.current.byType.get(t) || 0) + 1);
    }

    if (mesh) {
      mesh.customDepthMaterial ||= getDepthMat(mat);
      mesh.customDistanceMaterial ||= getDistanceMat(mat);
    }

    return true;
  };

  const patchMesh = (mesh) => {
    if (!mesh?.isMesh) return false;
    if (shouldSkipSubtree(mesh)) return false;
    if (patchedMeshesRef.current.has(mesh)) return false;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let ready = false;
    for (const m of mats) ready = patchMaterial(m, mesh) || ready;

    if (ready) {
      mesh.visible = true;
      patchedMeshesRef.current.add(mesh);
    }

    return ready;
  };

  // Patch pass helper
  const runPatchPass = (forceFull = false) => {
    if (!effEnabled) return false;
    if (!forceFull && !fullSceneScanNeededRef.current) return false;

    let patchedThisPass = 0;
    const walk = (node) => {
      if (!node || shouldSkipSubtree(node)) return;
      if (node.isMesh) {
        if (!forceFull && patchedMeshesRef.current.has(node)) {
          // continue to children even if this mesh was patched already
        } else if (patchMesh(node)) {
          patchedThisPass += 1;
        }
      }
      const children = node.children;
      if (!children || !children.length) return;
      for (const child of children) walk(child);
    };
    walk(scene);

    if (!forceFull) {
      if (patchedThisPass === 0) {
        fullSceneScanNeededRef.current = false;
      } else {
        fullSceneScanNeededRef.current = true;
      }
    }

    if (!didLog.current && stats.current.count > 0) {
      didLog.current = true;
      const breakdown = [...stats.current.byType.entries()]
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      console.info(
        `[DistanceFade] patched materials: ${stats.current.count} (${breakdown})`
      );
    }

    return patchedThisPass > 0;
  };

  // Initial delayed patch to avoid racing with scene mount
  useEffect(() => {
    if (!effEnabled) return;
    fullSceneScanNeededRef.current = true;
    warmupFramesRef.current = 60;
    didLog.current = false;
    const t = setTimeout(() => runPatchPass(true), 50);
    return () => clearTimeout(t);
  }, [effEnabled, scene]);

  // Warm-up: patch for a short window to catch late-mounting assets (GLTF/Suspense)
  const warmupFramesRef = useRef(60); // ~1s at 60fps (reduced from 120)
  const pendingMeshesRef = useRef([]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleTileReady = (event) => {
      const mesh = event?.detail?.mesh;
      if (!effEnabled) {
        if (mesh) mesh.visible = true;
        return;
      }
      if (mesh) pendingMeshesRef.current.push(mesh);
    };
    window.addEventListener(DISTANCE_FADE_TILE_READY_EVENT, handleTileReady);
    return () => {
      window.removeEventListener(
        DISTANCE_FADE_TILE_READY_EVENT,
        handleTileReady
      );
    };
  }, [effEnabled]);
  useFrame(() => {
    if (!effEnabled) return;

    const pending = pendingMeshesRef.current;
    if (pending.length) {
      const meshes = pending.splice(0, pending.length);
      for (const mesh of meshes) patchMesh(mesh);
    }

    if (!fullSceneScanNeededRef.current) return;

    if (warmupFramesRef.current > 0) {
      warmupFramesRef.current -= 1;
      // Only run patch pass every 15 frames during warmup to reduce CPU load
      // This reduces scene traversals from 60 to 4 while still catching late-mounting assets
      if (warmupFramesRef.current % 15 === 0) {
        runPatchPass();
        if (!fullSceneScanNeededRef.current) warmupFramesRef.current = 0;
      }
      return;
    }
    // After warmup, only run when manually requested
    if (fullSceneScanNeededRef.current) runPatchPass();
  });

  // Stable callback for debug panel's RepatchNow button
  const handleRepatch = () => {
    didLog.current = false;
    fullSceneScanNeededRef.current = true;
    runPatchPass(true);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      patched.current = new WeakSet();
      patchedMeshesRef.current = new WeakSet();
      fullSceneScanNeededRef.current = true;
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m && (m.needsUpdate = true));
        o.customDepthMaterial = undefined;
        o.customDistanceMaterial = undefined;
      });
      gl.info.programs?.forEach((p) => p?.program?.dispose?.());
    };
  }, [scene, gl]);

  // Debug panel only mounts when debug mode is active — eliminates Leva overhead
  if (isDebugMode) {
    return (
      <DistanceFadeDebugPanel
        propDefaults={{ enabled, distStart, distEnd, clipStart, clipEnd, forceKill, debugTint }}
        onChange={setDebugControls}
        onRepatch={handleRepatch}
      />
    );
  }
  return null;
}

export function markDistanceFadeStatic(object3D, options = {}) {
  if (!object3D) return;
  const { includeChildren = true } = options;

  const applyFlag = (target) => {
    if (!target) return;
    target.userData = target.userData || {};
    target.userData[DISTANCE_FADE_SKIP_FLAG] = true;
    target.userData.noDistanceFade = true;
  };

  if (includeChildren && typeof object3D.traverse === "function") {
    object3D.traverse((child) => applyFlag(child));
  } else {
    applyFlag(object3D);
  }
}
