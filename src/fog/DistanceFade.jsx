import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { useControls, folder } from "leva";

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
  const patched = useRef(new WeakSet());
  const didLog = useRef(false);
  const stats = useRef({ count: 0, byType: new Map() });

  // ---- Leva controls (live) ----
  const controls = useControls(
    "Distance Fade",
    {
      enabled: { value: enabled },
      distStart: { value: distStart, min: 0, max: 200, step: 0.1 },
      distEnd: { value: distEnd, min: 0, max: 200, step: 0.1 },
      clipStart: { value: clipStart, min: 0, max: 1, step: 0.01 },
      clipEnd: { value: clipEnd, min: 0, max: 1, step: 0.01 },
      "Debug / Diagnostics": folder({
        forceKill: { value: forceKill },
        debugTint: { value: debugTint },
      }),
    },
    { collapsed: false }
  );

  // Normalize / clamp relationships to avoid degenerate ranges
  const effEnabled = !!controls.enabled;
  const effDistStart = Math.max(
    0,
    Math.min(controls.distStart, controls.distEnd - 1e-6)
  );
  const effDistEnd = Math.max(effDistStart + 1e-6, controls.distEnd);
  const effClipStart = Math.max(
    0,
    Math.min(controls.clipStart, controls.clipEnd - 1e-6)
  );
  const effClipEnd = Math.min(
    1,
    Math.max(effClipStart + 1e-6, controls.clipEnd)
  );
  const effForceKill = !!controls.forceKill;
  const effDebugTint = !!controls.debugTint;

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

  // Live-sync Leva → uniforms
  useEffect(() => {
    uniforms.uDF_Enable.value = effEnabled ? 1.0 : 0.0;
  }, [effEnabled]);
  useEffect(() => {
    uniforms.uDF_DistStart.value = effDistStart;
  }, [effDistStart]);
  useEffect(() => {
    uniforms.uDF_DistEnd.value = effDistEnd;
  }, [effDistEnd]);
  useEffect(() => {
    uniforms.uDF_ClipStart.value = effClipStart;
  }, [effClipStart]);
  useEffect(() => {
    uniforms.uDF_ClipEnd.value = effClipEnd;
  }, [effClipEnd]);
  useEffect(() => {
    uniforms.uDF_ForceKill.value = effForceKill ? 1.0 : 0.0;
  }, [effForceKill]);
  useEffect(() => {
    uniforms.uDF_DebugTint.value = effDebugTint ? 1.0 : 0.0;
  }, [effDebugTint]);

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

  function getDepthMat(srcMat) {
    if (depthMatCache.current.has(srcMat))
      return depthMatCache.current.get(srcMat);
    const m = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    m.skinning = !!srcMat?.skinning;
    m.morphTargets = !!srcMat?.morphTargets;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        "varying float df_vViewDist;\n" +
        shader.vertexShader.replace(
          "#include <project_vertex>",
          `
#include <project_vertex>
vec4 df_mv = modelViewMatrix * vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  df_mv = modelViewMatrix * ( instanceMatrix * vec4( transformed, 1.0 ) );
#endif
df_vViewDist = length(df_mv.xyz);
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
      m.needsUpdate = true;
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
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        "varying float df_vViewDist;\n" +
        shader.vertexShader.replace(
          "#include <project_vertex>",
          `
#include <project_vertex>
vec4 df_mv = modelViewMatrix * vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  df_mv = modelViewMatrix * ( instanceMatrix * vec4( transformed, 1.0 ) );
#endif
df_vViewDist = length(df_mv.xyz);
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
      m.needsUpdate = true;
    };
    distMatCache.current.set(srcMat, m);
    return m;
  }

  // ---------- patcher ----------
  const patchMaterial = (mat, mesh) => {
    if (!effEnabled || !mat || patched.current.has(mat)) return;

    if (
      mat.isShaderMaterial ||
      mat.isPointsMaterial ||
      mat.isLineMaterial ||
      mat.isLineBasicMaterial
    )
      return;

    mat.fog = true; // helps some variants expose fog-related chunks

    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      prev?.(shader);
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader =
        "varying float df_vViewDist;\n" +
        shader.vertexShader.replace(
          "#include <project_vertex>",
          `
#include <project_vertex>
vec4 df_mv = modelViewMatrix * vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  df_mv = modelViewMatrix * ( instanceMatrix * vec4( transformed, 1.0 ) );
#endif
df_vViewDist = length(df_mv.xyz);
`
        );

      shader.fragmentShader =
        "varying float df_vViewDist;\n" +
        GLSL_SHARED +
        "\n" +
        insertDiscardBlock(shader.fragmentShader);

      mat.needsUpdate = true;
    };

    if (mesh) {
      mesh.customDepthMaterial = getDepthMat(mat);
      mesh.customDistanceMaterial = getDistanceMat(mat);
    }

    patched.current.add(mat);
    mat.needsUpdate = true;

    stats.current.count++;
    const t = mat.type || "UnknownMaterial";
    stats.current.byType.set(t, (stats.current.byType.get(t) || 0) + 1);
  };

  // Traverse & patch continuously (only affects new/unseen materials after first pass)
  useFrame(() => {
    if (!effEnabled) return;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) patchMaterial(m, o);
    });

    if (!didLog.current && stats.current.count > 0) {
      didLog.current = true;
      const breakdown = [...stats.current.byType.entries()]
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      console.info(
        `[DistanceFade] patched materials: ${stats.current.count} (${breakdown})`
      );
    }
  });

  // Cleanup
  useEffect(() => {
    return () => {
      patched.current = new WeakSet();
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

  return null;
}
