// src/components/MagicCrystalClusters3.jsx
import React, { forwardRef, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";

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
  // 5 (pY not provided → fallback -4.0)
  { px: -2.8, py: -4.48, pz: -3.121, ry: 0.0, s: 0.14 },
  // 6
  { px: -2.6, py: -4.5, pz: -1.47, ry: -144.7, s: 0.16 },
  // 7
  { px: -2.7, py: -4.53, pz: -2.2, ry: -30.2, s: 0.17 },
  // 8
  { px: -0.97, py: -4.28, pz: -2.8, ry: 180.0, s: 0.14 },
];

/**
 * Material: simple physical “glass” base with a 2-color vertical gradient/Fresnel,
 * same pattern as Crystal2 but namespace-prefixed to keep it independent (C_…).
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
      thickness: thickness,
      ior: ior,
      roughness: roughness,
      metalness: 0.0,
      iridescence: 0.6,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 600],
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      specularIntensity: 1.0,
      color: new THREE.Color("#ffffff"),
      attenuationColor: new THREE.Color("#ffffff"),
      attenuationDistance: attenuationDistance,
      transparent: false,
      opacity: 1.0,
      toneMapped: true,
      flatShading: true,
      side: THREE.FrontSide,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: emissiveIntensity,
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

      // Per-vertex normalized height vH computed from instanceMatrix (world Y)
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

        // World position (instance-aware)
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
        float t = smoothstep(uC_Mid - uC_Soft, uC_Mid + uC_Soft, vH);
        vec3 grad = mix(uC_ColorA, uC_ColorB, t);

        // bottom emphasis
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uC_BottomSatBoost * bottom);

        // tint base shading
        gl_FragColor.rgb *= grad;

        // fresnel (stronger near bottom)
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(normalize(normal), V)), 1.3);
        float fresBoost = 1.0 + uC_BottomFresnelBoost * pow(bottom, uC_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // emissive bump near bottom
        float eBoost = 1.0 + uC_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uC_EmissiveIntensity * eBoost;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    // Ensure a unique WebGLProgram (independent from other crystals)
    m.customProgramCacheKey = () => "MagicCrystal_C_v1";

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
    C_colorB: { value: "#9600c4ff", label: "Top Color (B)" },
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

  // ——— Instance transform controls (C_… with your requested ranges) ———
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
  const geometry = useMemo(() => {
    if (!scene) return null;
    let g = null;
    scene.traverse((n) => {
      if (!g && n.isMesh && n.geometry) g = n.geometry.clone();
    });
    if (!g) return null;
    if (g.index) g = g.toNonIndexed();

    // Fix the -90° issue by rotating +90° around X (Z-up → Y-up)
    const fix = new THREE.Matrix4().makeRotationX(+Math.PI / 2);
    g.applyMatrix4(fix);

    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
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
