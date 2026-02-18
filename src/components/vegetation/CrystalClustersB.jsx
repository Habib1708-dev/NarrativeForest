// Crystal B only: 50 instances from baked JSON, optimized (no transmission, height-based fade)
import React, { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, button } from "leva";
import { useFrame } from "@react-three/fiber";
import { useCameraStore } from "../../state/useCameraStore";
import { useDebugStore } from "../../state/useDebugStore";

const GLB_B = "/models/magicPlantsAndCrystal/CrystalCluster2.glb";
const GLB_TALL_ROD = "/models/magicPlantsAndCrystal/TallRod.glb";

const COUNT_B = 50;
const COUNT_ROD = 12;
const CRYSTAL_Y_OFFSET = 0.04;
const CRYSTAL_SCALE_OFFSET = 0.01;

// Baked 50 Crystal B instances (position, rotationX/Y/Z in radians, scale)
const PLACED_CRYSTAL_B = [
  { id: "crystalB-01", position: [-2.7, -4.78, -2.9], rotationX: 0, rotationY: 0, rotationZ: -0.174, scale: 0.08 },
  { id: "crystalB-02", position: [-2.83, -4.77, -2.96], rotationX: 0, rotationY: 0.4, rotationZ: 0, scale: 0.09 },
  { id: "crystalB-03", position: [-2.85, -4.76, -2.9], rotationX: 0, rotationY: 0.8, rotationZ: 0, scale: 0.12 },
  { id: "crystalB-04", position: [-2.8, -4.63, -2.1], rotationX: 0, rotationY: 1.2, rotationZ: 0, scale: 0.14 },
  { id: "crystalB-05", position: [-2.7, -4.63, -2.15], rotationX: 0, rotationY: 1.6, rotationZ: 0, scale: 0.1 },
  { id: "crystalB-06", position: [-2.8, -4.65, -2.35], rotationX: 0, rotationY: 2, rotationZ: 0, scale: 0.08 },
  { id: "crystalB-07", position: [-2.8, -4.76, -2.5], rotationX: 0, rotationY: 4.575, rotationZ: 0, scale: 0.1 },
  { id: "crystalB-08", position: [-2.7, -4.71, -2.4], rotationX: 0, rotationY: 0.538, rotationZ: 0, scale: 0.08 },
  { id: "crystalB-09", position: [-2.8, -4.78, -3.2], rotationX: 0, rotationY: 0.783, rotationZ: 0, scale: 0.09 },
  { id: "crystalB-10", position: [-2.9, -4.75, -3.27], rotationX: 0, rotationY: -1.427, rotationZ: 0, scale: 0.1 },
  { id: "crystalB-11", position: [-2.2, -4.63, -3.8], rotationX: 0, rotationY: 1.235, rotationZ: 0, scale: 0.08 },
  { id: "crystalB-12", position: [-2.1, -4.65, -3.75], rotationX: 0, rotationY: 1.287, rotationZ: 0, scale: 0.1 },
  { id: "crystalB-13", position: [-2.05, -4.64, -3.8], rotationX: 0, rotationY: 1.339, rotationZ: 0, scale: 0.09 },
  { id: "crystalB-14", position: [-2.3, -4.64, -3.78], rotationX: 0, rotationY: 2, rotationZ: 0, scale: 0.1 },
  { id: "crystalB-15", position: [-2.6, -4.59, -3.65], rotationX: 0, rotationY: 2.139, rotationZ: 0, scale: 0.09 },
  { id: "crystalB-16", position: [-2.67, -4.5, -3.58], rotationX: 0, rotationY: 3.931, rotationZ: 0, scale: 0.07 },
  { id: "crystalB-17", position: [-2.38, -4.64, -3.78], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.075 },
  { id: "crystalB-18", position: [-1.95, -4.53, -4], rotationX: 0, rotationY: 0.4, rotationZ: 0, scale: 0.105 },
  { id: "crystalB-19", position: [-1.84, -4.59, -3.92], rotationX: 0, rotationY: 0.8, rotationZ: 0, scale: 0.115 },
  { id: "crystalB-20", position: [-1.66, -4.66, -4], rotationX: -0.087, rotationY: 0.939, rotationZ: 0, scale: 0.145 },
  { id: "crystalB-21", position: [-1.4, -4.7, -3.65], rotationX: 0, rotationY: 1.6, rotationZ: 0, scale: 0.065 },
  { id: "crystalB-22", position: [-1.29, -4.69, -3.54], rotationX: 0, rotationY: 2, rotationZ: 0, scale: 0.085 },
  { id: "crystalB-23", position: [-1.4, -4.7, -3.73], rotationX: 0, rotationY: 2.4, rotationZ: 0, scale: 0.105 },
  { id: "crystalB-24", position: [-1.95, -4.53, -4], rotationX: 0, rotationY: 2.8, rotationZ: 0, scale: 0.125 },
  { id: "crystalB-25", position: [-0.94, -4.82, -2.95], rotationX: 0, rotationY: 2.523, rotationZ: 0, scale: 0.105 },
  { id: "crystalB-26", position: [-0.95, -4.78, -2.85], rotationX: 0, rotationY: 0.4, rotationZ: 0, scale: 0.08 },
  { id: "crystalB-27", position: [-0.65, -4.75, -2.9], rotationX: 0, rotationY: 0.8, rotationZ: 0, scale: 0.11 },
  { id: "crystalB-28", position: [-0.95, -4.8, -2.7], rotationX: 0, rotationY: 1.896, rotationZ: 0, scale: 0.15 },
  { id: "crystalB-29", position: [-0.85, -4.8, -2.85], rotationX: 0, rotationY: 1.6, rotationZ: 0, scale: 0.145 },
  { id: "crystalB-30", position: [-0.8, -4.8, -2.7], rotationX: 0, rotationY: 2, rotationZ: 0, scale: 0.16 },
  { id: "crystalB-31", position: [-0.85, -4.75, -2.5], rotationX: 0, rotationY: 2.4, rotationZ: 0, scale: 0.08 },
  { id: "crystalB-32", position: [-0.9, -4.68, -2.35], rotationX: 0.174, rotationY: 3.496, rotationZ: 0, scale: 0.1 },
  { id: "crystalB-33", position: [-0.95, -4.75, -2.35], rotationX: 0, rotationY: -1.566, rotationZ: 0, scale: 0.12 },
  { id: "crystalB-34", position: [-1.1, -4.76, -2.25], rotationX: 0, rotationY: -0.209, rotationZ: 0, scale: 0.12 },
  { id: "crystalB-35", position: [-1.35, -4.75, -2.2], rotationX: 0, rotationY: 0.278, rotationZ: 0, scale: 0.14 },
  { id: "crystalB-36", position: [-1.45, -4.75, -2.3], rotationX: 0, rotationY: 0.678, rotationZ: 0, scale: 0.06 },
  { id: "crystalB-37", position: [-1.45, -4.73, -2.25], rotationX: 0, rotationY: 2.122, rotationZ: 0, scale: 0.09 },
  { id: "crystalB-38", position: [-2.4, -4.55, -2], rotationX: 0, rotationY: 2, rotationZ: 0, scale: 0.055 },
  { id: "crystalB-39", position: [-2.31, -4.68, -2.1], rotationX: 0, rotationY: 2.4, rotationZ: 0, scale: 0.075 },
  { id: "crystalB-40", position: [-2.36, -4.75, -2.16], rotationX: 0.174, rotationY: 1.93, rotationZ: 0, scale: 0.12 },
  { id: "crystalB-41", position: [-2.17, -4.67, -2.21], rotationX: -0.174, rotationY: -0.696, rotationZ: 0, scale: 0.1 },
  { id: "crystalB-42", position: [-2.06, -4.7, -2.25], rotationX: 0, rotationY: 0.4, rotationZ: 0, scale: 0.105 },
  { id: "crystalB-43", position: [-2.34, -4.55, -2.04], rotationX: 0, rotationY: 0.8, rotationZ: 0, scale: 0.055 },
  { id: "crystalB-44", position: [-2.86, -4.73, -2.64], rotationX: 0, rotationY: -1.41, rotationZ: 0, scale: 0.095 },
  { id: "crystalB-45", position: [-0.7, -4.84, -3.42], rotationX: 0, rotationY: 1.6, rotationZ: 0, scale: 0.16 },
  { id: "crystalB-46", position: [-0.97, -4.62, -3.7], rotationX: 0, rotationY: 2, rotationZ: 0, scale: 0.08 },
  { id: "crystalB-47", position: [-1.38, -4.66, -4.05], rotationX: 0, rotationY: 2.661, rotationZ: 0, scale: 0.1 },
  { id: "crystalB-48", position: [-1.51, -4.7, -3.92], rotationX: 0, rotationY: 2.8, rotationZ: 0, scale: 0.12 },
  { id: "crystalB-49", position: [-0.4, -4.8, -2.34], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.14 },
  { id: "crystalB-50", position: [-0.63, -4.68, -2.33], rotationX: 0, rotationY: 1.531, rotationZ: 0, scale: 0.15 },
];

// Baked 12 Tall Rod instances (position, rotationX/Y/Z in radians, scale, scaleX, scaleY)
const PLACED_TALL_ROD = [
  { id: "tallRod-01", position: [-2.95, -4.9, -3.05], rotationX: 0.208, rotationY: 0, rotationZ: 0, scale: 0.17, scaleX: 0.22, scaleY: 0.33 },
  { id: "tallRod-02", position: [-2.95, -4.85, -3.05], rotationX: -0.261, rotationY: 0.4, rotationZ: 0.087, scale: 0.21, scaleX: 0.22, scaleY: 0.41 },
  { id: "tallRod-03", position: [-2.9, -4.85, -3.05], rotationX: 0.14, rotationY: 0.8, rotationZ: -0.245, scale: 0.22, scaleX: 0.18, scaleY: 0.26 },
  { id: "tallRod-04", position: [-2.59, -4.7, -2], rotationX: 0.315, rotationY: 1.2, rotationZ: 0, scale: 0.16, scaleX: 0.16, scaleY: 0.29 },
  { id: "tallRod-05", position: [-2.6, -4.65, -2], rotationX: 0.105, rotationY: 2.02, rotationZ: -0.56, scale: 0.19, scaleX: 0.25, scaleY: 0.32 },
  { id: "tallRod-06", position: [-2.15, -4.81, -2], rotationX: -0.105, rotationY: 2, rotationZ: 0, scale: 0.16, scaleX: 0.2, scaleY: 0.47 },
  { id: "tallRod-07", position: [-2.6, -4.75, -2], rotationX: -0.42, rotationY: 2.05, rotationZ: 0.28, scale: 0.29, scaleX: 0.21, scaleY: 0.33 },
  { id: "tallRod-08", position: [-0.9, -4.75, -2.1], rotationX: 0, rotationY: 3.15, rotationZ: -0.175, scale: 0.19, scaleX: 0.16, scaleY: 0.28 },
  { id: "tallRod-09", position: [-0.9, -4.75, -2.15], rotationX: 0.035, rotationY: 0, rotationZ: -0.315, scale: 0.19, scaleX: 0.16, scaleY: 0.21 },
  { id: "tallRod-10", position: [-0.9, -4.75, -2.1], rotationX: -0.035, rotationY: 0.33, rotationZ: -0.035, scale: 0.19, scaleX: 0.16, scaleY: 0.34 },
  { id: "tallRod-11", position: [-1.2, -4.7, -3.7], rotationX: 0, rotationY: 0.94, rotationZ: -0.21, scale: 0.17, scaleX: 0.17, scaleY: 0.28 },
  { id: "tallRod-12", position: [-1.2, -4.72, -3.7], rotationX: 0, rotationY: 3.055, rotationZ: -0.21, scale: 0.22, scaleX: 0.27, scaleY: 0.28 },
];

const CRYSTAL_DEFAULTS = Object.freeze({
  U_colorA: "#ecfaff", U_colorB: "#bc00f5",
  U_mid: 0.38, U_softness: 0.44,
  U_bottomEmissiveBoost: 2.0, U_bottomFresnelBoost: 3.0, U_bottomFresnelPower: 0.5,
  U_roughness: 0.15, U_emissiveIntensity: 0.03,
  U_reflectBoost: 1.2, U_reflectPower: 2.0, U_rimBoost: 1.6, U_rimPower: 1.4,
  U_hoverEnabled: true, U_hoverEase: 2.0, U_cycleTime: 10, U_coolTime: 5.0,
  Pair_A_Bottom: "#2ec5ff", Pair_A_Top: "#b000ff",
  Pair_B_Bottom: "#00ff23", Pair_B_Top: "#f9ff87",
  Pair_C_Bottom: "#ffc300", Pair_C_Top: "#adadad",
  build: false, speed: 0.24,
  edgeWidth: 0.15, glowStrength: 2.0, glowColor: "#ffb900", coolTimeAfterBuild: 1.5,
});

function CrystalBDebugPanel({ onChange, onReplay }) {
  const unifiedGradient = useControls("Crystals B / Gradient", {
    U_colorA: { value: "#ecfaff", label: "Bottom Color (A)" },
    U_colorB: { value: "#bc00f5", label: "Top Color (B)" },
    U_mid: { value: 0.38, min: 0, max: 1, step: 0.001, label: "Blend Midpoint" },
    U_softness: { value: 0.44, min: 0, max: 0.5, step: 0.001, label: "Blend Softness" },
    U_bottomEmissiveBoost: { value: 2.0, min: 0, max: 2, step: 0.01, label: "Bottom Glow +" },
    U_bottomFresnelBoost: { value: 3.0, min: 0, max: 3, step: 0.01, label: "Bottom Fresnel +" },
    U_bottomFresnelPower: { value: 0.5, min: 0.5, max: 6, step: 0.1, label: "Bottom Fresnel Falloff" },
  }, { collapsed: true });

  const unifiedSurface = useControls("Crystals B / Surface", {
    U_roughness: { value: 0.15, min: 0, max: 1, step: 0.001 },
    U_emissiveIntensity: { value: 0.03, min: 0, max: 2, step: 0.01 },
  }, { collapsed: true });

  const unifiedShine = useControls("Crystals B / Shine", {
    U_reflectBoost: { value: 1.2, min: 0, max: 3, step: 0.01, label: "Reflect Boost" },
    U_reflectPower: { value: 2.0, min: 1, max: 6, step: 0.1, label: "Reflect Power" },
    U_rimBoost: { value: 1.6, min: 0, max: 3, step: 0.01, label: "Rim Boost" },
    U_rimPower: { value: 1.4, min: 1, max: 6, step: 0.1, label: "Rim Power" },
  }, { collapsed: true });

  const unifiedHover = useControls("Crystals B / Hover Colors", {
    U_hoverEnabled: { value: true, label: "Enabled" },
    U_hoverEase: { value: 2.0, min: 0.1, max: 20, step: 0.1, label: "Ease In (1/s)" },
    U_cycleTime: { value: 10, min: 0.2, max: 10, step: 0.05, label: "Cycle Step (s)" },
    U_coolTime: { value: 5.0, min: 0.05, max: 20, step: 0.05, label: "Cool Back (s)" },
    Pair_A_Bottom: { value: "#2ec5ff", label: "A Bottom" },
    Pair_A_Top: { value: "#b000ff", label: "A Top" },
    Pair_B_Bottom: { value: "#00ff23", label: "B Bottom" },
    Pair_B_Top: { value: "#f9ff87", label: "B Top" },
    Pair_C_Bottom: { value: "#ffc300", label: "C Bottom" },
    Pair_C_Top: { value: "#adadad", label: "C Top" },
  }, { collapsed: true });

  const dissolve = useControls("Crystals B Dissolve", {
    build: { value: false, label: "Build Crystals" },
    speed: { value: 0.24, min: 0.05, max: 3, step: 0.01, label: "Speed (units/sec)" },
    edgeWidth: { value: 0.15, min: 0.0, max: 0.4, step: 0.005, label: "Edge Width" },
    glowStrength: { value: 2.0, min: 0.0, max: 50, step: 0.1, label: "Glow Strength" },
    glowColor: { value: "#ffb900", label: "Glow Color" },
    coolTimeAfterBuild: { value: 1.5, min: 0.1, max: 30, step: 0.05, label: "Glow Cooldown (s)" },
    Replay: button(() => onReplay()),
  }, { collapsed: true });

  useEffect(() => {
    onChange({
      unified: {
        ...unifiedGradient,
        ...unifiedSurface,
        ...unifiedShine,
        ...unifiedHover,
      },
      dissolve,
    });
  }, [unifiedGradient, unifiedSurface, unifiedShine, unifiedHover, dissolve, onChange]);

  return null;
}

function useUnifiedCrystalMaterial(unified, dissolveParams, progressRef) {
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      metalness: 0.0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.1,
      roughness: unified.U_roughness,
      color: new THREE.Color("#ffffff"),
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: unified.U_emissiveIntensity,
      transparent: false,
      toneMapped: false,
      flatShading: true,
      side: THREE.FrontSide,
    });

    const prevOBC = m.onBeforeCompile;
    m.onBeforeCompile = (shader) => {
      prevOBC?.(shader);
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform float uObjMinY, uObjMaxY;
        varying float vH;
        attribute float aInstY01;
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
        #else
          mat4 MI = modelMatrix;
        #endif
        vec4 wp = MI * vec4(pos, 1.0);
        float ty = MI[3].y;
        float sy = length(vec3(MI[1].x, MI[1].y, MI[1].z));
        float yMin = ty + sy * uObjMinY;
        float yMax = ty + sy * uObjMaxY;
        vH = clamp((wp.y - yMin) / max(1e-5, (yMax - yMin)), 0.0, 1.0);
        vInstY01 = aInstY01;
        `
      );
      shader.uniforms.uObjMinY = { value: 0.0 };
      shader.uniforms.uObjMaxY = { value: 1.0 };
      shader.uniforms.uU_ColorA = { value: new THREE.Color(unified.U_colorA) };
      shader.uniforms.uU_ColorB = { value: new THREE.Color(unified.U_colorB) };
      shader.uniforms.uU_Mid = { value: unified.U_mid };
      shader.uniforms.uU_Soft = { value: unified.U_softness };
      shader.uniforms.uU_BottomEmissiveBoost = { value: unified.U_bottomEmissiveBoost };
      shader.uniforms.uU_BottomFresnelBoost = { value: unified.U_bottomFresnelBoost };
      shader.uniforms.uU_BottomFresnelPower = { value: unified.U_bottomFresnelPower };
      shader.uniforms.uU_EmissiveIntensity = { value: unified.U_emissiveIntensity };
      shader.uniforms.uU_ReflectBoost = { value: unified.U_reflectBoost };
      shader.uniforms.uU_ReflectPower = { value: unified.U_reflectPower };
      shader.uniforms.uU_RimBoost = { value: unified.U_rimBoost };
      shader.uniforms.uU_RimPower = { value: unified.U_rimPower };
      shader.uniforms.uU_UniformFactor = { value: 0.0 };
      shader.uniforms.uU_InstBiasAmp = { value: 0.6 };
      shader.uniforms.uProgress = { value: progressRef.current };
      shader.uniforms.uEdgeWidth = { value: dissolveParams.edgeWidth };
      shader.uniforms.uGlowStrength = { value: dissolveParams.glowStrength };
      shader.uniforms.uGlowColor = { value: new THREE.Color(dissolveParams.glowColor) };
      shader.uniforms.uCoolMix = { value: 0.0 };

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform vec3  uU_ColorA, uU_ColorB;
        uniform float uU_Mid, uU_Soft;
        uniform float uU_BottomEmissiveBoost, uU_BottomFresnelBoost, uU_BottomFresnelPower;
        uniform float uU_EmissiveIntensity;
        uniform float uU_ReflectBoost, uU_ReflectPower, uU_RimBoost, uU_RimPower;
        uniform float uU_UniformFactor, uU_InstBiasAmp;
        varying float vH, vInstY01;
        uniform float uProgress, uEdgeWidth, uGlowStrength, uCoolMix;
        uniform vec3  uGlowColor;
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "void main() {",
        `
        void main() {
          float y01 = vH;
          if (y01 > uProgress) { discard; }
          float edge = smoothstep(0.0, uEdgeWidth, uProgress - y01);
        `
      );
      const hook = shader.fragmentShader.includes("#include <tonemapping_fragment>")
        ? "#include <tonemapping_fragment>"
        : "#include <colorspace_fragment>";
      shader.fragmentShader = shader.fragmentShader.replace(
        hook,
        `
        float tLocal = smoothstep(uU_Mid - uU_Soft, uU_Mid + uU_Soft, vH);
        float bias = (vInstY01 - 0.5) * uU_InstBiasAmp * (1.0 - clamp(uU_UniformFactor, 0.0, 1.0));
        float tMix = clamp(tLocal + bias, 0.0, 1.0);
        vec3 grad = mix(uU_ColorA, uU_ColorB, tMix);
        float bottom = 1.0 - vH;
        gl_FragColor.rgb *= grad;
        vec3 N = normalize(normal);
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(N, V)), 1.3);
        float fresBoost = 1.0 + uU_BottomFresnelBoost * pow(bottom, uU_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;
        float eBoost = 1.0 + uU_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uU_EmissiveIntensity * eBoost;
        float rim = pow(1.0 - abs(dot(N, V)), max(0.0001, uU_RimPower));
        gl_FragColor.rgb += rim * uU_RimBoost;
        gl_FragColor.rgb += edge * uGlowColor * uGlowStrength * clamp(uCoolMix, 0.0, 1.0);
        gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(8.0));
        ${hook}
        `
      );
      m.userData.shader = shader;
      m.userData.rtShader = shader;
    };
    m.customProgramCacheKey = () => "CrystalB_v6_heightFade";
    m.transparent = false;
    return m;
  }, []);

  useEffect(() => {
    if (!mat) return;
    mat.roughness = unified.U_roughness;
    mat.emissiveIntensity = unified.U_emissiveIntensity;
    const s = mat.userData.shader;
    if (s) {
      s.uniforms.uU_ColorA.value.set(unified.U_colorA);
      s.uniforms.uU_ColorB.value.set(unified.U_colorB);
      s.uniforms.uU_Mid.value = unified.U_mid;
      s.uniforms.uU_Soft.value = unified.U_softness;
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

export default forwardRef(function CrystalClustersB(props, ref) {
  const { scene: sceneB } = useGLTF(GLB_B);
  const { scene: sceneRod } = useGLTF(GLB_TALL_ROD);
  const meshBRef = useRef();
  const meshRodRef = useRef();

  const isDebugMode = useDebugStore((s) => s.isDebugMode);
  const [debugValues, setDebugValues] = useState(null);

  const unified = isDebugMode && debugValues
    ? debugValues.unified
    : CRYSTAL_DEFAULTS;
  const dissolve = isDebugMode && debugValues ? debugValues.dissolve : CRYSTAL_DEFAULTS;

  const progressRef = useRef(-0.2);
  const coolMixRef = useRef(0.0);
  const shouldBuildRef = useRef(false);
  const crystalAudioRef = useRef(null);
  const isPlayingCrystalSoundRef = useRef(false);

  useEffect(() => {
    const audio = new Audio("/audio/animated_sound_effects_of_crysta-2-329362.mp3");
    audio.preload = "auto";
    audio.volume = 0.6;
    crystalAudioRef.current = audio;
    return () => {
      if (crystalAudioRef.current) {
        crystalAudioRef.current.pause();
        crystalAudioRef.current = null;
      }
    };
  }, []);

  const currentWaypointIndex = useCameraStore((state) => {
    const waypoints = state.waypoints || [];
    const t = state.t ?? 0;
    const nSeg = waypoints.length - 1;
    if (nSeg <= 0) return -1;
    return Math.round(t * nSeg);
  });
  const stop15DownIndex = useCameraStore((state) => {
    const wps = state.waypoints || [];
    return wps.findIndex((w) => w?.name === "stop-15-down");
  });

  useEffect(() => {
    if (stop15DownIndex < 0) {
      if (shouldBuildRef.current !== false) shouldBuildRef.current = false;
      return;
    }
    const shouldBuild = currentWaypointIndex >= stop15DownIndex && currentWaypointIndex !== -1;
    if (shouldBuild !== shouldBuildRef.current) {
      shouldBuildRef.current = shouldBuild;
      if (shouldBuild && crystalAudioRef.current && !isPlayingCrystalSoundRef.current) {
        crystalAudioRef.current.currentTime = 0;
        crystalAudioRef.current.play().catch(() => {});
        isPlayingCrystalSoundRef.current = true;
        crystalAudioRef.current.onended = () => { isPlayingCrystalSoundRef.current = false; };
      }
    }
  }, [currentWaypointIndex, stop15DownIndex]);

  const materialB = useUnifiedCrystalMaterial(unified, dissolve, progressRef);
  const materialRod = useUnifiedCrystalMaterial(unified, dissolve, progressRef);

  const updateUniformAll = React.useCallback((name, val) => {
    [materialB, materialRod].forEach((mat) => {
      const sh = mat?.userData?.rtShader;
      if (sh?.uniforms && name in sh.uniforms) sh.uniforms[name].value = val;
    });
  }, [materialB, materialRod]);

  useEffect(() => { updateUniformAll("uEdgeWidth", dissolve.edgeWidth); }, [dissolve.edgeWidth, updateUniformAll]);
  useEffect(() => { updateUniformAll("uGlowStrength", dissolve.glowStrength); }, [dissolve.glowStrength, updateUniformAll]);
  useEffect(() => { updateUniformAll("uGlowColor", new THREE.Color(dissolve.glowColor)); }, [dissolve.glowColor, updateUniformAll]);

  const handleReplay = React.useCallback(() => {
    progressRef.current = -0.2;
    coolMixRef.current = 0.0;
    updateUniformAll("uProgress", progressRef.current);
    updateUniformAll("uCoolMix", coolMixRef.current);
  }, [updateUniformAll]);

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

  const geoRod = useMemo(() => {
    if (!sceneRod) return null;
    let g = null;
    sceneRod.traverse((n) => {
      if (!g && n.isMesh && n.geometry) g = n.geometry.clone();
    });
    if (!g) return null;
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(+Math.PI / 2));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }, [sceneRod]);

  useEffect(() => {
    if (geoB && materialB?.userData?.shader) {
      materialB.userData.shader.uniforms.uObjMinY.value = geoB.boundingBox.min.y;
      materialB.userData.shader.uniforms.uObjMaxY.value = geoB.boundingBox.max.y;
    }
  }, [geoB, materialB]);
  useEffect(() => {
    if (geoRod && materialRod?.userData?.shader) {
      materialRod.userData.shader.uniforms.uObjMinY.value = geoRod.boundingBox.min.y;
      materialRod.userData.shader.uniforms.uObjMaxY.value = geoRod.boundingBox.max.y;
    }
  }, [geoRod, materialRod]);

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
      const d = PLACED_CRYSTAL_B[i];
      p.set(d.position[0], d.position[1] + CRYSTAL_Y_OFFSET, d.position[2]);
      e.set(d.rotationX ?? 0, d.rotationY ?? 0, d.rotationZ ?? 0);
      q.setFromEuler(e);
      s.setScalar(d.scale + CRYSTAL_SCALE_OFFSET);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      worldY[i] = d.position[1] + CRYSTAL_Y_OFFSET;
    }
    mesh.count = COUNT_B;
    mesh.instanceMatrix.needsUpdate = true;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < COUNT_B; i++) {
      if (worldY[i] < minY) minY = worldY[i];
      if (worldY[i] > maxY) maxY = worldY[i];
    }
    const invSpan = 1.0 / Math.max(1e-6, maxY - minY);
    const instY01 = new Float32Array(COUNT_B);
    for (let i = 0; i < COUNT_B; i++) instY01[i] = (worldY[i] - minY) * invSpan;
    mesh.geometry.setAttribute("aInstY01", new THREE.InstancedBufferAttribute(instY01, 1));
    mesh.geometry.attributes.aInstY01.needsUpdate = true;
  }, [geoB]);

  useLayoutEffect(() => {
    if (!geoRod) return;
    const mesh = meshRodRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler(0, 0, 0, "XYZ");
    const worldY = new Float32Array(COUNT_ROD);
    for (let i = 0; i < COUNT_ROD; i++) {
      const d = PLACED_TALL_ROD[i];
      p.set(d.position[0], d.position[1] + CRYSTAL_Y_OFFSET, d.position[2]);
      e.set(d.rotationX ?? 0, d.rotationY ?? 0, d.rotationZ ?? 0);
      q.setFromEuler(e);
      const sx = (d.scaleX ?? d.scale) + CRYSTAL_SCALE_OFFSET;
      const sy = (d.scaleY ?? d.scale) + CRYSTAL_SCALE_OFFSET;
      s.set(sx, sy, d.scale + CRYSTAL_SCALE_OFFSET);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      worldY[i] = d.position[1] + CRYSTAL_Y_OFFSET;
    }
    mesh.count = COUNT_ROD;
    mesh.instanceMatrix.needsUpdate = true;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < COUNT_ROD; i++) {
      if (worldY[i] < minY) minY = worldY[i];
      if (worldY[i] > maxY) maxY = worldY[i];
    }
    const invSpan = 1.0 / Math.max(1e-6, maxY - minY);
    const instY01 = new Float32Array(COUNT_ROD);
    for (let i = 0; i < COUNT_ROD; i++) instY01[i] = (worldY[i] - minY) * invSpan;
    mesh.geometry.setAttribute("aInstY01", new THREE.InstancedBufferAttribute(instY01, 1));
    mesh.geometry.attributes.aInstY01.needsUpdate = true;
  }, [geoRod]);

  useFrame((_, dt) => {
    const wantBuild = dissolve.build || shouldBuildRef.current;
    const target = wantBuild ? 1.1 : -0.2;
    const dir = Math.sign(target - progressRef.current);

    // Early out when at rest
    if (dir === 0 && coolMixRef.current <= 0.001) return;

    if (dir !== 0) {
      const step = dissolve.speed * dt * dir;
      const next = progressRef.current + step;
      progressRef.current = (dir > 0 ? Math.min : Math.max)(next, target);
      updateUniformAll("uProgress", progressRef.current);
    }
    const building = wantBuild && dir >= 0 && progressRef.current < 1.0;
    const dissolving = !wantBuild && dir <= 0 && progressRef.current > -0.2;
    if (building || dissolving) {
      const riseK = 1 - Math.exp(-6.0 * dt);
      coolMixRef.current += (1 - coolMixRef.current) * riseK;
    } else if (progressRef.current >= 1.0 - 1e-4) {
      const coolT = Math.max(0.05, dissolve.coolTimeAfterBuild);
      coolMixRef.current = Math.max(0, coolMixRef.current - dt / coolT);
    } else if (progressRef.current <= -0.19) {
      coolMixRef.current = 0.0;
    } else {
      coolMixRef.current = Math.max(0, coolMixRef.current - dt * 2.0);
    }
    updateUniformAll("uCoolMix", coolMixRef.current);
  });

  if (!geoB) return null;

  return (
    <group ref={ref} name="CrystalClustersB" userData={{ noDistanceFade: true }} {...props}>
      {isDebugMode && <CrystalBDebugPanel onChange={setDebugValues} onReplay={handleReplay} />}
      <group name="CrystalB">
        <instancedMesh
          ref={meshBRef}
          args={[geoB, materialB, COUNT_B]}
          castShadow={false}
          receiveShadow={false}
          frustumCulled={false}
        />
      </group>
      {geoRod && (
        <group name="TallRod">
          <instancedMesh
            ref={meshRodRef}
            args={[geoRod, materialRod, COUNT_ROD]}
            castShadow={false}
            receiveShadow={false}
            frustumCulled={false}
          />
        </group>
      )}
    </group>
  );
});

useGLTF.preload(GLB_B);
useGLTF.preload(GLB_TALL_ROD);
