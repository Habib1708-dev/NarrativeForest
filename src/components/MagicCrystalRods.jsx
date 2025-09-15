// src/components/MagicCrystalRods.jsx
import React, { forwardRef, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useThree, useFrame } from "@react-three/fiber";

const ROD_GLB = "/models/magicPlantsAndCrystal/CrystalRod2.glb"; // maps to your public/… path
const COUNT = 10;
const d2r = (deg) => (deg * Math.PI) / 180;

// ---- default placements: all at (-2, -4, -2), rot=0, s=0.15, sy=1.0 ----
const BAKED = Array.from({ length: COUNT }).map(() => ({
  px: -2.0,
  py: -4.0,
  pz: -2.0,
  rx: 0.0,
  ry: 0.0,
  rz: 0.0,
  s: 0.15,
  sy: 1.0,
}));

export default forwardRef(function MagicCrystalRods(props, ref) {
  const { scene } = useGLTF(ROD_GLB);
  const instancedRef = useRef();

  // ===== Instance transforms (R-prefixed) =====
  const makeInstanceFolder = (i) => {
    const d = BAKED[i];
    return folder(
      {
        [`R_pX_${i}`]: {
          value: d.px,
          min: -20,
          max: 20,
          step: 0.001,
          label: "x",
        },
        [`R_pY_${i}`]: {
          value: d.py,
          min: -20,
          max: 20,
          step: 0.001,
          label: "y",
        },
        [`R_pZ_${i}`]: {
          value: d.pz,
          min: -20,
          max: 20,
          step: 0.001,
          label: "z",
        },
        [`R_rX_${i}`]: {
          value: d.rx,
          min: -180,
          max: 180,
          step: 0.1,
          label: "rotX°",
        },
        [`R_rY_${i}`]: {
          value: d.ry,
          min: -180,
          max: 180,
          step: 0.1,
          label: "rotY°",
        },
        [`R_rZ_${i}`]: {
          value: d.rz,
          min: -180,
          max: 180,
          step: 0.1,
          label: "rotZ°",
        },
        [`R_s_${i}`]: {
          value: d.s,
          min: 0.01,
          max: 5,
          step: 0.001,
          label: "scale",
        },
        [`R_sy_${i}`]: {
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
      schema[`R / Instance ${String(i + 1).padStart(2, "0")}`] =
        makeInstanceFolder(i);
    }
    return schema;
  }, []);
  const ctl = useControls("Crystal R / Instances", instanceSchema, {
    collapsed: false,
  });

  // ===== Gradient & Glass (like A) =====
  const {
    R_colorA,
    R_colorB,
    R_mid,
    R_softness,
    R_bottomSatBoost,
    R_bottomEmissiveBoost,
    R_bottomFresnelBoost,
    R_bottomFresnelPower,
  } = useControls("Crystal R / Gradient", {
    R_colorA: { value: "#0099d1ff", label: "Bottom Color (A)" },
    R_colorB: { value: "#bc00f5ff", label: "Top Color (B)" },
    R_mid: {
      value: 0.38,
      min: 0,
      max: 1,
      step: 0.001,
      label: "Blend Midpoint",
    },
    R_softness: {
      value: 0.44,
      min: 0,
      max: 0.5,
      step: 0.001,
      label: "Blend Softness",
    },
    R_bottomSatBoost: {
      value: 0.1,
      min: 0,
      max: 1.5,
      step: 0.01,
      label: "Bottom Saturation +",
    },
    R_bottomEmissiveBoost: {
      value: 2.0,
      min: 0,
      max: 2,
      step: 0.01,
      label: "Bottom Glow +",
    },
    R_bottomFresnelBoost: {
      value: 3.0,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Bottom Fresnel +",
    },
    R_bottomFresnelPower: {
      value: 0.5,
      min: 0.5,
      max: 6,
      step: 0.1,
      label: "Bottom Fresnel Falloff",
    },
  });

  const {
    R_ior,
    R_thickness,
    R_attenuationDistance,
    R_roughness,
    R_emissiveIntensity,
  } = useControls("Crystal R / Glass", {
    R_ior: { value: 2.333, min: 1.0, max: 2.333, step: 0.001 },
    R_thickness: { value: 0.0, min: 0, max: 10, step: 0.01 },
    R_attenuationDistance: { value: 0.1, min: 0.1, max: 200, step: 0.1 },
    R_roughness: { value: 0.0, min: 0, max: 1, step: 0.001 },
    R_emissiveIntensity: { value: 0.3, min: 0, max: 2, step: 0.01 },
  });

  // ===== SHINE controls =====
  const {
    R_reflectBoost,
    R_reflectPower,
    R_rimBoost,
    R_rimPower,
    R_envIntensity,
  } = useControls("Crystal R / Shine", {
    R_reflectBoost: {
      value: 1.2,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Reflect Boost",
    },
    R_reflectPower: {
      value: 2.0,
      min: 1,
      max: 6,
      step: 0.1,
      label: "Reflect Power",
    },
    R_rimBoost: { value: 1.4, min: 0, max: 3, step: 0.01, label: "Rim Boost" },
    R_rimPower: { value: 1.5, min: 1, max: 6, step: 0.1, label: "Rim Power" },
    R_envIntensity: {
      value: 2.0,
      min: 0,
      max: 8,
      step: 0.1,
      label: "EnvMap Intensity",
    },
  });

  // ===== Hover color triplet =====
  const {
    R_hoverEnabled,
    R_hoverEase,
    R_cycleTime,
    R_coolTime,
    Pair_A_Bottom,
    Pair_A_Top,
    Pair_B_Bottom,
    Pair_B_Top,
    Pair_C_Bottom,
    Pair_C_Top,
  } = useControls("Crystal R / Hover Colors", {
    R_hoverEnabled: { value: true, label: "Enabled" },
    R_hoverEase: {
      value: 0.2,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: "Ease In (1/s)",
    },
    R_cycleTime: {
      value: 10,
      min: 0.2,
      max: 10,
      step: 0.05,
      label: "Cycle Step (s)",
    },
    R_coolTime: {
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

  // ===== Geometry (rotate Y-up, cache bbox/sphere) =====
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

  // ===== Material: local split + global-height bias (fades on hover) + shine =====
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      transmission: 1.0,
      thickness: R_thickness,
      ior: R_ior,
      roughness: R_roughness,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      specularIntensity: 1.0,
      color: new THREE.Color("#ffffff"),
      attenuationColor: new THREE.Color("#ffffff"),
      attenuationDistance: R_attenuationDistance,
      transparent: false,
      opacity: 1.0,
      toneMapped: true,
      flatShading: true,
      side: THREE.FrontSide,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: R_emissiveIntensity,
    });

    m.onBeforeCompile = (shader) => {
      shader.uniforms.uObjMinY = { value: 0.0 };
      shader.uniforms.uObjMaxY = { value: 1.0 };

      // Gradient / boosts
      shader.uniforms.uR_ColorA = { value: new THREE.Color(R_colorA) };
      shader.uniforms.uR_ColorB = { value: new THREE.Color(R_colorB) };
      shader.uniforms.uR_Mid = { value: R_mid };
      shader.uniforms.uR_Soft = { value: R_softness };
      shader.uniforms.uR_BottomSatBoost = { value: R_bottomSatBoost };
      shader.uniforms.uR_BottomEmissiveBoost = { value: R_bottomEmissiveBoost };
      shader.uniforms.uR_BottomFresnelBoost = { value: R_bottomFresnelBoost };
      shader.uniforms.uR_BottomFresnelPower = { value: R_bottomFresnelPower };
      shader.uniforms.uR_EmissiveIntensity = { value: R_emissiveIntensity };

      // SHINE
      shader.uniforms.uR_ReflectBoost = { value: R_reflectBoost };
      shader.uniforms.uR_ReflectPower = { value: R_reflectPower };
      shader.uniforms.uR_RimBoost = { value: R_rimBoost };
      shader.uniforms.uR_RimPower = { value: R_rimPower };

      // hover uniformization (fade out instance bias)
      shader.uniforms.uR_UniformFactor = { value: 0.0 }; // 0..1
      shader.uniforms.uR_InstBiasAmp = { value: 0.6 };

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform float uObjMinY, uObjMaxY;
        varying float vH;           // local per-vertex 0..1
        attribute float aInstY01;   // per-instance global Y 0..1
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
        uniform vec3  uR_ColorA;
        uniform vec3  uR_ColorB;
        uniform float uR_Mid, uR_Soft;
        uniform float uR_BottomSatBoost;
        uniform float uR_BottomEmissiveBoost;
        uniform float uR_BottomFresnelBoost;
        uniform float uR_BottomFresnelPower;
        uniform float uR_EmissiveIntensity;

        uniform float uR_ReflectBoost;
        uniform float uR_ReflectPower;
        uniform float uR_RimBoost;
        uniform float uR_RimPower;

        uniform float uR_UniformFactor; // 0..1
        uniform float uR_InstBiasAmp;

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
        // Local split + instance bias that fades on hover
        float tLocal = smoothstep(uR_Mid - uR_Soft, uR_Mid + uR_Soft, vH);
        float bias = (vInstY01 - 0.5) * uR_InstBiasAmp * (1.0 - clamp(uR_UniformFactor, 0.0, 1.0));
        float tMix = clamp(tLocal + bias, 0.0, 1.0);

        vec3 grad = mix(uR_ColorA, uR_ColorB, tMix);

        // Local bottom emphasis
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uR_BottomSatBoost * bottom);

        // Base tint
        gl_FragColor.rgb *= grad;

        // Fresnel + bottom boost
        vec3 N = normalize(normal);
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(N, V)), 1.3);
        float fresBoost = 1.0 + uR_BottomFresnelBoost * pow(bottom, uR_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // Subtle emissive near bottom
        float eBoost = 1.0 + uR_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uR_EmissiveIntensity * eBoost;

        // === SHINE ===
        float fresRef = pow(1.0 - abs(dot(N, V)), max(0.0001, uR_ReflectPower));
        #ifdef USE_ENVMAP
          vec3 R = reflect(-V, N);
          vec3 envBoost = vec3(0.0);
          #ifdef ENVMAP_TYPE_CUBE_UV
            envBoost = envMapIntensity * textureCubeUV(envMap, R, 0.0).rgb;
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, envBoost, clamp(uR_ReflectBoost * fresRef, 0.0, 1.0));
        #endif
        float rim = pow(1.0 - abs(dot(N, V)), max(0.0001, uR_RimPower));
        gl_FragColor.rgb += rim * uR_RimBoost;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    m.customProgramCacheKey = () =>
      "MagicCrystal_R_localSplit_globalBias_shine_v1";
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Upload matrices + global height attribute to InstancedBufferGeometry =====
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
      const px = ctl[`R_pX_${i}`];
      const py = ctl[`R_pY_${i}`];
      const pz = ctl[`R_pZ_${i}`];
      const rx = d2r(ctl[`R_rX_${i}`]);
      const ry = d2r(ctl[`R_rY_${i}`]);
      const rz = d2r(ctl[`R_rZ_${i}`]);
      const uni = ctl[`R_s_${i}`];
      const sy = ctl[`R_sy_${i}`];

      p.set(px, py, pz);
      e.set(rx, ry, rz);
      q.setFromEuler(e);
      s.set(uni, uni * sy, uni);

      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      worldY[i] = py;
    }
    mesh.count = COUNT;
    mesh.instanceMatrix.needsUpdate = true;

    // Normalize world-Y across instances -> 0..1
    let minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < COUNT; i++) {
      if (worldY[i] < minY) minY = worldY[i];
      if (worldY[i] > maxY) maxY = worldY[i];
    }
    const invSpan = 1.0 / Math.max(1e-6, maxY - minY);

    const instY01 = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) instY01[i] = (worldY[i] - minY) * invSpan;

    // Attach to the InstancedBufferGeometry (per-instance data)
    const iGeom = mesh.geometry;
    iGeom.setAttribute(
      "aInstY01",
      new THREE.InstancedBufferAttribute(instY01, 1)
    );
    iGeom.attributes.aInstY01.needsUpdate = true;
  }, [ctl, geometry]);

  // ===== Live updates: physical params, env intensity, and uniforms =====
  useEffect(() => {
    if (!material) return;
    material.ior = R_ior;
    material.thickness = R_thickness;
    material.attenuationDistance = R_attenuationDistance;
    material.roughness = R_roughness;
    material.emissiveIntensity = R_emissiveIntensity;
    material.envMapIntensity = R_envIntensity;

    const sdr = material.userData.shader;
    if (sdr) {
      sdr.uniforms.uR_ColorA.value.set(R_colorA);
      sdr.uniforms.uR_ColorB.value.set(R_colorB);
      sdr.uniforms.uR_Mid.value = R_mid;
      sdr.uniforms.uR_Soft.value = R_softness;
      sdr.uniforms.uR_BottomSatBoost.value = R_bottomSatBoost;
      sdr.uniforms.uR_BottomEmissiveBoost.value = R_bottomEmissiveBoost;
      sdr.uniforms.uR_BottomFresnelBoost.value = R_bottomFresnelBoost;
      sdr.uniforms.uR_BottomFresnelPower.value = R_bottomFresnelPower;
      sdr.uniforms.uR_EmissiveIntensity.value = R_emissiveIntensity;

      sdr.uniforms.uR_ReflectBoost.value = R_reflectBoost;
      sdr.uniforms.uR_ReflectPower.value = R_reflectPower;
      sdr.uniforms.uR_RimBoost.value = R_rimBoost;
      sdr.uniforms.uR_RimPower.value = R_rimPower;

      if (geometry?.boundingBox) {
        sdr.uniforms.uObjMinY.value = geometry.boundingBox.min.y;
        sdr.uniforms.uObjMaxY.value = geometry.boundingBox.max.y;
      }
    }
  }, [material, geometry, R_colorA, R_colorB, R_mid, R_softness, R_bottomSatBoost, R_bottomEmissiveBoost, R_bottomFresnelBoost, R_bottomFresnelPower, R_ior, R_thickness, R_attenuationDistance, R_roughness, R_emissiveIntensity, R_reflectBoost, R_reflectPower, R_rimBoost, R_rimPower, R_envIntensity]);

  // ===== Seed object-space Y bounds once geometry is ready =====
  useEffect(() => {
    if (!geometry || !material?.userData?.shader) return;
    const sdr = material.userData.shader;
    const bb = geometry.boundingBox;
    if (bb) {
      sdr.uniforms.uObjMinY.value = bb.min.y;
      sdr.uniforms.uObjMaxY.value = bb.max.y;
    }
  }, [geometry, material]);

  // ===== Hover logic: soft uniformization + color triplet (no glow) =====
  const baseARef = useRef(new THREE.Color(R_colorA));
  const baseBRef = useRef(new THREE.Color(R_colorB));
  useEffect(() => {
    baseARef.current.set(R_colorA);
  }, [R_colorA]);
  useEffect(() => {
    baseBRef.current.set(R_colorB);
  }, [R_colorB]);

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
  const B_bot = useRef(new THREE.Color(Pair_B_Bottom));
  const B_top = useRef(new THREE.Color(Pair_B_Top));
  const C_bot = useRef(new THREE.Color(Pair_C_Bottom));
  const C_top = useRef(new THREE.Color(Pair_C_Top));
  useEffect(() => {
    A_bot.current.set(Pair_A_Bottom);
  }, [Pair_A_Bottom]);
  useEffect(() => {
    A_top.current.set(Pair_A_Top);
  }, [Pair_A_Top]);
  useEffect(() => {
    B_bot.current.set(Pair_B_Bottom);
  }, [Pair_B_Bottom]);
  useEffect(() => {
    B_top.current.set(Pair_B_Top);
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
        return [B_bot.current, B_top.current];
      default:
        return [C_bot.current, C_top.current];
    }
  }

  useFrame((_, dt) => {
    const mesh = instancedRef.current;
    const sdr = material?.userData?.shader;
    if (!mesh || !geometry || !sdr) return;

    // Global hover test (same pattern)
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
    const easeK = 1 - Math.exp(-R_hoverEase * dt);
    if (R_hoverEnabled && anyHovered) {
      hoverMixRef.current += (1 - hoverMixRef.current) * easeK;
    } else {
      const coolRate = R_coolTime > 0 ? dt / Math.max(1e-3, R_coolTime) : 1.0;
      hoverMixRef.current = Math.max(0, hoverMixRef.current - coolRate);
    }

    // Fade OUT the global-height bias → uniform split during hover
    sdr.uniforms.uR_UniformFactor.value = Math.min(
      1,
      Math.max(0, hoverMixRef.current)
    );

    // Fully cooled → snap base palette and exit
    if ((!R_hoverEnabled || !anyHovered) && hoverMixRef.current <= 1e-4) {
      hoverMixRef.current = 0;
      sdr.uniforms.uR_ColorA.value.copy(baseARef.current);
      sdr.uniforms.uR_ColorB.value.copy(baseBRef.current);
      return;
    }

    // Color pair progression (A→B→C) while hovered
    if (R_hoverEnabled && anyHovered && !wasHovered) segTRef.current = 0;
    if (R_hoverEnabled && anyHovered) {
      const dur = Math.max(0.05, R_cycleTime);
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

    sdr.uniforms.uR_ColorA.value.copy(outA);
    sdr.uniforms.uR_ColorB.value.copy(outB);
  });

  if (!geometry) return null;

  return (
    <group ref={ref} name="MagicCrystalRods" {...props}>
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

useGLTF.preload(ROD_GLB);
