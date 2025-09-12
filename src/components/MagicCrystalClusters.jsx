import React, { forwardRef, useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useFrame, useThree } from "@react-three/fiber";

const CRYSTAL_GLB = "/models/magicPlantsAndCrystal/CrystalCluster.glb";
const COUNT = 15;
const d2r = (deg) => (deg * Math.PI) / 180;

// ---- baked placements ----
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

  // === Instance controls ===
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
    for (let i = 0; i < COUNT; i++)
      schema[`A / Instance ${String(i + 1).padStart(2, "0")}`] =
        makeInstanceFolder(i);
    return schema;
  }, []);
  const ctl = useControls("Crystal A / Instances", instanceSchema, {
    collapsed: false,
  });

  // === Base gradient & glass ===
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
    A_colorA: { value: "#0099d1ff", label: "Bottom Color (A)" },
    A_colorB: { value: "#bc00f5ff", label: "Top Color (B)" },
    A_mid: {
      value: 0.38,
      min: 0,
      max: 1,
      step: 0.001,
      label: "Blend Midpoint",
    },
    A_softness: {
      value: 0.44,
      min: 0,
      max: 0.5,
      step: 0.001,
      label: "Blend Softness",
    },
    A_bottomSatBoost: {
      value: 0.1,
      min: 0,
      max: 1.5,
      step: 0.01,
      label: "Bottom Saturation +",
    },
    A_bottomEmissiveBoost: {
      value: 2.0,
      min: 0,
      max: 2,
      step: 0.01,
      label: "Bottom Glow +",
    },
    A_bottomFresnelBoost: {
      value: 3.0,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Bottom Fresnel +",
    },
    A_bottomFresnelPower: {
      value: 0.5,
      min: 0.5,
      max: 6,
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
    A_ior: { value: 2.333, min: 1.0, max: 2.333, step: 0.001 },
    A_thickness: { value: 0.0, min: 0, max: 10, step: 0.01 },
    A_attenuationDistance: { value: 0.1, min: 0.1, max: 200, step: 0.1 },
    A_roughness: { value: 0.0, min: 0, max: 1, step: 0.001 },
    A_emissiveIntensity: { value: 0.3, min: 0, max: 2, step: 0.01 },
  });

  // === SHINE controls (env reflection + rim) ===
  const {
    A_reflectBoost,
    A_reflectPower,
    A_rimBoost,
    A_rimPower,
    A_envIntensity,
  } = useControls("Crystal A / Shine", {
    A_reflectBoost: {
      value: 1.2,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Reflect Boost",
    },
    A_reflectPower: {
      value: 2.0,
      min: 1,
      max: 6,
      step: 0.1,
      label: "Reflect Power",
    },
    A_rimBoost: { value: 1.4, min: 0, max: 3, step: 0.01, label: "Rim Boost" },
    A_rimPower: { value: 1.5, min: 1, max: 6, step: 0.1, label: "Rim Power" },
    A_envIntensity: {
      value: 2.0,
      min: 0,
      max: 8,
      step: 0.1,
      label: "EnvMap Intensity",
    },
  });

  // === Hover triplet (A→B→C loop) ===
  const {
    A_hoverEnabled,
    A_hoverEase,
    A_cycleTime,
    A_coolTime,
    Pair_A_Bottom,
    Pair_A_Top,
    Pair_B_Bottom,
    Pair_B_Top,
    Pair_C_Bottom,
    Pair_C_Top,
  } = useControls("Crystal A / Hover Colors", {
    A_hoverEnabled: { value: true, label: "Enabled" },
    A_hoverEase: {
      value: 0.2,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: "Ease In (1/s)",
    },
    A_cycleTime: {
      value: 10,
      min: 0.2,
      max: 10,
      step: 0.05,
      label: "Cycle Step (s)",
    },
    A_coolTime: {
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

  // === Geometry (Y-up) ===
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

  // === Material: local split (vH) + optional global-height bias (fades on hover) + shine ===
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      transmission: 1.0,
      thickness: A_thickness,
      ior: A_ior,
      roughness: A_roughness,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      specularIntensity: 1.0,
      color: new THREE.Color("#ffffff"),
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
      shader.uniforms.uObjMinY = { value: 0.0 };
      shader.uniforms.uObjMaxY = { value: 1.0 };

      // gradient palette
      shader.uniforms.uA_ColorA = { value: new THREE.Color(A_colorA) };
      shader.uniforms.uA_ColorB = { value: new THREE.Color(A_colorB) };
      shader.uniforms.uA_Mid = { value: A_mid };
      shader.uniforms.uA_Soft = { value: A_softness };
      shader.uniforms.uA_BottomSatBoost = { value: A_bottomSatBoost };
      shader.uniforms.uA_BottomEmissiveBoost = { value: A_bottomEmissiveBoost };
      shader.uniforms.uA_BottomFresnelBoost = { value: A_bottomFresnelBoost };
      shader.uniforms.uA_BottomFresnelPower = { value: A_bottomFresnelPower };
      shader.uniforms.uA_EmissiveIntensity = { value: A_emissiveIntensity };

      // SHINE
      shader.uniforms.uA_ReflectBoost = { value: A_reflectBoost };
      shader.uniforms.uA_ReflectPower = { value: A_reflectPower };
      shader.uniforms.uA_RimBoost = { value: A_rimBoost };
      shader.uniforms.uA_RimPower = { value: A_rimPower };

      // uniformization factor (0..1): fades OUT global-height bias on hover
      shader.uniforms.uA_UniformFactor = { value: 0.0 };
      shader.uniforms.uA_InstBiasAmp = { value: 0.6 };

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
        uniform vec3  uA_ColorA;
        uniform vec3  uA_ColorB;
        uniform float uA_Mid, uA_Soft;
        uniform float uA_BottomSatBoost;
        uniform float uA_BottomEmissiveBoost;
        uniform float uA_BottomFresnelBoost;
        uniform float uA_BottomFresnelPower;
        uniform float uA_EmissiveIntensity;

        uniform float uA_ReflectBoost;
        uniform float uA_ReflectPower;
        uniform float uA_RimBoost;
        uniform float uA_RimPower;

        uniform float uA_UniformFactor; // 0..1
        uniform float uA_InstBiasAmp;

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
        // Local split (ALWAYS): ensures per-mesh vertical gradient during hover too
        float tLocal = smoothstep(uA_Mid - uA_Soft, uA_Mid + uA_Soft, vH);

        // Instance bias from global placement; fades out as uA_UniformFactor→1
        float bias = (vInstY01 - 0.5) * uA_InstBiasAmp * (1.0 - clamp(uA_UniformFactor, 0.0, 1.0));

        float tMix = clamp(tLocal + bias, 0.0, 1.0);
        vec3 grad = mix(uA_ColorA, uA_ColorB, tMix);

        // Local bottom emphasis
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uA_BottomSatBoost * bottom);

        // Base tint
        gl_FragColor.rgb *= grad;

        // Fresnel
        vec3 N = normalize(normal);
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(N, V)), 1.3);
        float fresBoost = 1.0 + uA_BottomFresnelBoost * pow(bottom, uA_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // Subtle emissive near bottom
        float eBoost = 1.0 + uA_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uA_EmissiveIntensity * eBoost;

        // === SHINE ===
        float fresRef = pow(1.0 - abs(dot(N, V)), max(0.0001, uA_ReflectPower));
        #ifdef USE_ENVMAP
          vec3 R = reflect(-V, N);
          vec3 envBoost = vec3(0.0);
          #ifdef ENVMAP_TYPE_CUBE_UV
            envBoost = envMapIntensity * textureCubeUV(envMap, R, 0.0).rgb;
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, envBoost, clamp(uA_ReflectBoost * fresRef, 0.0, 1.0));
        #endif
        float rim = pow(1.0 - abs(dot(N, V)), max(0.0001, uA_RimPower));
        gl_FragColor.rgb += rim * uA_RimBoost;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    m.customProgramCacheKey = () =>
      "MagicCrystal_A_localSplit_globalBias_shine_v6";
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Upload matrices + global height attribute (write to instanced geometry!) ===
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
      s.set(uni, uni * sy, uni);
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

    // IMPORTANT: attach instanced attribute to the *instanced mesh* geometry
    const iGeom = mesh.geometry; // InstancedBufferGeometry
    iGeom.setAttribute(
      "aInstY01",
      new THREE.InstancedBufferAttribute(instY01, 1)
    );
    iGeom.attributes.aInstY01.needsUpdate = true;
  }, [ctl, geometry]);

  // === Live updates: physical params & uniforms ===
  useEffect(() => {
    if (!material) return;
    material.ior = A_ior;
    material.thickness = A_thickness;
    material.attenuationDistance = A_attenuationDistance;
    material.roughness = A_roughness;
    material.emissiveIntensity = A_emissiveIntensity;
    material.envMapIntensity = A_envIntensity;

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

      sdr.uniforms.uA_ReflectBoost.value = A_reflectBoost;
      sdr.uniforms.uA_ReflectPower.value = A_reflectPower;
      sdr.uniforms.uA_RimBoost.value = A_rimBoost;
      sdr.uniforms.uA_RimPower.value = A_rimPower;
    }
  }, [material, A_colorA, A_colorB, A_mid, A_softness, A_bottomSatBoost, A_bottomEmissiveBoost, A_bottomFresnelBoost, A_bottomFresnelPower, A_ior, A_thickness, A_attenuationDistance, A_roughness, A_emissiveIntensity, A_reflectBoost, A_reflectPower, A_rimBoost, A_rimPower, A_envIntensity]);

  // === Seed object-space Y bounds for local vH ===
  useEffect(() => {
    if (!geometry || !material?.userData?.shader) return;
    const sdr = material.userData.shader;
    const bb = geometry.boundingBox;
    if (bb) {
      sdr.uniforms.uObjMinY.value = bb.min.y;
      sdr.uniforms.uObjMaxY.value = bb.max.y;
    }
  }, [geometry, material]);

  // === Hover logic: soft uniformization + color triplet (no glow) ===
  const baseARef = useRef(new THREE.Color(A_colorA));
  const baseBRef = useRef(new THREE.Color(A_colorB));
  useEffect(() => {
    baseARef.current.set(A_colorA);
  }, [A_colorA]);
  useEffect(() => {
    baseBRef.current.set(A_colorB);
  }, [A_colorB]);

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

    // Global hover test
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
    const easeK = 1 - Math.exp(-A_hoverEase * dt);
    if (A_hoverEnabled && anyHovered) {
      hoverMixRef.current += (1 - hoverMixRef.current) * easeK;
    } else {
      const coolRate = A_coolTime > 0 ? dt / Math.max(1e-3, A_coolTime) : 1.0;
      hoverMixRef.current = Math.max(0, hoverMixRef.current - coolRate);
    }

    // Fade OUT the global-height bias → uniform split across instances
    sdr.uniforms.uA_UniformFactor.value = Math.min(
      1,
      Math.max(0, hoverMixRef.current)
    );

    // If fully cooled → snap palette back and exit
    if ((!A_hoverEnabled || !anyHovered) && hoverMixRef.current <= 1e-4) {
      hoverMixRef.current = 0;
      sdr.uniforms.uA_ColorA.value.copy(baseARef.current);
      sdr.uniforms.uA_ColorB.value.copy(baseBRef.current);
      return;
    }

    // Color pair progression (A→B→C) only while hovered
    if (A_hoverEnabled && anyHovered && !wasHovered) segTRef.current = 0;
    if (A_hoverEnabled && anyHovered) {
      const dur = Math.max(0.05, A_cycleTime);
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

    sdr.uniforms.uA_ColorA.value.copy(outA);
    sdr.uniforms.uA_ColorB.value.copy(outB);
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
