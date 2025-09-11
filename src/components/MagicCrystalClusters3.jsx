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

/**
 * BAKED defaults for 8 instances (rounded to 3 decimals).
 * Any missing field falls back to center: x=-2, y=-4, z=-2, ry=0, s=0.15
 */
const FALLBACK = { px: -2.0, py: -4.0, pz: -2.0, ry: 0.0, s: 0.15 };
const BAKED = [
  // 1
  { px: -2.47, py: -4.56, pz: -1.5, ry: -30.4, s: 0.18 },
  // 2
  { px: -2.22, py: -4.67, pz: -1.62, ry: 13.4, s: 0.13 },
  // 3
  { px: -2.8, py: -4.47, pz: -2.9, ry: 0.0, s: 0.18 },
  // 4
  { px: -2.48, py: -4.46, pz: -3.6, ry: 0.0, s: 0.12 },
  // 5
  { px: -2.8, py: -4.48, pz: -3.121, ry: 0.0, s: 0.14 },
  // 6
  { px: -2.6, py: -4.5, pz: -1.47, ry: -144.7, s: 0.16 },
  // 7
  { px: -2.7, py: -4.53, pz: -2.2, ry: -30.2, s: 0.17 },
  // 8
  { px: -0.97, py: -4.28, pz: -2.8, ry: 180.0, s: 0.14 },
];

/**
 * Glass material with 2-color vertical gradient + fresnel.
 * Adds per-instance hover glow via instanced attribute `aHover`:
 * shader adds grad * mix(uC_HoverMin, uC_HoverMax, vHover).
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
  hoverMin,
  hoverMax,
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
      // Object-space Y bounds (same across instances)
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

      // Hover glow range
      shader.uniforms.uC_HoverMin = { value: hoverMin };
      shader.uniforms.uC_HoverMax = { value: hoverMax };

      // Add instanced hover attribute → varying
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform float uObjMinY, uObjMaxY;
        attribute float aHover;
        varying float vH;
        varying float vHover;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vec3 pos = transformed;

        // World position (instance-aware) to compute normalized height
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
        vHover = aHover;
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
        uniform float uC_HoverMin;
        uniform float uC_HoverMax;
        varying float vH;
        varying float vHover;

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
        // base gradient (A->B)
        float t = smoothstep(uC_Mid - uC_Soft, uC_Mid + uC_Soft, vH);
        vec3 grad = mix(uC_ColorA, uC_ColorB, t);

        // more saturation near bottom
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uC_BottomSatBoost * bottom);

        // tint base shading
        gl_FragColor.rgb *= grad;

        // fresnel, stronger near bottom
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(normalize(normal), V)), 1.3);
        float fresBoost = 1.0 + uC_BottomFresnelBoost * pow(bottom, uC_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // base emissive near bottom
        float eBoost = 1.0 + uC_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uC_EmissiveIntensity * eBoost;

        // ADD: per-instance hover glow
        float hoverGlow = mix(uC_HoverMin, uC_HoverMax, clamp(vHover, 0.0, 1.0));
        gl_FragColor.rgb += grad * hoverGlow;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    // Ensure a unique WebGLProgram (independent from other crystals)
    m.customProgramCacheKey = () => "MagicCrystal_C_hoverGlow_v1";

    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live updates from Leva
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
      s.uniforms.uC_HoverMin.value = hoverMin;
      s.uniforms.uC_HoverMax.value = hoverMax;
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
    hoverMin,
    hoverMax,
  ]);

  return mat;
}

export default forwardRef(function MagicCrystalClusters3(props, ref) {
  const { scene } = useGLTF(CLUSTER4_GLB);
  const instancedRef = useRef();

  // ——— Gradient & Glass controls (independent C-namespace) ———
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

  // ——— Hover glow controls ———
  const {
    C_hoverEnabled,
    C_hoverOuterMult,
    C_hoverFalloffExp,
    C_hoverEase,
    C_hoverMinGlow,
    C_hoverMaxGlow,
  } = useControls("Crystal C / Hover Glow", {
    C_hoverEnabled: { value: true, label: "Enabled" },
    C_hoverOuterMult: {
      value: 4.0,
      min: 0.5,
      max: 4.0,
      step: 0.05,
      label: "Outer Radius ×",
    },
    C_hoverFalloffExp: {
      value: 0.5,
      min: 0.5,
      max: 6.0,
      step: 0.1,
      label: "Falloff Exp",
    },
    C_hoverEase: {
      value: 12.0,
      min: 1.0,
      max: 30.0,
      step: 0.5,
      label: "Ease (1/s)",
    },
    C_hoverMinGlow: {
      value: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: "Min Extra Glow",
    },
    C_hoverMaxGlow: {
      value: 2.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: "Max Extra Glow",
    },
  });

  // ——— Instance transform controls (C_… with your ranges) ———
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

  // ——— Geometry: extract + fix orientation (+90° around X → Y-up) ———
  const { geometry, baseRadius } = useMemo(() => {
    if (!scene) return { geometry: null, baseRadius: 1 };
    let g = null;
    scene.traverse((n) => {
      if (!g && n.isMesh && n.geometry) g = n.geometry.clone();
    });
    if (!g) return { geometry: null, baseRadius: 1 };
    if (g.index) g = g.toNonIndexed();

    // Fix the -90° issue by rotating +90° around X (Z-up → Y-up)
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(+Math.PI / 2));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return { geometry: g, baseRadius: g.boundingSphere?.radius || 1 };
  }, [scene]);

  // ——— Material (independent C) ———
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
    hoverMin: C_hoverMinGlow,
    hoverMax: C_hoverMaxGlow,
  });

  // Seed object-space Y bounds into the shader
  useEffect(() => {
    if (!geometry || !material?.userData?.shader) return;
    const sdr = material.userData.shader;
    const bb = geometry.boundingBox;
    if (bb) {
      sdr.uniforms.uObjMinY.value = bb.min.y;
      sdr.uniforms.uObjMaxY.value = bb.max.y;
    }
  }, [geometry, material]);

  // ——— Per-instance hover attribute (aHover) ———
  const hoverAttrRef = useRef(null);
  useEffect(() => {
    if (!geometry) return;
    const arr = new Float32Array(COUNT).fill(0);
    const attr = new THREE.InstancedBufferAttribute(arr, 1);
    geometry.setAttribute("aHover", attr);
    hoverAttrRef.current = attr;
  }, [geometry]);

  // ——— Upload instance matrices (on any control change) ———
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

  // ——— Gradual glow on hover (ray-to-instance proximity, eased) ———
  const { camera, pointer } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpS = useMemo(() => new THREE.Vector3(), []);

  const hoverTargetRef = useRef(new Float32Array(COUNT).fill(0));

  useFrame((_, dt) => {
    const attr = hoverAttrRef.current;
    const mesh = instancedRef.current;
    if (!attr || !mesh || !geometry) return;

    // Build mouse ray
    const rc = raycasterRef.current;
    rc.setFromCamera(pointer, camera);
    const ray = rc.ray;

    // For each instance, compute distance from ray to instance center
    for (let i = 0; i < COUNT; i++) {
      mesh.getMatrixAt(i, tmpM);
      tmpM.decompose(tmpP, tmpQ, tmpS);

      const maxScale = Math.max(tmpS.x, tmpS.y, tmpS.z);
      const radius = (baseRadius || 1) * maxScale * C_hoverOuterMult;

      // distance from mouse ray to center (world units)
      const d = Math.sqrt(ray.distanceSqToPoint(tmpP));
      let closeness = 1.0 - d / Math.max(1e-6, radius); // 1 at center of ray, 0 at outer edge
      closeness = Math.max(0.0, Math.min(1.0, closeness));

      // Optional falloff exponent
      hoverTargetRef.current[i] = Math.pow(closeness, C_hoverFalloffExp);
    }

    // Ease aHover towards targets
    const a = attr.array;
    const t = hoverTargetRef.current;
    const easeK = C_hoverEnabled
      ? 1 - Math.exp(-C_hoverEase * dt)
      : 1 - Math.exp(-C_hoverEase * dt);
    let dirty = false;
    for (let i = 0; i < COUNT; i++) {
      const target = C_hoverEnabled ? t[i] : 0;
      const ni = a[i] + (target - a[i]) * easeK;
      if (Math.abs(ni - a[i]) > 1e-4) {
        a[i] = ni;
        dirty = true;
      }
    }
    if (dirty) attr.needsUpdate = true;
  });

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
