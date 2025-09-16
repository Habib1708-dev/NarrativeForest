// src/components/MagicCrystalClusters2.jsx
import React, { forwardRef, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useThree, useFrame } from "@react-three/fiber";

const CRYSTAL2_GLB = "/models/magicPlantsAndCrystal/CrystalCluster2.glb";
const COUNT = 25;
const d2r = (deg) => (deg * Math.PI) / 180;

// ---- 25 baked placements (rotY in degrees) ----
// NOTE: Indices 15..24 are the new values you provided, rounded to 3 decimals.
const BAKED = [
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

  // 16th (index 15)
  { px: -1.383, py: -4.841, pz: -1.92, ry: 137.9, s: 0.065 },
  // 17th (index 16)
  { px: -2.449, py: -4.542, pz: -1.766, ry: 0.0, s: 0.102 },
  // 18th (index 17)
  { px: -1.34, py: -4.72, pz: -1.813, ry: -47.1, s: 0.09 },
  // 19th (index 18)
  { px: -1.663, py: -4.76, pz: -1.813, ry: 154.8, s: 0.08 },
  // 20th (index 19)
  { px: -1.215, py: -4.767, pz: -1.86, ry: 128.1, s: 0.084 },
  // 21st (index 20)
  { px: -2.49, py: -4.73, pz: -2.953, ry: 103.4, s: 0.074 },
  // 22nd (index 21)
  { px: -1.046, py: -4.561, pz: -2.467, ry: 118.6, s: 0.084 },
  // 23rd (index 22)
  { px: -0.822, py: -4.348, pz: -2.49, ry: -84.1, s: 0.086 },
  // 24th (index 23)
  { px: -1.012, py: -4.36, pz: -2.888, ry: -168.2, s: 0.112 },
  // 25th (index 24) — rotation not provided, defaulted to 0.0
  { px: -1.047, py: -4.416, pz: -3.0, ry: 0.0, s: 0.107 },
];

export default forwardRef(function MagicCrystalClusters2(props, ref) {
  const { scene } = useGLTF(CRYSTAL2_GLB);
  const instancedRef = useRef();

  // ===== Instance transforms (B-prefixed) =====
  const instanceSchema = useMemo(() => {
    const schema = {};
    for (let i = 0; i < COUNT; i++) {
      const d = BAKED[i] ?? { px: -2, py: -4, pz: -2, ry: 0, s: 0.5 };
      const label = `B / Instance ${String(i + 1).padStart(2, "0")}`;
      schema[label] = folder(
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
            value: d.ry,
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
  }, []);
  const ctl = useControls("Crystal B / Instances", instanceSchema, {
    collapsed: false,
  });

  // ===== Gradient & Glass (match A’s settings) =====
  const {
    B_colorA,
    B_colorB,
    B_mid,
    B_softness,
    B_bottomSatBoost,
    B_bottomEmissiveBoost,
    B_bottomFresnelBoost,
    B_bottomFresnelPower,
  } = useControls("Crystal B / Gradient", {
    B_colorA: { value: "#0099d1ff", label: "Bottom Color (A)" },
    B_colorB: { value: "#bc00f5ff", label: "Top Color (B)" },
    B_mid: {
      value: 0.38,
      min: 0,
      max: 1,
      step: 0.001,
      label: "Blend Midpoint",
    },
    B_softness: {
      value: 0.44,
      min: 0,
      max: 0.5,
      step: 0.001,
      label: "Blend Softness",
    },
    B_bottomSatBoost: {
      value: 0.1,
      min: 0,
      max: 1.5,
      step: 0.01,
      label: "Bottom Saturation +",
    },
    B_bottomEmissiveBoost: {
      value: 2.0,
      min: 0,
      max: 2,
      step: 0.01,
      label: "Bottom Glow +",
    },
    B_bottomFresnelBoost: {
      value: 3.0,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Bottom Fresnel +",
    },
    B_bottomFresnelPower: {
      value: 0.5,
      min: 0.5,
      max: 6,
      step: 0.1,
      label: "Bottom Fresnel Falloff",
    },
  });

  const {
    B_ior,
    B_thickness,
    B_attenuationDistance,
    B_roughness,
    B_emissiveIntensity,
  } = useControls("Crystal B / Glass", {
    B_ior: { value: 2.333, min: 1.0, max: 2.333, step: 0.001 },
    B_thickness: { value: 0.0, min: 0, max: 10, step: 0.01 },
    B_attenuationDistance: { value: 0.1, min: 0.1, max: 200, step: 0.1 },
    B_roughness: { value: 0.0, min: 0, max: 1, step: 0.001 },
    B_emissiveIntensity: { value: 0.3, min: 0, max: 2, step: 0.01 },
  });

  // ===== SHINE controls (env reflection + rim) =====
  const {
    B_reflectBoost,
    B_reflectPower,
    B_rimBoost,
    B_rimPower,
    B_envIntensity,
  } = useControls("Crystal B / Shine", {
    B_reflectBoost: {
      value: 1.2,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Reflect Boost",
    },
    B_reflectPower: {
      value: 2.0,
      min: 1,
      max: 6,
      step: 0.1,
      label: "Reflect Power",
    },
    B_rimBoost: { value: 1.4, min: 0, max: 3, step: 0.01, label: "Rim Boost" },
    B_rimPower: { value: 1.5, min: 1, max: 6, step: 0.1, label: "Rim Power" },
    B_envIntensity: {
      value: 2.0,
      min: 0,
      max: 8,
      step: 0.1,
      label: "EnvMap Intensity",
    },
  });

  // ===== Hover color triplet (A→B→C) =====
  const {
    B_hoverEnabled,
    B_hoverEase,
    B_cycleTime,
    B_coolTime,
    Pair_A_Bottom,
    Pair_A_Top,
    Pair_B_Bottom,
    Pair_B_Top,
    Pair_C_Bottom,
    Pair_C_Top,
  } = useControls("Crystal B / Hover Colors", {
    B_hoverEnabled: { value: true, label: "Enabled" },
    B_hoverEase: {
      value: 0.2,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: "Ease In (1/s)",
    },
    B_cycleTime: {
      value: 10,
      min: 0.2,
      max: 10,
      step: 0.05,
      label: "Cycle Step (s)",
    },
    B_coolTime: {
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

  // ===== Geometry (rotate to Y-up, cache bbox/sphere)
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

  // ===== Material: local split + global-height bias (fades on hover) + shine
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      transmission: 1.0,
      thickness: 0.0,
      ior: 2.333,
      roughness: 0.0,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      specularIntensity: 1.0,
      color: new THREE.Color("#ffffff"),
      attenuationColor: new THREE.Color("#ffffff"),
      attenuationDistance: 0.1,
      transparent: false,
      opacity: 1.0,
      toneMapped: true,
      flatShading: true,
      side: THREE.FrontSide,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: 0.3,
    });

    m.onBeforeCompile = (shader) => {
      shader.uniforms.uObjMinY = { value: 0.0 };
      shader.uniforms.uObjMaxY = { value: 1.0 };

      // Gradient/boosts — B namespace
      shader.uniforms.uB_ColorA = { value: new THREE.Color("#0099d1") };
      shader.uniforms.uB_ColorB = { value: new THREE.Color("#bc00f5") };
      shader.uniforms.uB_Mid = { value: 0.38 };
      shader.uniforms.uB_Soft = { value: 0.44 };
      shader.uniforms.uB_BottomSatBoost = { value: 0.1 };
      shader.uniforms.uB_BottomEmissiveBoost = { value: 2.0 };
      shader.uniforms.uB_BottomFresnelBoost = { value: 3.0 };
      shader.uniforms.uB_BottomFresnelPower = { value: 0.5 };
      shader.uniforms.uB_EmissiveIntensity = { value: 0.3 };

      // SHINE
      shader.uniforms.uB_ReflectBoost = { value: 1.2 };
      shader.uniforms.uB_ReflectPower = { value: 2.0 };
      shader.uniforms.uB_RimBoost = { value: 1.4 };
      shader.uniforms.uB_RimPower = { value: 1.5 };

      // hover uniformization (fade out instance bias)
      shader.uniforms.uB_UniformFactor = { value: 0.0 }; // 0..1
      shader.uniforms.uB_InstBiasAmp = { value: 0.6 };

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
        uniform vec3  uB_ColorA;
        uniform vec3  uB_ColorB;
        uniform float uB_Mid, uB_Soft;
        uniform float uB_BottomSatBoost;
        uniform float uB_BottomEmissiveBoost;
        uniform float uB_BottomFresnelBoost;
        uniform float uB_BottomFresnelPower;
        uniform float uB_EmissiveIntensity;

        uniform float uB_ReflectBoost;
        uniform float uB_ReflectPower;
        uniform float uB_RimBoost;
        uniform float uB_RimPower;

        uniform float uB_UniformFactor; // 0..1
        uniform float uB_InstBiasAmp;

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
        // Local split (always) + instance bias that fades on hover
        float tLocal = smoothstep(uB_Mid - uB_Soft, uB_Mid + uB_Soft, vH);
        float bias = (vInstY01 - 0.5) * uB_InstBiasAmp * (1.0 - clamp(uB_UniformFactor, 0.0, 1.0));
        float tMix = clamp(tLocal + bias, 0.0, 1.0);

        vec3 grad = mix(uB_ColorA, uB_ColorB, tMix);

        // Local bottom emphasis
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uB_BottomSatBoost * bottom);

        // Base tint
        gl_FragColor.rgb *= grad;

        // Fresnel + bottom boost
        vec3 N = normalize(normal);
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(N, V)), 1.3);
        float fresBoost = 1.0 + uB_BottomFresnelBoost * pow(bottom, uB_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // Subtle emissive near bottom
        float eBoost = 1.0 + uB_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uB_EmissiveIntensity * eBoost;

        // === SHINE ===
        float fresRef = pow(1.0 - abs(dot(N, V)), max(0.0001, uB_ReflectPower));
        #ifdef USE_ENVMAP
          vec3 R = reflect(-V, N);
          vec3 envBoost = vec3(0.0);
          #ifdef ENVMAP_TYPE_CUBE_UV
            envBoost = envMapIntensity * textureCubeUV(envMap, R, 0.0).rgb;
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, envBoost, clamp(uB_ReflectBoost * fresRef, 0.0, 1.0));
        #endif
        float rim = pow(1.0 - abs(dot(N, V)), max(0.0001, uB_RimPower));
        gl_FragColor.rgb += rim * uB_RimBoost;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    m.customProgramCacheKey = () =>
      "MagicCrystal_B_localSplit_globalBias_shine_v1";
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Instancing: write matrices + global height attribute to INSTANCED GEOMETRY
  useEffect(() => {
    const mesh = instancedRef.current;
    if (!mesh || !geometry) return;

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler(0, 0, 0, "XYZ");

    const worldY = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      const px = ctl[`B_pX_${i}`];
      const py = ctl[`B_pY_${i}`];
      const pz = ctl[`B_pZ_${i}`];
      const ry = d2r(ctl[`B_rY_${i}`]);
      const uni = ctl[`B_s_${i}`];

      p.set(px, py, pz);
      e.set(0, ry, 0);
      q.setFromEuler(e);
      s.set(uni, uni, uni);

      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      worldY[i] = py;
    }
    mesh.count = COUNT;
    mesh.instanceMatrix.needsUpdate = true;

    let minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < COUNT; i++) {
      if (worldY[i] < minY) minY = worldY[i];
      if (worldY[i] > maxY) maxY = worldY[i];
    }
    const invSpan = 1.0 / Math.max(1e-6, maxY - minY);

    const instY01 = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) instY01[i] = (worldY[i] - minY) * invSpan;

    // Attach to the InstancedBufferGeometry (critical for per-instance behavior)
    const iGeom = mesh.geometry;
    iGeom.setAttribute(
      "aInstY01",
      new THREE.InstancedBufferAttribute(instY01, 1)
    );
    iGeom.attributes.aInstY01.needsUpdate = true;
  }, [ctl, geometry]);

  // ===== Live uniforms / physical params & env intensity
  useEffect(() => {
    if (!material) return;
    material.ior = B_ior;
    material.thickness = B_thickness;
    material.attenuationDistance = B_attenuationDistance;
    material.roughness = B_roughness;
    material.emissiveIntensity = B_emissiveIntensity;
    material.envMapIntensity = B_envIntensity;

    const sdr = material.userData.shader;
    if (sdr) {
      sdr.uniforms.uB_ColorA.value.set(B_colorA);
      sdr.uniforms.uB_ColorB.value.set(B_colorB);
      sdr.uniforms.uB_Mid.value = B_mid;
      sdr.uniforms.uB_Soft.value = B_softness;
      sdr.uniforms.uB_BottomSatBoost.value = B_bottomSatBoost;
      sdr.uniforms.uB_BottomEmissiveBoost.value = B_bottomEmissiveBoost;
      sdr.uniforms.uB_BottomFresnelBoost.value = B_bottomFresnelBoost;
      sdr.uniforms.uB_BottomFresnelPower.value = B_bottomFresnelPower;
      sdr.uniforms.uB_EmissiveIntensity.value = B_emissiveIntensity;

      sdr.uniforms.uB_ReflectBoost.value = B_reflectBoost;
      sdr.uniforms.uB_ReflectPower.value = B_reflectPower;
      sdr.uniforms.uB_RimBoost.value = B_rimBoost;
      sdr.uniforms.uB_RimPower.value = B_rimPower;

      if (geometry?.boundingBox) {
        sdr.uniforms.uObjMinY.value = geometry.boundingBox.min.y;
        sdr.uniforms.uObjMaxY.value = geometry.boundingBox.max.y;
      }
    }
  }, [material, geometry, B_colorA, B_colorB, B_mid, B_softness, B_bottomSatBoost, B_bottomEmissiveBoost, B_bottomFresnelBoost, B_bottomFresnelPower, B_ior, B_thickness, B_attenuationDistance, B_roughness, B_emissiveIntensity, B_reflectBoost, B_reflectPower, B_rimBoost, B_rimPower, B_envIntensity]);

  // ===== Hover logic (unchanged) =====
  const baseARef = useRef(new THREE.Color(B_colorA));
  const baseBRef = useRef(new THREE.Color(B_colorB));
  useEffect(() => {
    baseARef.current.set(B_colorA);
  }, [B_colorA]);
  useEffect(() => {
    baseBRef.current.set(B_colorB);
  }, [B_colorB]);

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

  const A_bot = useRef(new THREE.Color(Pair_A_Bottom));
  const A_top = useRef(new THREE.Color(Pair_A_Top));
  const B_botCol = useRef(new THREE.Color(Pair_B_Bottom));
  const B_topCol = useRef(new THREE.Color(Pair_B_Top));
  const C_bot = useRef(new THREE.Color(Pair_C_Bottom));
  const C_top = useRef(new THREE.Color(Pair_C_Top));
  useEffect(() => {
    A_bot.current.set(Pair_A_Bottom);
  }, [Pair_A_Bottom]);
  useEffect(() => {
    A_top.current.set(Pair_A_Top);
  }, [Pair_A_Top]);
  useEffect(() => {
    B_botCol.current.set(Pair_B_Bottom);
  }, [Pair_B_Bottom]);
  useEffect(() => {
    B_topCol.current.set(Pair_B_Top);
  }, [Pair_B_Top]);
  useEffect(() => {
    C_bot.current.set(Pair_C_Bottom);
  }, [Pair_C_Bottom]);
  useEffect(() => {
    C_top.current.set(Pair_C_Top);
  }, [Pair_C_Top]);

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
        return [A_bot.current, A_top.current];
      case 1:
        return [B_botCol.current, B_topCol.current];
      default:
        return [C_bot.current, C_top.current];
    }
  }

  useFrame((_, dt) => {
    const mesh = instancedRef.current;
    const sdr = material?.userData?.shader;
    if (!mesh || !geometry || !sdr) return;

    // Global hover test (screen-space circle)
    camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    let anyHovered = false;
    const sphereRadius = baseRadius || 1;

    for (let i = 0; i < COUNT && !anyHovered; i++) {
      mesh.getMatrixAt(i, tmpM);
      tmpM.decompose(tmpP, tmpQ, tmpS);
      const rWorld = sphereRadius * Math.max(tmpS.x, tmpS.y, tmpS.z);
      ndcCenter.copy(tmpP).project(camera);
      sampleWorld.copy(tmpP).addScaledVector(camRight, rWorld * 2.2);
      ndcSample.copy(sampleWorld).project(camera);
      const rNdc = Math.hypot(
        ndcSample.x - ndcCenter.x,
        ndcSample.y - ndcCenter.y
      );
      const dNdc = Math.hypot(pointer.x - ndcCenter.x, pointer.y - ndcCenter.y);
      if (dNdc <= rNdc) anyHovered = true;
    }

    const wasHovered = prevHoveredRef.current;
    prevHoveredRef.current = anyHovered;

    // Ease in while hovered, cool back when not
    const easeK = 1 - Math.exp(-B_hoverEase * dt);
    if (B_hoverEnabled && anyHovered) {
      hoverMixRef.current += (1 - hoverMixRef.current) * easeK;
    } else {
      const coolRate = B_coolTime > 0 ? dt / Math.max(1e-3, B_coolTime) : 1.0;
      hoverMixRef.current = Math.max(0, hoverMixRef.current - coolRate);
    }

    // Fade OUT the global-height bias → uniform split during hover
    sdr.uniforms.uB_UniformFactor.value = Math.min(
      1,
      Math.max(0, hoverMixRef.current)
    );

    // Fully cooled → snap base palette and exit
    if ((!B_hoverEnabled || !anyHovered) && hoverMixRef.current <= 1e-4) {
      hoverMixRef.current = 0;
      sdr.uniforms.uB_ColorA.value.copy(baseARef.current);
      sdr.uniforms.uB_ColorB.value.copy(baseBRef.current);
      return;
    }

    // Color pair progression (A→B→C) while hovered
    if (B_hoverEnabled && anyHovered && !wasHovered) segTRef.current = 0;
    if (B_hoverEnabled && anyHovered) {
      const dur = Math.max(0.05, B_cycleTime);
      segTRef.current += dt / dur;
      if (segTRef.current >= 1.0) {
        segIdxRef.current = (segIdxRef.current + 1) % 3;
        segTRef.current -= 1.0;
      }
    }

    const t = segTRef.current;
    const tSmooth = t * t * (3 - 2 * t);
    const fromIdx = segIdxRef.current,
      toIdx = (fromIdx + 1) % 3;
    const [fromBot, fromTop] = getPair(fromIdx);
    const [toBot, toTop] = getPair(toIdx);

    lerpFromBot.copy(fromBot);
    lerpFromTop.copy(fromTop);
    targetBot.copy(toBot);
    targetTop.copy(toTop);

    curHoverBot.copy(lerpFromBot).lerp(targetBot, tSmooth);
    curHoverTop.copy(lerpFromTop).lerp(targetTop, tSmooth);

    outA.copy(baseARef.current).lerp(curHoverBot, hoverMixRef.current);
    outB.copy(baseBRef.current).lerp(curHoverTop, hoverMixRef.current);

    sdr.uniforms.uB_ColorA.value.copy(outA);
    sdr.uniforms.uB_ColorB.value.copy(outB);
  });

  if (!geometry) return null;

  return (
    <group ref={ref} name="MagicCrystalClusters2" {...props}>
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

useGLTF.preload(CRYSTAL2_GLB);
