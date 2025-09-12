// src/components/MagicCrystalClusters3.jsx
import React, { forwardRef, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useFrame, useThree } from "@react-three/fiber";

// Uses the Cluster4 model
const CLUSTER4_GLB = "/models/magicPlantsAndCrystal/CrystalCluster4.glb";
const COUNT = 8;

/** Helper: deg → rad */
const d2r = (deg) => (deg * Math.PI) / 180;

/** Defaults + baked placement */
const FALLBACK = { px: -2.0, py: -4.0, pz: -2.0, ry: 0.0, s: 0.15 };
const BAKED = [
  { px: -2.47, py: -4.56, pz: -1.5, ry: -30.4, s: 0.18 },
  { px: -2.22, py: -4.67, pz: -1.62, ry: 13.4, s: 0.13 },
  { px: -2.8, py: -4.47, pz: -2.9, ry: 0.0, s: 0.18 },
  { px: -2.48, py: -4.46, pz: -3.6, ry: 0.0, s: 0.12 },
  { px: -2.8, py: -4.48, pz: -3.121, ry: 0.0, s: 0.14 },
  { px: -2.6, py: -4.5, pz: -1.47, ry: -144.7, s: 0.16 },
  { px: -2.7, py: -4.53, pz: -2.2, ry: -30.2, s: 0.17 },
  { px: -0.97, py: -4.28, pz: -2.8, ry: 180.0, s: 0.14 },
];

/**
 * Glass material with vertical gradient + fresnel.
 * Adds uC_GlowExtra (one-shot burst) and live color uniforms uC_ColorA/B.
 * NEW: "Artificial reflection" via Fresnel-mixed envMap + white rim (Option A).
 */
function useCrystalMaterialC({
  ior,
  thickness,
  attenuationDistance,
  roughness,
  emissiveIntensity,
  colorA,
  colorB,
  mid,
  softness,
  bottomSatBoost,
  bottomEmissiveBoost,
  bottomFresnelBoost,
  bottomFresnelPower,
}) {
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      transmission: 1.0,
      thickness,
      ior,
      roughness,
      metalness: 0.0,
      iridescence: 0.6,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 600],
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      specularIntensity: 1.0,
      color: new THREE.Color("#ffffff"),
      attenuationColor: new THREE.Color("#ffffff"),
      attenuationDistance,
      transparent: false,
      opacity: 1.0,
      toneMapped: true,
      flatShading: true,
      side: THREE.FrontSide,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity,
    });

    m.onBeforeCompile = (shader) => {
      // Object-space Y bounds (same for all instances)
      shader.uniforms.uObjMinY = { value: 0.0 };
      shader.uniforms.uObjMaxY = { value: 1.0 };

      // Gradient/boost uniforms (C-prefixed)
      shader.uniforms.uC_ColorA = { value: new THREE.Color(colorA) };
      shader.uniforms.uC_ColorB = { value: new THREE.Color(colorB) };
      shader.uniforms.uC_Mid = { value: mid };
      shader.uniforms.uC_Soft = { value: softness };
      shader.uniforms.uC_BottomSatBoost = { value: bottomSatBoost };
      shader.uniforms.uC_BottomEmissiveBoost = { value: bottomEmissiveBoost };
      shader.uniforms.uC_BottomFresnelBoost = { value: bottomFresnelBoost };
      shader.uniforms.uC_BottomFresnelPower = { value: bottomFresnelPower };
      shader.uniforms.uC_EmissiveIntensity = { value: emissiveIntensity };

      // One-shot extra glow burst (CPU-decayed)
      shader.uniforms.uC_GlowExtra = { value: 0.0 };

      // NEW: Option A uniforms (Fresnel env reflection + rim light)
      shader.uniforms.uC_ReflectBoost = { value: 1.2 }; // mix strength
      shader.uniforms.uC_ReflectPower = { value: 2.0 }; // fresnel exponent
      shader.uniforms.uC_RimBoost = { value: 0.25 }; // white rim add
      shader.uniforms.uC_RimPower = { value: 2.5 }; // rim sharpness

      // Per-vertex normalized height vH (instance-aware, world-Y)
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform float uObjMinY, uObjMaxY;
        varying float vH;  // 0..1 height for gradient/fresnel
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
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform vec3  uC_ColorA;
        uniform vec3  uC_ColorB;
        uniform float uC_Mid, uC_Soft;
        uniform float uC_BottomSatBoost;
        uniform float uC_BottomEmissiveBoost;
        uniform float uC_BottomFresnelBoost;
        uniform float uC_BottomFresnelPower;
        uniform float uC_EmissiveIntensity;
        uniform float uC_GlowExtra;

        // NEW: Option A uniforms
        uniform float uC_ReflectBoost;
        uniform float uC_ReflectPower;
        uniform float uC_RimBoost;
        uniform float uC_RimPower;

        varying float vH;

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
        // base gradient (A->B) along height
        float t = smoothstep(uC_Mid - uC_Soft, uC_Mid + uC_Soft, vH);
        vec3 grad = mix(uC_ColorA, uC_ColorB, t);

        // more saturation near bottom
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uC_BottomSatBoost * bottom);

        // tint base shading
        gl_FragColor.rgb *= grad;

        // fresnel, stronger near bottom
        vec3 N = normalize(normal);
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(N, V)), 1.3);
        float fresBoost = 1.0 + uC_BottomFresnelBoost * pow(bottom, uC_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // base emissive near bottom
        float eBoost = 1.0 + uC_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uC_EmissiveIntensity * eBoost;

        // one-shot burst glow (CPU-decayed)
        gl_FragColor.rgb += grad * uC_GlowExtra;

        // === NEW: Artificial reflection & rim (Option A) ===
        float fresRef = pow(1.0 - abs(dot(N, V)), max(0.0001, uC_ReflectPower));

        #ifdef USE_ENVMAP
          vec3 R = reflect(-V, N);
          vec3 envBoost = vec3(0.0);
          #ifdef ENVMAP_TYPE_CUBE_UV
            // envMapIntensity is declared by the standard envmap chunk
            envBoost = envMapIntensity * textureCubeUV(envMap, R, 0.0).rgb;
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, envBoost, clamp(uC_ReflectBoost * fresRef, 0.0, 1.0));
        #endif

        float rim = pow(1.0 - abs(dot(N, V)), max(0.0001, uC_RimPower));
        gl_FragColor.rgb += rim * uC_RimBoost;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    m.customProgramCacheKey = () =>
      "MagicCrystal_C_colorHover_burstGlow_shine_v1";
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live updates for static params
  useEffect(() => {
    if (!mat) return;
    mat.ior = ior;
    mat.thickness = thickness;
    mat.attenuationDistance = attenuationDistance;
    mat.roughness = roughness;
    mat.emissiveIntensity = emissiveIntensity;

    const s = mat.userData.shader;
    if (s) {
      s.uniforms.uC_ColorA.value.set(colorA);
      s.uniforms.uC_ColorB.value.set(colorB);
      s.uniforms.uC_Mid.value = mid;
      s.uniforms.uC_Soft.value = softness;
      s.uniforms.uC_BottomSatBoost.value = bottomSatBoost;
      s.uniforms.uC_BottomEmissiveBoost.value = bottomEmissiveBoost;
      s.uniforms.uC_BottomFresnelBoost.value = bottomFresnelBoost;
      s.uniforms.uC_BottomFresnelPower.value = bottomFresnelPower;
      s.uniforms.uC_EmissiveIntensity.value = emissiveIntensity;
    }
  }, [
    mat,
    ior,
    thickness,
    attenuationDistance,
    roughness,
    emissiveIntensity,
    colorA,
    colorB,
    mid,
    softness,
    bottomSatBoost,
    bottomEmissiveBoost,
    bottomFresnelBoost,
    bottomFresnelPower,
  ]);

  return mat;
}

export default forwardRef(function MagicCrystalClusters3(props, ref) {
  const { scene } = useGLTF(CLUSTER4_GLB);
  const instancedRef = useRef();

  // ——— Gradient & Glass controls ———
  const {
    C_colorA,
    C_colorB,
    C_mid,
    C_softness,
    C_bottomSatBoost,
    C_bottomEmissiveBoost,
    C_bottomFresnelBoost,
    C_bottomFresnelPower,
  } = useControls("Crystal C / Gradient", {
    C_colorA: { value: "#20c4ff", label: "Bottom Color (A)" },
    C_colorB: { value: "#9600c4", label: "Top Color (B)" },
    C_mid: {
      value: 0.36,
      min: 0.0,
      max: 1.0,
      step: 0.001,
      label: "Blend Midpoint",
    },
    C_softness: {
      value: 0.66,
      min: 0.0,
      max: 0.5,
      step: 0.001,
      label: "Blend Softness",
    },
    C_bottomSatBoost: {
      value: 1.5,
      min: 0.0,
      max: 1.5,
      step: 0.01,
      label: "Bottom Saturation +",
    },
    C_bottomEmissiveBoost: {
      value: 2.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: "Bottom Glow +",
    },
    C_bottomFresnelBoost: {
      value: 3.0,
      min: 0.0,
      max: 3.0,
      step: 0.01,
      label: "Bottom Fresnel +",
    },
    C_bottomFresnelPower: {
      value: 0.8,
      min: 0.5,
      max: 6.0,
      step: 0.1,
      label: "Bottom Fresnel Falloff",
    },
  });

  const {
    C_ior,
    C_thickness,
    C_attenuationDistance,
    C_roughness,
    C_emissiveIntensity,
  } = useControls("Crystal C / Glass", {
    C_ior: { value: 1.0, min: 1.0, max: 2.333, step: 0.001 },
    C_thickness: { value: 4.68, min: 0, max: 10, step: 0.01 },
    C_attenuationDistance: { value: 57.5, min: 0.1, max: 200, step: 0.1 },
    C_roughness: { value: 0.61, min: 0, max: 1, step: 0.001 },
    C_emissiveIntensity: { value: 0.3, min: 0, max: 8, step: 0.01 },
  });

  // ——— Color Hover (same family as your other components) ———
  const {
    C_hoverEnabled,
    C_hoverOuterMult, // 2.8
    C_hoverEase, // 0.3
    C_hueSpeedDeg, // 20
    C_hueStartDeg, // 0
    C_hueEndDeg, // 120
    C_coolTime, // 5.0
    C_glowStrength, // 1.2
    C_glowFadeTime, // 1.6
  } = useControls("Crystal C / Color Hover", {
    C_hoverEnabled: { value: true, label: "Enabled" },
    C_hoverOuterMult: {
      value: 2.8,
      min: 0.1,
      max: 4.0,
      step: 0.05,
      label: "Screen Radius ×",
    },
    C_hoverEase: {
      value: 0.3,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: "Ease (1/s)",
    },
    C_hueSpeedDeg: {
      value: 20,
      min: 0,
      max: 360,
      step: 1,
      label: "Hue Speed (°/s)",
    },
    C_hueStartDeg: {
      value: 0,
      min: -360,
      max: 360,
      step: 1,
      label: "Hue Start (°)",
    },
    C_hueEndDeg: {
      value: 120,
      min: -360,
      max: 360,
      step: 1,
      label: "Hue End (°)",
    },
    C_coolTime: {
      value: 5.0,
      min: 0.05,
      max: 20,
      step: 0.05,
      label: "Cool Back (s)",
    },
    C_glowStrength: {
      value: 1.2,
      min: 0.0,
      max: 8.0,
      step: 0.01,
      label: "Glow Strength +",
    },
    C_glowFadeTime: {
      value: 1.6,
      min: 0.05,
      max: 20,
      step: 0.05,
      label: "Glow Fade (s)",
    },
  });

  // ——— NEW: Shine (Option A) controls ———
  const {
    C_reflectBoost,
    C_reflectPower,
    C_rimBoost,
    C_rimPower,
    C_envIntensity,
  } = useControls("Crystal C / Shine", {
    C_reflectBoost: {
      value: 1.2,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Reflect Boost",
    },
    C_reflectPower: {
      value: 2.0,
      min: 1,
      max: 6,
      step: 0.1,
      label: "Reflect Power",
    },
    C_rimBoost: { value: 0.25, min: 0, max: 3, step: 0.01, label: "Rim Boost" },
    C_rimPower: { value: 2.5, min: 1, max: 6, step: 0.1, label: "Rim Power" },
    C_envIntensity: {
      value: 2.0,
      min: 0,
      max: 8,
      step: 0.1,
      label: "EnvMap Intensity",
    },
  });

  // ——— Per-instance transform controls ———
  const instanceSchema = useMemo(() => {
    const schema = {};
    for (let i = 0; i < COUNT; i++) {
      const d = { ...FALLBACK, ...(BAKED[i] || {}) };
      const label = `C / Instance ${String(i + 1).padStart(2, "0")}`;
      schema[label] = folder(
        {
          [`C_pX_${i}`]: {
            value: d.px,
            min: -20,
            max: 20,
            step: 0.001,
            label: "x",
          },
          [`C_pY_${i}`]: {
            value: d.py,
            min: -20,
            max: 20,
            step: 0.001,
            label: "y",
          },
          [`C_pZ_${i}`]: {
            value: d.pz,
            min: -20,
            max: 20,
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
  }, []);
  const ctl = useControls("Crystal C / Instances", instanceSchema, {
    collapsed: false,
  });

  // ——— Geometry (rotate +90° around X to make Y-up) ———
  const { geometry, baseRadius } = useMemo(() => {
    if (!scene) return { geometry: null, baseRadius: 1 };
    let g = null;
    scene.traverse((n) => {
      if (!g && n.isMesh && n.geometry) g = n.geometry.clone();
    });
    if (!g) return { geometry: null, baseRadius: 1 };
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(+Math.PI / 2));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return { geometry: g, baseRadius: g.boundingSphere?.radius || 1 };
  }, [scene]);

  // ——— Material ———
  const material = useCrystalMaterialC({
    ior: C_ior,
    thickness: C_thickness,
    attenuationDistance: C_attenuationDistance,
    roughness: C_roughness,
    emissiveIntensity: C_emissiveIntensity,
    colorA: C_colorA,
    colorB: C_colorB,
    mid: C_mid,
    softness: C_softness,
    bottomSatBoost: C_bottomSatBoost,
    bottomEmissiveBoost: C_bottomEmissiveBoost,
    bottomFresnelBoost: C_bottomFresnelBoost,
    bottomFresnelPower: C_bottomFresnelPower,
  });

  // Seed object-space Y bounds into shader
  useEffect(() => {
    if (!geometry || !material?.userData?.shader) return;
    const sdr = material.userData.shader;
    const bb = geometry.boundingBox;
    if (bb) {
      sdr.uniforms.uObjMinY.value = bb.min.y;
      sdr.uniforms.uObjMaxY.value = bb.max.y;
    }
  }, [geometry, material]);

  // ——— Upload instance matrices ———
  useEffect(() => {
    const mesh = instancedRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler(0, 0, 0, "XYZ");

    for (let i = 0; i < COUNT; i++) {
      const px = ctl[`C_pX_${i}`] ?? FALLBACK.px;
      const py = ctl[`C_pY_${i}`] ?? FALLBACK.py;
      const pz = ctl[`C_pZ_${i}`] ?? FALLBACK.pz;
      const ry = d2r(ctl[`C_rY_${i}`] ?? FALLBACK.ry);
      const uni = ctl[`C_s_${i}`] ?? FALLBACK.s;

      p.set(px, py, pz);
      e.set(0, ry, 0);
      q.setFromEuler(e);
      s.set(uni, uni, uni);

      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = COUNT;
    mesh.instanceMatrix.needsUpdate = true;
  }, [ctl]);

  // ——— Global hover-driven continuous hue + cool back + one-shot glow burst ———
  const baseARef = useRef(new THREE.Color(C_colorA));
  const baseBRef = useRef(new THREE.Color(C_colorB));
  useEffect(() => {
    baseARef.current.set(C_colorA);
  }, [C_colorA]);
  useEffect(() => {
    baseBRef.current.set(C_colorB);
  }, [C_colorB]);

  const hoverMixRef = useRef(0); // 0→base, 1→shifted
  const phaseDegRef = useRef(0); // advances only while hovered
  const burstGlowRef = useRef(0); // one-shot glow that decays
  const prevHoveredRef = useRef(false); // rising-edge detection

  const { camera, pointer } = useThree();
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpS = useMemo(() => new THREE.Vector3(), []);
  const camRight = useMemo(() => new THREE.Vector3(), []);

  const workA = useMemo(() => new THREE.Color(), []);
  const workB = useMemo(() => new THREE.Color(), []);
  const shiftedA = useMemo(() => new THREE.Color(), []);
  const shiftedB = useMemo(() => new THREE.Color(), []);
  const ndcCenter = useMemo(() => new THREE.Vector3(), []);
  const ndcSample = useMemo(() => new THREE.Vector3(), []);
  const sampleWorld = useMemo(() => new THREE.Vector3(), []);

  function shiftHueTHREE(outColor, srcColor, deg) {
    const hsl = { h: 0, s: 0, l: 0 };
    srcColor.getHSL(hsl);
    let h = hsl.h + deg / 360;
    h = h - Math.floor(h); // wrap into [0,1)
    outColor.setHSL(h, hsl.s, hsl.l);
    return outColor;
  }

  useFrame((_, dt) => {
    const mesh = instancedRef.current;
    const sdr = material?.userData?.shader;
    if (!mesh || !geometry || !sdr) return;

    // Global hover test in screen-space
    camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();

    let anyHovered = false;
    const sphereRadius = baseRadius || 1;

    for (let i = 0; i < COUNT && !anyHovered; i++) {
      mesh.getMatrixAt(i, tmpM);
      tmpM.decompose(tmpP, tmpQ, tmpS);

      const rWorld = sphereRadius * Math.max(tmpS.x, tmpS.y, tmpS.z);
      ndcCenter.copy(tmpP).project(camera);

      sampleWorld
        .copy(tmpP)
        .addScaledVector(camRight, rWorld * C_hoverOuterMult);
      ndcSample.copy(sampleWorld).project(camera);

      const rNdc = Math.hypot(
        ndcSample.x - ndcCenter.x,
        ndcSample.y - ndcCenter.y
      );
      const dNdc = Math.hypot(pointer.x - ndcCenter.x, pointer.y - ndcCenter.y);

      if (dNdc <= rNdc) anyHovered = true;
    }

    // Burst glow: trigger once at hover entry, then decay
    const wasHovered = prevHoveredRef.current;
    if (C_hoverEnabled && anyHovered && !wasHovered) {
      burstGlowRef.current = C_glowStrength;
    } else if (burstGlowRef.current > 0) {
      const rate = C_glowStrength / Math.max(1e-3, C_glowFadeTime);
      burstGlowRef.current = Math.max(0, burstGlowRef.current - rate * dt);
    }
    prevHoveredRef.current = anyHovered;

    // Color motion while hovered; cool back when not
    const easeK = 1 - Math.exp(-C_hoverEase * dt);

    if (C_hoverEnabled && anyHovered) {
      phaseDegRef.current += C_hueSpeedDeg * dt;
      if (phaseDegRef.current > 1e6) phaseDegRef.current -= 1e6;
      hoverMixRef.current += (1 - hoverMixRef.current) * easeK; // ease toward full effect
    } else {
      const coolRate = C_coolTime > 0 ? dt / Math.max(1e-3, C_coolTime) : 1.0;
      hoverMixRef.current = Math.max(0, hoverMixRef.current - coolRate);
    }

    // If fully cooled and no glow, snap base & exit early
    if (hoverMixRef.current <= 1e-4 && burstGlowRef.current <= 1e-4) {
      hoverMixRef.current = 0;
      sdr.uniforms.uC_ColorA.value.copy(baseARef.current);
      sdr.uniforms.uC_ColorB.value.copy(baseBRef.current);
      sdr.uniforms.uC_GlowExtra.value = 0.0;
      return;
    }

    // Soft ping-pong hue inside [start..end] using sine mapping
    const start = C_hueStartDeg;
    const end = C_hueEndDeg;
    const minD = Math.min(start, end);
    const maxD = Math.max(start, end);
    const mid = (minD + maxD) * 0.5;
    const amp = (maxD - minD) * 0.5;
    const phase = (phaseDegRef.current * Math.PI) / 180.0;

    const offsetDeg = mid + amp * Math.sin(phase);

    // Apply hue shift and mix
    shiftHueTHREE(shiftedA, baseARef.current, offsetDeg);
    shiftHueTHREE(shiftedB, baseBRef.current, offsetDeg);

    workA.copy(baseARef.current).lerp(shiftedA, hoverMixRef.current);
    workB.copy(baseBRef.current).lerp(shiftedB, hoverMixRef.current);

    sdr.uniforms.uC_ColorA.value.copy(workA);
    sdr.uniforms.uC_ColorB.value.copy(workB);
    sdr.uniforms.uC_GlowExtra.value = burstGlowRef.current;
  });

  // ——— Live shine/env intensity updates ———
  useEffect(() => {
    if (!material) return;
    material.envMapIntensity = C_envIntensity;
    const sdr = material.userData.shader;
    if (sdr) {
      sdr.uniforms.uC_ReflectBoost.value = C_reflectBoost;
      sdr.uniforms.uC_ReflectPower.value = C_reflectPower;
      sdr.uniforms.uC_RimBoost.value = C_rimBoost;
      sdr.uniforms.uC_RimPower.value = C_rimPower;
    }
  }, [material, C_reflectBoost, C_reflectPower, C_rimBoost, C_rimPower, C_envIntensity]);

  if (!geometry) return null;

  return (
    <group ref={ref} name="MagicCrystalClusters3" {...props}>
      <instancedMesh
        ref={instancedRef}
        args={[geometry, material, COUNT]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
    </group>
  );
});

useGLTF.preload(CLUSTER4_GLB);
