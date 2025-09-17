// src/components/UnifiedCrystalClusters.jsx
import React, { forwardRef, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useFrame, useThree } from "@react-three/fiber";

const GLB_A = "/models/magicPlantsAndCrystal/CrystalCluster.glb"; // A
const GLB_B = "/models/magicPlantsAndCrystal/CrystalCluster2.glb"; // B
const GLB_C = "/models/magicPlantsAndCrystal/CrystalCluster4.glb"; // C

const COUNT_A = 15;
const COUNT_B = 34;
const COUNT_C = 16;

const d2r = (deg) => (deg * Math.PI) / 180;

// -----------------------------
// BAKED TRANSFORMS (from files)
// -----------------------------

// A
const BAKED_A = [
  {
    px: -2.6,
    py: -4.55,
    pz: -2.02,
    rx: 0.0,
    ry: -158.1,
    rz: 0.0,
    s: 0.15,
    sy: 1.0,
  },
  {
    px: -2.6,
    py: -4.57,
    pz: -2.06,
    rx: 0.0,
    ry: 114.4,
    rz: 0.0,
    s: 0.1,
    sy: 1.0,
  },
  {
    px: -1.01,
    py: -4.54,
    pz: -2.52,
    rx: 0.0,
    ry: -16.8,
    rz: 3.4,
    s: 0.13,
    sy: 1.0,
  },
  {
    px: -2.46,
    py: -4.64,
    pz: -1.93,
    rx: 0.0,
    ry: 180.0,
    rz: 0.0,
    s: 0.12,
    sy: 1.0,
  },
  {
    px: -2.36,
    py: -4.64,
    pz: -1.72,
    rx: 0.0,
    ry: 180.0,
    rz: 0.0,
    s: 0.132,
    sy: 1.0,
  },
  {
    px: -2.44,
    py: -4.51,
    pz: -1.7,
    rx: 0.0,
    ry: -60.6,
    rz: 0.0,
    s: 0.114,
    sy: 1.0,
  },
  {
    px: -2.57,
    py: -4.59,
    pz: -2.05,
    rx: 0.0,
    ry: 97.6,
    rz: 0.0,
    s: 0.08,
    sy: 1.0,
  },
  {
    px: -2.4,
    py: -4.61,
    pz: -1.46,
    rx: -10.1,
    ry: 3.4,
    rz: 0.0,
    s: 0.15,
    sy: 1.0,
  },
  {
    px: -2.37,
    py: -4.6,
    pz: -1.65,
    rx: 0.0,
    ry: 0.0,
    rz: 0.0,
    s: 0.06,
    sy: 1.0,
  },
  {
    px: -2.37,
    py: -4.6,
    pz: -1.6,
    rx: 0.0,
    ry: 180.0,
    rz: -6.7,
    s: 0.09,
    sy: 1.0,
  },
  {
    px: -2.37,
    py: -4.6,
    pz: -1.54,
    rx: 0.0,
    ry: 151.4,
    rz: 0.0,
    s: 0.114,
    sy: 1.0,
  },
  {
    px: -2.28,
    py: -4.69,
    pz: -1.62,
    rx: 0.0,
    ry: 180.0,
    rz: -3.4,
    s: 0.09,
    sy: 1.0,
  },
  {
    px: -2.6,
    py: -4.5,
    pz: -2.99,
    rx: 0.0,
    ry: -23.8,
    rz: 0.0,
    s: 0.067,
    sy: 1.0,
  },
  {
    px: -2.64,
    py: -4.56,
    pz: -2.25,
    rx: -6.7,
    ry: 107.7,
    rz: 0.0,
    s: 0.16,
    sy: 1.0,
  },
  {
    px: -2.58,
    py: -4.23,
    pz: -3.47,
    rx: 0.0,
    ry: -36.0,
    rz: 0.0,
    s: 0.14,
    sy: 1.0,
  },
];

// B
const BAKED_B = [
  { px: -2.32, py: -4.66, pz: -1.52, ry: 77.4, s: 0.077 },
  { px: -2.48, py: -4.71, pz: -1.97, ry: 30.7, s: 0.041 },
  { px: -2.23, py: -4.8, pz: -1.69, ry: 0.0, s: 0.068 },
  { px: -2.52, py: -4.62, pz: -2.22, ry: -88.3, s: 0.07 },
  { px: -0.98, py: -4.31, pz: -3.0, ry: -3.4, s: 0.079 },
  { px: -0.99, py: -4.28, pz: -0.19, ry: -16.8, s: 0.128 },
  { px: -1.03, py: -4.54, pz: -2.33, ry: 118.2, s: 0.05 },
  { px: -2.51, py: -4.26, pz: -3.5, ry: 54.6, s: 0.097 },
  { px: -2.54, py: -4.22, pz: -3.39, ry: -180.0, s: 0.077 },
  { px: -2.84, py: -4.59, pz: -2.98, ry: -53.8, s: 0.047 },
  { px: -2.56, py: -4.59, pz: -2.98, ry: -53.8, s: 0.047 },
  { px: -1.02, py: -4.42, pz: -3.14, ry: 11.7, s: 0.072 },
  { px: -2.04, py: -4.47, pz: -3.47, ry: 180.0, s: 0.067 },
  { px: -2.0, py: -4.48, pz: -3.49, ry: 86.6, s: 0.052 },
  { px: -2.45, py: -4.7, pz: -2.28, ry: 134.6, s: 0.052 },
  { px: -1.383, py: -4.841, pz: -1.92, ry: 137.9, s: 0.065 },
  { px: -2.449, py: -4.542, pz: -1.766, ry: 0.0, s: 0.102 },
  { px: -1.34, py: -4.72, pz: -1.813, ry: -47.1, s: 0.09 },
  { px: -1.663, py: -4.76, pz: -1.813, ry: 154.8, s: 0.08 },
  { px: -1.215, py: -4.767, pz: -1.86, ry: 128.1, s: 0.084 },
  { px: -2.49, py: -4.73, pz: -2.953, ry: 103.4, s: 0.074 },
  { px: -1.046, py: -4.561, pz: -2.467, ry: 118.6, s: 0.084 },
  { px: -0.822, py: -4.348, pz: -2.49, ry: -84.1, s: 0.086 },
  { px: -1.012, py: -4.36, pz: -2.888, ry: -168.2, s: 0.112 },
  { px: -1.047, py: -4.416, pz: -3.0, ry: 0.0, s: 0.107 },
  { px: -1.944, py: -4.7, pz: -1.92, ry: -32.9, s: 0.07 },
  { px: -2.48, py: -4.62, pz: -2.18, ry: -63.9, s: 0.067 },
  { px: -0.991, py: -4.72, pz: -2.075, ry: 0.0, s: 0.086 },
  /* 28 missing in source: will fallback */
  { px: -0.986, py: -4.35, pz: -3.058, ry: -155.2, s: 0.105 },
  { px: -1.014, py: -4.336, pz: -2.972, ry: -107.6, s: 0.099 },
  { px: -0.991, py: -4.353, pz: -3.271, ry: -87.1, s: 0.105 },
  { px: -1.608, py: -4.653, pz: -3.753, ry: 0.0, s: 0.123 },
  { px: -1.327, py: -4.598, pz: -1.627, ry: 20.2, s: 0.07 },
  { px: -1.048, py: -4.579, pz: -2.374, s: 0.079 },
];

// C
const FALLBACK_C = { px: -2.0, py: -4.0, pz: -2.0, ry: 0.0, s: 0.15 };
const BAKED_C = [
  { px: -2.47, py: -4.56, pz: -1.5, ry: -30.4, s: 0.18 },
  { px: -2.22, py: -4.67, pz: -1.62, ry: 13.4, s: 0.13 },
  { px: -2.8, py: -4.47, pz: -2.9, ry: 0.0, s: 0.18 },
  { px: -2.48, py: -4.46, pz: -3.6, ry: 0.0, s: 0.12 },
  { px: -2.8, py: -4.48, pz: -3.121, ry: 0.0, s: 0.14 },
  { px: -2.6, py: -4.5, pz: -1.47, ry: -144.7, s: 0.16 },
  { px: -2.7, py: -4.53, pz: -2.2, ry: -30.2, s: 0.17 },
  { px: -0.97, py: -4.28, pz: -2.8, ry: 180.0, s: 0.14 },
  { px: -1.271, py: -4.542, pz: -1.626, ry: -50.5, s: 0.15 },
  { px: -1.551, py: -4.8, pz: -1.766, ry: -70.7, s: 0.2 },
  { px: -1.16, py: -4.77, pz: -1.86, ry: -33.7, s: 0.18 },
  { px: -1.16, py: -4.69, pz: -3.73, ry: -33.7, s: 0.18 },
  { px: -1.1, py: -4.59, pz: -2.37, ry: -33.7, s: 0.18 },
  { px: -2.39, py: -4.75, pz: -3.5, ry: -33.7, s: 0.19 },
  { px: -1.5, py: -4.73, pz: -3.68, ry: 0.0, s: 0.15 },
  { px: -2.94, py: -4.22, pz: -3.26, ry: 0.0, s: 0.12 },
];

// ---------------------------------------------
// Unified material (same controls/shader for A/B/C)
// ---------------------------------------------
function useUnifiedCrystalMaterial(unified) {
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      transmission: 1.0,
      thickness: unified.U_thickness,
      ior: unified.U_ior,
      roughness: unified.U_roughness,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      specularIntensity: 1.0,
      color: new THREE.Color("#ffffff"),
      attenuationColor: new THREE.Color("#ffffff"),
      attenuationDistance: unified.U_attenuationDistance,
      transparent: false,
      opacity: 1.0,
      toneMapped: true,
      flatShading: true,
      side: THREE.FrontSide,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: unified.U_emissiveIntensity,
    });

    m.onBeforeCompile = (shader) => {
      // object-space Y range for local gradient
      shader.uniforms.uObjMinY = { value: 0.0 };
      shader.uniforms.uObjMaxY = { value: 1.0 };

      // unified gradient + boosts
      shader.uniforms.uU_ColorA = { value: new THREE.Color(unified.U_colorA) };
      shader.uniforms.uU_ColorB = { value: new THREE.Color(unified.U_colorB) };
      shader.uniforms.uU_Mid = { value: unified.U_mid };
      shader.uniforms.uU_Soft = { value: unified.U_softness };
      shader.uniforms.uU_BottomSatBoost = { value: unified.U_bottomSatBoost };
      shader.uniforms.uU_BottomEmissiveBoost = {
        value: unified.U_bottomEmissiveBoost,
      };
      shader.uniforms.uU_BottomFresnelBoost = {
        value: unified.U_bottomFresnelBoost,
      };
      shader.uniforms.uU_BottomFresnelPower = {
        value: unified.U_bottomFresnelPower,
      };
      shader.uniforms.uU_EmissiveIntensity = {
        value: unified.U_emissiveIntensity,
      };

      // Shine
      shader.uniforms.uU_ReflectBoost = { value: unified.U_reflectBoost };
      shader.uniforms.uU_ReflectPower = { value: unified.U_reflectPower };
      shader.uniforms.uU_RimBoost = { value: unified.U_rimBoost };
      shader.uniforms.uU_RimPower = { value: unified.U_rimPower };

      // Uniformization (fade out global instance-height bias on hover)
      shader.uniforms.uU_UniformFactor = { value: 0.0 };
      shader.uniforms.uU_InstBiasAmp = { value: 0.6 };

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform float uObjMinY, uObjMaxY;
        varying float vH;           // local per-vertex 0..1
        attribute float aInstY01;   // GLOBAL instance Y 0..1 (instanced attribute)
        varying float vInstY01;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vec3 pos = transformed;

        #ifdef USE_INSTANCING
          mat4 MI = modelMatrix * instanceMatrix;
          vec4 wp = MI * vec4(pos, 1.0);
          float ty = MI[3].y;
          float sy = length(vec3(MI[1].x, MI[1].y, MI[1].z));
          float yMin = ty + sy * uObjMinY;
          float yMax = ty + sy * uObjMaxY;
        #else
          mat4 MI = modelMatrix;
          vec4 wp = MI * vec4(pos, 1.0);
          float ty = MI[3].y;
          float sy = length(vec3(MI[1].x, MI[1].y, MI[1].z));
          float yMin = ty + sy * uObjMinY;
          float yMax = ty + sy * uObjMaxY;
        #endif

        vH = clamp((wp.y - yMin) / max(1e-5, (yMax - yMin)), 0.0, 1.0);
        vInstY01 = aInstY01;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform vec3  uU_ColorA;
        uniform vec3  uU_ColorB;
        uniform float uU_Mid, uU_Soft;
        uniform float uU_BottomSatBoost;
        uniform float uU_BottomEmissiveBoost;
        uniform float uU_BottomFresnelBoost;
        uniform float uU_BottomFresnelPower;
        uniform float uU_EmissiveIntensity;

        uniform float uU_ReflectBoost;
        uniform float uU_ReflectPower;
        uniform float uU_RimBoost;
        uniform float uU_RimPower;

        uniform float uU_UniformFactor; // 0..1
        uniform float uU_InstBiasAmp;

        varying float vH;
        varying float vInstY01;

        vec3 boostSaturation(vec3 c, float amount) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float f = clamp(1.0 + amount, 0.0, 2.5);
          return mix(vec3(l), c, f);
        }
        `
      );

      const hook = shader.fragmentShader.includes(
        "#include <tonemapping_fragment>"
      )
        ? "#include <tonemapping_fragment>"
        : "#include <colorspace_fragment>";

      shader.fragmentShader = shader.fragmentShader.replace(
        hook,
        `
        // Local split always on
        float tLocal = smoothstep(uU_Mid - uU_Soft, uU_Mid + uU_Soft, vH);

        // Global instance-height bias (fades out as uU_UniformFactor→1)
        float bias = (vInstY01 - 0.5) * uU_InstBiasAmp * (1.0 - clamp(uU_UniformFactor, 0.0, 1.0));

        float tMix = clamp(tLocal + bias, 0.0, 1.0);
        vec3 grad = mix(uU_ColorA, uU_ColorB, tMix);

        // Local bottom emphasis
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uU_BottomSatBoost * bottom);

        // Base tint
        gl_FragColor.rgb *= grad;

        // Fresnel + bottom boost
        vec3 N = normalize(normal);
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(N, V)), 1.3);
        float fresBoost = 1.0 + uU_BottomFresnelBoost * pow(bottom, uU_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // Subtle emissive near bottom
        float eBoost = 1.0 + uU_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uU_EmissiveIntensity * eBoost;

        // === SHINE ===
        float fresRef = pow(1.0 - abs(dot(N, V)), max(0.0001, uU_ReflectPower));
        #ifdef USE_ENVMAP
          vec3 R = reflect(-V, N);
          vec3 envBoost = vec3(0.0);
          #ifdef ENVMAP_TYPE_CUBE_UV
            envBoost = envMapIntensity * textureCubeUV(envMap, R, 0.0).rgb;
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, envBoost, clamp(uU_ReflectBoost * fresRef, 0.0, 1.0));
        #endif
        float rim = pow(1.0 - abs(dot(N, V)), max(0.0001, uU_RimPower));
        gl_FragColor.rgb += rim * uU_RimBoost;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    m.customProgramCacheKey = () => "UnifiedCrystal_uU_v1";
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live updates from unified controls
  useEffect(() => {
    if (!mat) return;
    mat.ior = unified.U_ior;
    mat.thickness = unified.U_thickness;
    mat.attenuationDistance = unified.U_attenuationDistance;
    mat.roughness = unified.U_roughness;
    mat.emissiveIntensity = unified.U_emissiveIntensity;
    mat.envMapIntensity = unified.U_envIntensity;

    const s = mat.userData.shader;
    if (s) {
      s.uniforms.uU_ColorA.value.set(unified.U_colorA);
      s.uniforms.uU_ColorB.value.set(unified.U_colorB);
      s.uniforms.uU_Mid.value = unified.U_mid;
      s.uniforms.uU_Soft.value = unified.U_softness;
      s.uniforms.uU_BottomSatBoost.value = unified.U_bottomSatBoost;
      s.uniforms.uU_BottomEmissiveBoost.value = unified.U_bottomEmissiveBoost;
      s.uniforms.uU_BottomFresnelBoost.value = unified.U_bottomFresnelBoost;
      s.uniforms.uU_BottomFresnelPower.value = unified.U_bottomFresnelPower;
      s.uniforms.uU_EmissiveIntensity.value = unified.U_emissiveIntensity;

      s.uniforms.uU_ReflectBoost.value = unified.U_reflectBoost;
      s.uniforms.uU_ReflectPower.value = unified.U_reflectPower;
      s.uniforms.uU_RimBoost.value = unified.U_rimBoost;
      s.uniforms.uU_RimPower.value = unified.U_rimPower;
    }
  }, [mat, unified]);

  return mat;
}

// ---------------------------------------------
// Component
// ---------------------------------------------
export default forwardRef(function UnifiedCrystalClusters(props, ref) {
  // Load models
  const { scene: sceneA } = useGLTF(GLB_A);
  const { scene: sceneB } = useGLTF(GLB_B);
  const { scene: sceneC } = useGLTF(GLB_C);

  // Refs for each instanced mesh
  const meshARef = useRef();
  const meshBRef = useRef();
  const meshCRef = useRef();

  // -------------------------
  // Unified Leva controls
  // -------------------------
  const unifiedGradient = useControls("Crystals / Gradient", {
    U_colorA: { value: "#0099d1ff", label: "Bottom Color (A)" },
    U_colorB: { value: "#bc00f5ff", label: "Top Color (B)" },
    U_mid: {
      value: 0.38,
      min: 0,
      max: 1,
      step: 0.001,
      label: "Blend Midpoint",
    },
    U_softness: {
      value: 0.44,
      min: 0,
      max: 0.5,
      step: 0.001,
      label: "Blend Softness",
    },
    U_bottomSatBoost: {
      value: 0.1,
      min: 0,
      max: 1.5,
      step: 0.01,
      label: "Bottom Saturation +",
    },
    U_bottomEmissiveBoost: {
      value: 2.0,
      min: 0,
      max: 2,
      step: 0.01,
      label: "Bottom Glow +",
    },
    U_bottomFresnelBoost: {
      value: 3.0,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Bottom Fresnel +",
    },
    U_bottomFresnelPower: {
      value: 0.5,
      min: 0.5,
      max: 6,
      step: 0.1,
      label: "Bottom Fresnel Falloff",
    },
  });

  const unifiedGlass = useControls("Crystals / Glass", {
    U_ior: { value: 1.5, min: 1.0, max: 2.333, step: 0.001 },
    U_thickness: { value: 2.0, min: 0, max: 10, step: 0.01 },
    U_attenuationDistance: { value: 12.0, min: 0.1, max: 200, step: 0.1 },
    U_roughness: { value: 0.2, min: 0, max: 1, step: 0.001 },
    U_emissiveIntensity: { value: 0.3, min: 0, max: 2, step: 0.01 },
  });

  const unifiedShine = useControls("Crystals / Shine", {
    U_reflectBoost: {
      value: 1.2,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Reflect Boost",
    },
    U_reflectPower: {
      value: 2.0,
      min: 1,
      max: 6,
      step: 0.1,
      label: "Reflect Power",
    },
    U_rimBoost: { value: 1.6, min: 0, max: 3, step: 0.01, label: "Rim Boost" },
    U_rimPower: { value: 1.4, min: 1, max: 6, step: 0.1, label: "Rim Power" },
    U_envIntensity: {
      value: 2.0,
      min: 0,
      max: 8,
      step: 0.1,
      label: "EnvMap Intensity",
    },
  });

  const unifiedHover = useControls("Crystals / Hover Colors", {
    U_hoverEnabled: { value: true, label: "Enabled" },
    U_hoverEase: {
      value: 0.2,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: "Ease In (1/s)",
    },
    U_cycleTime: {
      value: 10,
      min: 0.2,
      max: 10,
      step: 0.05,
      label: "Cycle Step (s)",
    },
    U_coolTime: {
      value: 5.0,
      min: 0.05,
      max: 20,
      step: 0.05,
      label: "Cool Back (s)",
    },

    Pair_A_Bottom: { value: "#2ec5ff", label: "A Bottom" },
    Pair_A_Top: { value: "#b000ff", label: "A Top" },
    Pair_B_Bottom: { value: "#00ffc8", label: "B Bottom" },
    Pair_B_Top: { value: "#0078ff", label: "B Top" },
    Pair_C_Bottom: { value: "#ffd44a", label: "C Bottom" },
    Pair_C_Top: { value: "#ff3a7c", label: "C Top" },
  });

  // Bundle to pass to material hook
  const unified = {
    ...unifiedGradient,
    ...unifiedGlass,
    ...unifiedShine,
    ...unifiedHover,
    U_envIntensity: unifiedShine.U_envIntensity,
  };

  // Three materials (same shader/controls, separate instances so each can have its own bbox uniforms)
  const materialA = useUnifiedCrystalMaterial(unified);
  const materialB = useUnifiedCrystalMaterial(unified);
  const materialC = useUnifiedCrystalMaterial(unified);

  // -------------------------
  // Per-model instance controls (kept separate)
  // -------------------------
  // A: has rx/ry/rz + s + sy
  const instanceA = useControls(
    "Crystal A / Instances",
    useMemo(() => {
      const schema = {};
      for (let i = 0; i < COUNT_A; i++) {
        const d = BAKED_A[i] ?? {
          px: -2,
          py: -4,
          pz: -2,
          rx: 0,
          ry: 0,
          rz: 0,
          s: 1,
          sy: 1,
        };
        schema[`A / Instance ${String(i + 1).padStart(2, "0")}`] = folder(
          {
            [`A_pX_${i}`]: {
              value: d.px,
              min: -20,
              max: 20,
              step: 0.001,
              label: "x",
            },
            [`A_pY_${i}`]: {
              value: d.py,
              min: -20,
              max: 20,
              step: 0.001,
              label: "y",
            },
            [`A_pZ_${i}`]: {
              value: d.pz,
              min: -20,
              max: 20,
              step: 0.001,
              label: "z",
            },
            [`A_rX_${i}`]: {
              value: d.rx,
              min: -180,
              max: 180,
              step: 0.1,
              label: "rotX°",
            },
            [`A_rY_${i}`]: {
              value: d.ry,
              min: -180,
              max: 180,
              step: 0.1,
              label: "rotY°",
            },
            [`A_rZ_${i}`]: {
              value: d.rz,
              min: -180,
              max: 180,
              step: 0.1,
              label: "rotZ°",
            },
            [`A_s_${i}`]: {
              value: d.s,
              min: 0.01,
              max: 5,
              step: 0.001,
              label: "scale",
            },
            [`A_sy_${i}`]: {
              value: d.sy ?? 1.0,
              min: 0.1,
              max: 5,
              step: 0.001,
              label: "y-scale",
            },
          },
          { collapsed: true }
        );
      }
      return schema;
    }, [])
  );

  // B: has ry + s
  const instanceB = useControls(
    "Crystal B / Instances",
    useMemo(() => {
      const schema = {};
      for (let i = 0; i < COUNT_B; i++) {
        const d = BAKED_B[i] ?? { px: -2, py: -4, pz: -2, ry: 0, s: 0.5 };
        schema[`B / Instance ${String(i + 1).padStart(2, "0")}`] = folder(
          {
            [`B_pX_${i}`]: {
              value: d.px,
              min: -3,
              max: 3,
              step: 0.001,
              label: "x",
            },
            [`B_pY_${i}`]: {
              value: d.py,
              min: -6,
              max: -4,
              step: 0.001,
              label: "y",
            },
            [`B_pZ_${i}`]: {
              value: d.pz,
              min: -4,
              max: 4,
              step: 0.001,
              label: "z",
            },
            [`B_rY_${i}`]: {
              value: d.ry ?? 0,
              min: -180,
              max: 180,
              step: 0.1,
              label: "rotY°",
            },
            [`B_s_${i}`]: {
              value: d.s,
              min: 0.01,
              max: 1,
              step: 0.001,
              label: "scale",
            },
          },
          { collapsed: true }
        );
      }
      return schema;
    }, [])
  );

  // C: has ry + s
  const instanceC = useControls(
    "Crystal C / Instances",
    useMemo(() => {
      const schema = {};
      for (let i = 0; i < COUNT_C; i++) {
        const d = BAKED_C[i] ?? FALLBACK_C;
        schema[`C / Instance ${String(i + 1).padStart(2, "0")}`] = folder(
          {
            [`C_pX_${i}`]: {
              value: d.px,
              min: -3,
              max: 3,
              step: 0.001,
              label: "x",
            },
            [`C_pY_${i}`]: {
              value: d.py,
              min: -6,
              max: -4,
              step: 0.001,
              label: "y",
            },
            [`C_pZ_${i}`]: {
              value: d.pz,
              min: -4,
              max: 1,
              step: 0.001,
              label: "z",
            },
            [`C_rY_${i}`]: {
              value: d.ry,
              min: -180,
              max: 180,
              step: 0.1,
              label: "rotY°",
            },
            [`C_s_${i}`]: {
              value: d.s,
              min: 0.01,
              max: 5,
              step: 0.001,
              label: "scale",
            },
          },
          { collapsed: true }
        );
      }
      return schema;
    }, [])
  );

  // -------------------------
  // Extract geometries (Y-up)
  // -------------------------
  const geoA = useMemo(() => {
    if (!sceneA) return null;
    let g = null;
    sceneA.traverse((n) => {
      if (!g && n.isMesh && n.geometry) g = n.geometry.clone();
    });
    if (!g) return null;
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(+Math.PI / 2));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }, [sceneA]);

  const geoB = useMemo(() => {
    if (!sceneB) return null;
    let g = null;
    sceneB.traverse((n) => {
      if (!g && n.isMesh && n.geometry) g = n.geometry.clone();
    });
    if (!g) return null;
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(+Math.PI / 2));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }, [sceneB]);

  const geoC = useMemo(() => {
    if (!sceneC) return null;
    let g = null;
    sceneC.traverse((n) => {
      if (!g && n.isMesh && n.geometry) g = n.geometry.clone();
    });
    if (!g) return null;
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(+Math.PI / 2));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }, [sceneC]);

  const baseRadiusA = geoA?.boundingSphere?.radius || 1;
  const baseRadiusB = geoB?.boundingSphere?.radius || 1;
  const baseRadiusC = geoC?.boundingSphere?.radius || 1;

  // Seed object Y bounds to each material (separate instances avoids conflicts)
  useEffect(() => {
    if (geoA && materialA?.userData?.shader) {
      materialA.userData.shader.uniforms.uObjMinY.value =
        geoA.boundingBox.min.y;
      materialA.userData.shader.uniforms.uObjMaxY.value =
        geoA.boundingBox.max.y;
    }
    if (geoB && materialB?.userData?.shader) {
      materialB.userData.shader.uniforms.uObjMinY.value =
        geoB.boundingBox.min.y;
      materialB.userData.shader.uniforms.uObjMaxY.value =
        geoB.boundingBox.max.y;
    }
    if (geoC && materialC?.userData?.shader) {
      materialC.userData.shader.uniforms.uObjMinY.value =
        geoC.boundingBox.min.y;
      materialC.userData.shader.uniforms.uObjMaxY.value =
        geoC.boundingBox.max.y;
    }
  }, [geoA, geoB, geoC, materialA, materialB, materialC]);

  // -------------------------
  // Write instance matrices + aInstY01 (per mesh)
  // -------------------------
  useEffect(() => {
    const mesh = meshARef.current;
    if (!mesh || !geoA) return;

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler(0, 0, 0, "XYZ");

    const worldY = new Float32Array(COUNT_A);
    for (let i = 0; i < COUNT_A; i++) {
      const px = instanceA[`A_pX_${i}`],
        py = instanceA[`A_pY_${i}`],
        pz = instanceA[`A_pZ_${i}`];
      const rx = d2r(instanceA[`A_rX_${i}`]),
        ry = d2r(instanceA[`A_rY_${i}`]),
        rz = d2r(instanceA[`A_rZ_${i}`]);
      const uni = instanceA[`A_s_${i}`];
      const sy = instanceA[`A_sy_${i}`];

      p.set(px, py, pz);
      e.set(rx, ry, rz);
      q.setFromEuler(e);
      s.set(uni, uni * sy, uni);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      worldY[i] = py;
    }
    mesh.count = COUNT_A;
    mesh.instanceMatrix.needsUpdate = true;

    let minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < COUNT_A; i++) {
      if (worldY[i] < minY) minY = worldY[i];
      if (worldY[i] > maxY) maxY = worldY[i];
    }
    const invSpan = 1.0 / Math.max(1e-6, maxY - minY);

    const instY01 = new Float32Array(COUNT_A);
    for (let i = 0; i < COUNT_A; i++) instY01[i] = (worldY[i] - minY) * invSpan;

    mesh.geometry.setAttribute(
      "aInstY01",
      new THREE.InstancedBufferAttribute(instY01, 1)
    );
    mesh.geometry.attributes.aInstY01.needsUpdate = true;
  }, [instanceA, geoA]);

  useEffect(() => {
    const mesh = meshBRef.current;
    if (!mesh || !geoB) return;

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler(0, 0, 0, "XYZ");

    const worldY = new Float32Array(COUNT_B);
    for (let i = 0; i < COUNT_B; i++) {
      const px = instanceB[`B_pX_${i}`],
        py = instanceB[`B_pY_${i}`],
        pz = instanceB[`B_pZ_${i}`];
      const ry = d2r(instanceB[`B_rY_${i}`] ?? 0);
      const uni = instanceB[`B_s_${i}`];

      p.set(px, py, pz);
      e.set(0, ry, 0);
      q.setFromEuler(e);
      s.set(uni, uni, uni);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      worldY[i] = py;
    }
    mesh.count = COUNT_B;
    mesh.instanceMatrix.needsUpdate = true;

    let minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < COUNT_B; i++) {
      if (worldY[i] < minY) minY = worldY[i];
      if (worldY[i] > maxY) maxY = worldY[i];
    }
    const invSpan = 1.0 / Math.max(1e-6, maxY - minY);

    const instY01 = new Float32Array(COUNT_B);
    for (let i = 0; i < COUNT_B; i++) instY01[i] = (worldY[i] - minY) * invSpan;

    mesh.geometry.setAttribute(
      "aInstY01",
      new THREE.InstancedBufferAttribute(instY01, 1)
    );
    mesh.geometry.attributes.aInstY01.needsUpdate = true;
  }, [instanceB, geoB]);

  useEffect(() => {
    const mesh = meshCRef.current;
    if (!mesh || !geoC) return;

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler(0, 0, 0, "XYZ");

    const worldY = new Float32Array(COUNT_C);
    for (let i = 0; i < COUNT_C; i++) {
      const d = BAKED_C[i] ?? FALLBACK_C;
      const px = instanceC[`C_pX_${i}`] ?? d.px;
      const py = instanceC[`C_pY_${i}`] ?? d.py;
      const pz = instanceC[`C_pZ_${i}`] ?? d.pz;
      const ry = d2r(instanceC[`C_rY_${i}`] ?? d.ry);
      const uni = instanceC[`C_s_${i}`] ?? d.s;

      p.set(px, py, pz);
      e.set(0, ry, 0);
      q.setFromEuler(e);
      s.set(uni, uni, uni);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      worldY[i] = py;
    }
    mesh.count = COUNT_C;
    mesh.instanceMatrix.needsUpdate = true;

    let minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < COUNT_C; i++) {
      if (worldY[i] < minY) minY = worldY[i];
      if (worldY[i] > maxY) maxY = worldY[i];
    }
    const invSpan = 1.0 / Math.max(1e-6, maxY - minY);

    const instY01 = new Float32Array(COUNT_C);
    for (let i = 0; i < COUNT_C; i++) instY01[i] = (worldY[i] - minY) * invSpan;

    mesh.geometry.setAttribute(
      "aInstY01",
      new THREE.InstancedBufferAttribute(instY01, 1)
    );
    mesh.geometry.attributes.aInstY01.needsUpdate = true;
  }, [instanceC, geoC]);

  // -------------------------
  // Global hover logic (applies to all three simultaneously)
  // -------------------------
  const baseA = useRef(new THREE.Color(unifiedGradient.U_colorA));
  const baseB = useRef(new THREE.Color(unifiedGradient.U_colorB));
  useEffect(() => {
    baseA.current.set(unifiedGradient.U_colorA);
  }, [unifiedGradient.U_colorA]);
  useEffect(() => {
    baseB.current.set(unifiedGradient.U_colorB);
  }, [unifiedGradient.U_colorB]);

  const { camera, pointer } = useThree();
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpS = useMemo(() => new THREE.Vector3(), []);
  const camRight = useMemo(() => new THREE.Vector3(), []);
  const ndcCenter = useMemo(() => new THREE.Vector3(), []);
  const ndcSample = useMemo(() => new THREE.Vector3(), []);
  const sampleWorld = useMemo(() => new THREE.Vector3(), []);

  const hoverMixRef = useRef(0);
  const segIdxRef = useRef(0);
  const segTRef = useRef(0);
  const prevHoveredRef = useRef(false);

  const A_botCol = useRef(new THREE.Color(unifiedHover.Pair_A_Bottom));
  const A_topCol = useRef(new THREE.Color(unifiedHover.Pair_A_Top));
  const B_botCol = useRef(new THREE.Color(unifiedHover.Pair_B_Bottom));
  const B_topCol = useRef(new THREE.Color(unifiedHover.Pair_B_Top));
  const C_botCol = useRef(new THREE.Color(unifiedHover.Pair_C_Bottom));
  const C_topCol = useRef(new THREE.Color(unifiedHover.Pair_C_Top));
  useEffect(() => {
    A_botCol.current.set(unifiedHover.Pair_A_Bottom);
  }, [unifiedHover.Pair_A_Bottom]);
  useEffect(() => {
    A_topCol.current.set(unifiedHover.Pair_A_Top);
  }, [unifiedHover.Pair_A_Top]);
  useEffect(() => {
    B_botCol.current.set(unifiedHover.Pair_B_Bottom);
  }, [unifiedHover.Pair_B_Bottom]);
  useEffect(() => {
    B_topCol.current.set(unifiedHover.Pair_B_Top);
  }, [unifiedHover.Pair_B_Top]);
  useEffect(() => {
    C_botCol.current.set(unifiedHover.Pair_C_Bottom);
  }, [unifiedHover.Pair_C_Bottom]);
  useEffect(() => {
    C_topCol.current.set(unifiedHover.Pair_C_Top);
  }, [unifiedHover.Pair_C_Top]);

  const curHoverBot = useMemo(() => new THREE.Color(), []);
  const curHoverTop = useMemo(() => new THREE.Color(), []);
  const lerpFromBot = useMemo(() => new THREE.Color(), []);
  const lerpFromTop = useMemo(() => new THREE.Color(), []);
  const targetBot = useMemo(() => new THREE.Color(), []);
  const targetTop = useMemo(() => new THREE.Color(), []);
  const outA = useMemo(() => new THREE.Color(), []);
  const outB = useMemo(() => new THREE.Color(), []);

  function getPair(i) {
    switch ((i + 3000) % 3) {
      case 0:
        return [A_botCol.current, A_topCol.current];
      case 1:
        return [B_botCol.current, B_topCol.current];
      default:
        return [C_botCol.current, C_topCol.current];
    }
  }

  // Helper to test hover on a mesh
  function anyHoveredFor(instMesh, sphereR) {
    if (!instMesh) return false;
    const count = instMesh.count ?? 0;
    camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    for (let i = 0; i < count; i++) {
      instMesh.getMatrixAt(i, tmpM);
      tmpM.decompose(tmpP, tmpQ, tmpS);
      const rWorld = sphereR * Math.max(tmpS.x, tmpS.y, tmpS.z);
      ndcCenter.copy(tmpP).project(camera);
      sampleWorld.copy(tmpP).addScaledVector(camRight, rWorld * 2.2);
      ndcSample.copy(sampleWorld).project(camera);
      const rNdc = Math.hypot(
        ndcSample.x - ndcCenter.x,
        ndcSample.y - ndcCenter.y
      );
      const dNdc = Math.hypot(pointer.x - ndcCenter.x, pointer.y - ndcCenter.y);
      if (dNdc <= rNdc) return true;
    }
    return false;
  }

  useFrame((_, dt) => {
    const sA = materialA?.userData?.shader;
    const sB = materialB?.userData?.shader;
    const sC = materialC?.userData?.shader;
    if (!sA || !sB || !sC) return;

    // Global hover across all three meshes
    const hovered =
      anyHoveredFor(meshARef.current, baseRadiusA) ||
      anyHoveredFor(meshBRef.current, baseRadiusB) ||
      anyHoveredFor(meshCRef.current, baseRadiusC);

    const wasHovered = prevHoveredRef.current;
    prevHoveredRef.current = hovered;

    // Ease in / cool down
    const easeK = 1 - Math.exp(-unifiedHover.U_hoverEase * dt);
    if (unifiedHover.U_hoverEnabled && hovered) {
      hoverMixRef.current += (1 - hoverMixRef.current) * easeK;
    } else {
      const coolRate =
        unifiedHover.U_coolTime > 0
          ? dt / Math.max(1e-3, unifiedHover.U_coolTime)
          : 1.0;
      hoverMixRef.current = Math.max(0, hoverMixRef.current - coolRate);
    }

    // Drive uniformization factor on all three materials
    const mixClamped = Math.min(1, Math.max(0, hoverMixRef.current));
    sA.uniforms.uU_UniformFactor.value = mixClamped;
    sB.uniforms.uU_UniformFactor.value = mixClamped;
    sC.uniforms.uU_UniformFactor.value = mixClamped;

    // Fully cooled → snap base palette and exit
    if (
      (!unifiedHover.U_hoverEnabled || !hovered) &&
      hoverMixRef.current <= 1e-4
    ) {
      hoverMixRef.current = 0;
      sA.uniforms.uU_ColorA.value.copy(baseA.current);
      sA.uniforms.uU_ColorB.value.copy(baseB.current);
      sB.uniforms.uU_ColorA.value.copy(baseA.current);
      sB.uniforms.uU_ColorB.value.copy(baseB.current);
      sC.uniforms.uU_ColorA.value.copy(baseA.current);
      sC.uniforms.uU_ColorB.value.copy(baseB.current);
      return;
    }

    // Color cycle during hover
    if (unifiedHover.U_hoverEnabled && hovered && !wasHovered)
      segTRef.current = 0;
    if (unifiedHover.U_hoverEnabled && hovered) {
      const dur = Math.max(0.05, unifiedHover.U_cycleTime);
      segTRef.current += dt / dur;
      if (segTRef.current >= 1.0) {
        segIdxRef.current = (segIdxRef.current + 1) % 3;
        segTRef.current -= 1.0;
      }
    }

    const t = segTRef.current;
    const tSmooth = t * t * (3 - 2 * t);
    const fromIdx = segIdxRef.current;
    const toIdx = (fromIdx + 1) % 3;

    const [fromBot, fromTop] = getPair(fromIdx);
    const [toBot, toTop] = getPair(toIdx);

    lerpFromBot.copy(fromBot);
    lerpFromTop.copy(fromTop);
    targetBot.copy(toBot);
    targetTop.copy(toTop);

    curHoverBot.copy(lerpFromBot).lerp(targetBot, tSmooth);
    curHoverTop.copy(lerpFromTop).lerp(targetTop, tSmooth);

    outA.copy(baseA.current).lerp(curHoverBot, hoverMixRef.current);
    outB.copy(baseB.current).lerp(curHoverTop, hoverMixRef.current);

    // Apply the same hovering colors to all three
    sA.uniforms.uU_ColorA.value.copy(outA);
    sA.uniforms.uU_ColorB.value.copy(outB);
    sB.uniforms.uU_ColorA.value.copy(outA);
    sB.uniforms.uU_ColorB.value.copy(outB);
    sC.uniforms.uU_ColorA.value.copy(outA);
    sC.uniforms.uU_ColorB.value.copy(outB);
  });

  // Early out if any geometry not ready
  if (!geoA || !geoB || !geoC) return null;

  return (
    <group ref={ref} name="UnifiedCrystalClusters" {...props}>
      {/* Clear separation of each model */}
      <group name="CrystalA">
        <instancedMesh
          ref={meshARef}
          args={[geoA, materialA, COUNT_A]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      </group>

      <group name="CrystalB">
        <instancedMesh
          ref={meshBRef}
          args={[geoB, materialB, COUNT_B]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      </group>

      <group name="CrystalC">
        <instancedMesh
          ref={meshCRef}
          args={[geoC, materialC, COUNT_C]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      </group>
    </group>
  );
});

useGLTF.preload(GLB_A);
useGLTF.preload(GLB_B);
useGLTF.preload(GLB_C);
