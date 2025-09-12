// src/components/MagicCrystalClusters.jsx
import React, { forwardRef, useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useFrame, useThree } from "@react-three/fiber";

const CRYSTAL_GLB = "/models/magicPlantsAndCrystal/CrystalCluster.glb";
const COUNT = 15;
const d2r = (deg) => (deg * Math.PI) / 180;

// ---- 15 baked placements (rounded to 3 decimals; includes rx/ry/rz & y-scale) ----
const BAKED = [
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

export default forwardRef(function MagicCrystalClusters(props, ref) {
  const { scene } = useGLTF(CRYSTAL_GLB);
  const instancedRef = useRef();

  // ===== Instance transforms (A-prefixed) =====
  const makeInstanceFolder = (i) => {
    const d = BAKED[i] ?? {
      px: -2,
      py: -4,
      pz: -2,
      rx: 0,
      ry: 0,
      rz: 0,
      s: 1,
      sy: 1,
    };
    return folder(
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
          value: d.sy,
          min: 0.1,
          max: 5,
          step: 0.001,
          label: "y-scale",
        },
      },
      { collapsed: true }
    );
  };

  const instanceSchema = useMemo(() => {
    const schema = {};
    for (let i = 0; i < COUNT; i++) {
      schema[`A / Instance ${String(i + 1).padStart(2, "0")}`] =
        makeInstanceFolder(i);
    }
    return schema;
  }, []);
  const ctl = useControls("Crystal A / Instances", instanceSchema, {
    collapsed: false,
  });

  // ===== 2-Color Gradient & Glass controls (A-prefixed) =====
  const {
    A_colorA,
    A_colorB,
    A_mid,
    A_softness,
    A_bottomSatBoost,
    A_bottomEmissiveBoost,
    A_bottomFresnelBoost,
    A_bottomFresnelPower,
  } = useControls("Crystal A / Gradient", {
    A_colorA: { value: "#20c4ff", label: "Bottom Color (A)" },
    A_colorB: { value: "#9600c4", label: "Top Color (B)" },
    A_mid: {
      value: 0.38,
      min: 0.0,
      max: 1.0,
      step: 0.001,
      label: "Blend Midpoint",
    },
    A_softness: {
      value: 0.44,
      min: 0.0,
      max: 0.5,
      step: 0.001,
      label: "Blend Softness",
    },
    A_bottomSatBoost: {
      value: 0.1,
      min: 0.0,
      max: 1.5,
      step: 0.01,
      label: "Bottom Saturation +",
    },
    A_bottomEmissiveBoost: {
      value: 2.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: "Bottom Glow +",
    },
    A_bottomFresnelBoost: {
      value: 3.0,
      min: 0.0,
      max: 3.0,
      step: 0.01,
      label: "Bottom Fresnel +",
    },
    A_bottomFresnelPower: {
      value: 0.5,
      min: 0.5,
      max: 6.0,
      step: 0.1,
      label: "Bottom Fresnel Falloff",
    },
  });

  const {
    A_ior,
    A_thickness,
    A_attenuationDistance,
    A_roughness,
    A_emissiveIntensity,
  } = useControls("Crystal A / Glass", {
    A_ior: { value: 1.0, min: 1.0, max: 2.333, step: 0.001 },
    A_thickness: { value: 4.68, min: 0, max: 10, step: 0.01 },
    A_attenuationDistance: { value: 57.5, min: 0.1, max: 200, step: 0.1 },
    A_roughness: { value: 0.61, min: 0, max: 1, step: 0.001 },
    A_emissiveIntensity: { value: 0.3, min: 0, max: 8, step: 0.01 },
  });

  // ===== Global Color Hover (soft range while hovered) + ONE-SHOT GLOW BURST =====
  const {
    A_hoverEnabled,
    A_hoverOuterMult, // baked 2.8
    A_hoverEase, // baked 0.3
    A_hueSpeedDeg, // baked 20
    A_hueStartDeg, // hue window start (deg rel. to base)
    A_hueEndDeg, // hue window end   (deg rel. to base)
    A_coolTime, // baked 5.0
    // New one-shot glow controls
    A_glowStrength, // burst amplitude
    A_glowFadeTime, // seconds to fade the burst to 0
  } = useControls("Crystal A / Color Hover", {
    A_hoverEnabled: { value: true, label: "Enabled" },
    A_hoverOuterMult: {
      value: 2.8,
      min: 0.1,
      max: 4.0,
      step: 0.05,
      label: "Screen Radius ×",
    },
    A_hoverEase: {
      value: 0.3,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: "Ease (1/s)",
    },
    A_hueSpeedDeg: {
      value: 20,
      min: 0,
      max: 360,
      step: 1,
      label: "Hue Speed (°/s)",
    },
    A_hueStartDeg: {
      value: 0,
      min: -360,
      max: 360,
      step: 1,
      label: "Hue Start (°)",
    },
    A_hueEndDeg: {
      value: 120,
      min: -360,
      max: 360,
      step: 1,
      label: "Hue End (°)",
    },
    A_coolTime: {
      value: 5.0,
      min: 0.05,
      max: 20,
      step: 0.05,
      label: "Cool Back (s)",
    },
    // One-shot glow
    A_glowStrength: {
      value: 1.2,
      min: 0.0,
      max: 8.0,
      step: 0.01,
      label: "Glow Strength +",
    },
    A_glowFadeTime: {
      value: 1.6,
      min: 0.05,
      max: 20,
      step: 0.05,
      label: "Glow Fade (s)",
    },
  });

  // ===== Geometry (rotate to Y-up, cache bbox/sphere) =====
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

  // ===== Material (A-namespaced) =====
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      transmission: 1.0,
      thickness: A_thickness,
      ior: A_ior,
      roughness: A_roughness,
      metalness: 0.0,
      iridescence: 0.6,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 600],
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      specularIntensity: 1.0,
      color: new THREE.Color("#ffffff"), // tinted in shader
      attenuationColor: new THREE.Color("#ffffff"),
      attenuationDistance: A_attenuationDistance,
      transparent: false,
      opacity: 1.0,
      toneMapped: true,
      flatShading: true,
      side: THREE.FrontSide,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: A_emissiveIntensity,
    });

    m.onBeforeCompile = (shader) => {
      // Object-space Y range (same for all instances of this geometry)
      shader.uniforms.uObjMinY = { value: 0.0 };
      shader.uniforms.uObjMaxY = { value: 1.0 };

      // Gradient / boosts — A-namespaced (independent)
      shader.uniforms.uA_ColorA = { value: new THREE.Color(A_colorA) };
      shader.uniforms.uA_ColorB = { value: new THREE.Color(A_colorB) };
      shader.uniforms.uA_Mid = { value: A_mid };
      shader.uniforms.uA_Soft = { value: A_softness };
      shader.uniforms.uA_BottomSatBoost = { value: A_bottomSatBoost };
      shader.uniforms.uA_BottomEmissiveBoost = { value: A_bottomEmissiveBoost };
      shader.uniforms.uA_BottomFresnelBoost = { value: A_bottomFresnelBoost };
      shader.uniforms.uA_BottomFresnelPower = { value: A_bottomFresnelPower };
      shader.uniforms.uA_EmissiveIntensity = { value: A_emissiveIntensity };

      // NEW: dynamic extra glow (burst decay)
      shader.uniforms.uA_GlowExtra = { value: 0.0 };

      // Per-vertex normalized height vH (instance-aware, world-Y)
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform float uObjMinY, uObjMaxY;
        varying float vH;
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
        uniform vec3  uA_ColorA;
        uniform vec3  uA_ColorB;
        uniform float uA_Mid, uA_Soft;
        uniform float uA_BottomSatBoost;
        uniform float uA_BottomEmissiveBoost;
        uniform float uA_BottomFresnelBoost;
        uniform float uA_BottomFresnelPower;
        uniform float uA_EmissiveIntensity;
        uniform float uA_GlowExtra;   // NEW
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
        float t = smoothstep(uA_Mid - uA_Soft, uA_Mid + uA_Soft, vH);
        vec3 grad = mix(uA_ColorA, uA_ColorB, t);

        // bottom emphasis
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uA_BottomSatBoost * bottom);

        // tint base shading
        gl_FragColor.rgb *= grad;

        // fresnel (slightly stronger near bottom)
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(normalize(normal), V)), 1.3);
        float fresBoost = 1.0 + uA_BottomFresnelBoost * pow(bottom, uA_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // base emissive near bottom
        float eBoost = 1.0 + uA_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uA_EmissiveIntensity * eBoost;

        // NEW: one-shot burst glow (decayed on CPU)
        gl_FragColor.rgb += grad * uA_GlowExtra;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    // keep separate from other variants
    m.customProgramCacheKey = () => "MagicCrystal_A_colorHover_burstGlow_v1";

    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Instancing: write matrices to GPU whenever controls change
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
      const px = ctl[`A_pX_${i}`];
      const py = ctl[`A_pY_${i}`];
      const pz = ctl[`A_pZ_${i}`];

      const rx = d2r(ctl[`A_rX_${i}`]);
      const ry = d2r(ctl[`A_rY_${i}`]);
      const rz = d2r(ctl[`A_rZ_${i}`]);

      const uni = ctl[`A_s_${i}`];
      const sy = ctl[`A_sy_${i}`];

      p.set(px, py, pz);
      e.set(rx, ry, rz);
      q.setFromEuler(e);
      s.set(uni, uni * sy, uni); // keep non-uniform Y scaling
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = COUNT;
    mesh.instanceMatrix.needsUpdate = true;
  }, [ctl]);

  // ===== Keep uniforms / physical params live & seed bbox Y range
  useEffect(() => {
    if (!material) return;
    material.ior = A_ior;
    material.thickness = A_thickness;
    material.attenuationDistance = A_attenuationDistance;
    material.roughness = A_roughness;
    material.emissiveIntensity = A_emissiveIntensity;

    const sdr = material.userData.shader;
    if (sdr) {
      sdr.uniforms.uA_ColorA.value.set(A_colorA);
      sdr.uniforms.uA_ColorB.value.set(A_colorB);
      sdr.uniforms.uA_Mid.value = A_mid;
      sdr.uniforms.uA_Soft.value = A_softness;
      sdr.uniforms.uA_BottomSatBoost.value = A_bottomSatBoost;
      sdr.uniforms.uA_BottomEmissiveBoost.value = A_bottomEmissiveBoost;
      sdr.uniforms.uA_BottomFresnelBoost.value = A_bottomFresnelBoost;
      sdr.uniforms.uA_BottomFresnelPower.value = A_bottomFresnelPower;
      sdr.uniforms.uA_EmissiveIntensity.value = A_emissiveIntensity;
      // uA_GlowExtra is driven in the frame loop
    }
  }, [material, A_colorA, A_colorB, A_mid, A_softness, A_bottomSatBoost, A_bottomEmissiveBoost, A_bottomFresnelBoost, A_bottomFresnelPower, A_ior, A_thickness, A_attenuationDistance, A_roughness, A_emissiveIntensity]);

  // ===== Seed object-space Y bounds into the shader (after geometry ready)
  useEffect(() => {
    if (!geometry || !material?.userData?.shader) return;
    const sdr = material.userData.shader;
    const bb = geometry.boundingBox;
    if (bb) {
      sdr.uniforms.uObjMinY.value = bb.min.y;
      sdr.uniforms.uObjMaxY.value = bb.max.y;
    }
  }, [geometry, material]);

  // ===== Global hover-driven hue (soft range while hovered) + one-shot glow burst
  const baseARef = useRef(new THREE.Color(A_colorA));
  const baseBRef = useRef(new THREE.Color(A_colorB));
  useEffect(() => {
    baseARef.current.set(A_colorA);
  }, [A_colorA]);
  useEffect(() => {
    baseBRef.current.set(A_colorB);
  }, [A_colorB]);

  const hoverMixRef = useRef(0); // 0→base, 1→shifted
  const phaseDegRef = useRef(0); // drives sine; advances only while hovered
  const burstGlowRef = useRef(0); // current burst glow (decays to 0)
  const prevHoveredRef = useRef(false); // for rising-edge detection

  const { camera, pointer } = useThree();
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpS = useMemo(() => new THREE.Vector3(), []);
  const camRight = useMemo(() => new THREE.Vector3(), []);

  // color workers (avoid GC)
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
    h = h - Math.floor(h); // wrap to [0,1)
    outColor.setHSL(h, hsl.s, hsl.l);
    return outColor;
  }

  useFrame((_, dt) => {
    const mesh = instancedRef.current;
    const sdr = material?.userData?.shader;
    if (!mesh || !geometry || !sdr) return;

    // ---- Screen-space hover test across all instances (global) ----
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
        .addScaledVector(camRight, rWorld * A_hoverOuterMult);
      ndcSample.copy(sampleWorld).project(camera);

      const rNdc = Math.hypot(
        ndcSample.x - ndcCenter.x,
        ndcSample.y - ndcCenter.y
      );
      const dNdc = Math.hypot(pointer.x - ndcCenter.x, pointer.y - ndcCenter.y);

      if (dNdc <= rNdc) anyHovered = true;
    }

    // ---- Rising edge → trigger burst; otherwise decay burst ----
    const wasHovered = prevHoveredRef.current;
    if (A_hoverEnabled && anyHovered && !wasHovered) {
      burstGlowRef.current = A_glowStrength; // fire once on entry
    } else if (burstGlowRef.current > 0) {
      const rate = A_glowStrength / Math.max(1e-3, A_glowFadeTime); // linear fade
      burstGlowRef.current = Math.max(0, burstGlowRef.current - rate * dt);
    }
    prevHoveredRef.current = anyHovered;

    // ---- Color: move ONLY while hovered; cool back on exit ----
    const easeK = 1 - Math.exp(-A_hoverEase * dt);

    if (A_hoverEnabled && anyHovered) {
      phaseDegRef.current += A_hueSpeedDeg * dt;
      if (phaseDegRef.current > 1e6) phaseDegRef.current -= 1e6; // keep bounded
      hoverMixRef.current += (1 - hoverMixRef.current) * easeK;
    } else {
      const coolRate = A_coolTime > 0 ? dt / Math.max(1e-3, A_coolTime) : 1.0;
      hoverMixRef.current = Math.max(0, hoverMixRef.current - coolRate);
    }

    // If no color mix and no burst left, snap to base & zero glow and bail early
    if (hoverMixRef.current <= 1e-4 && burstGlowRef.current <= 1e-4) {
      hoverMixRef.current = 0;
      sdr.uniforms.uA_ColorA.value.copy(baseARef.current);
      sdr.uniforms.uA_ColorB.value.copy(baseBRef.current);
      sdr.uniforms.uA_GlowExtra.value = 0.0;
      return;
    }

    // ---- Soft range mapping (sine ping-pong between start & end) ----
    const start = A_hueStartDeg;
    const end = A_hueEndDeg;
    const minD = Math.min(start, end);
    const maxD = Math.max(start, end);
    const mid = (minD + maxD) * 0.5;
    const amp = (maxD - minD) * 0.5;
    const phase = (phaseDegRef.current * Math.PI) / 180.0;

    const offsetDeg = mid + amp * Math.sin(phase);

    // ---- Compute hue-shifted endpoints and blend by hoverMix ----
    shiftHueTHREE(shiftedA, baseARef.current, offsetDeg);
    shiftHueTHREE(shiftedB, baseBRef.current, offsetDeg);

    workA.copy(baseARef.current).lerp(shiftedA, hoverMixRef.current);
    workB.copy(baseBRef.current).lerp(shiftedB, hoverMixRef.current);

    sdr.uniforms.uA_ColorA.value.copy(workA);
    sdr.uniforms.uA_ColorB.value.copy(workB);

    // ---- Apply burst glow (independent of hoverMix) ----
    sdr.uniforms.uA_GlowExtra.value = burstGlowRef.current;
  });

  if (!geometry) return null;

  return (
    <group ref={ref} name="MagicCrystalClusters" {...props}>
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

useGLTF.preload(CRYSTAL_GLB);
