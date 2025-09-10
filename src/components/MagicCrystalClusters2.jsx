// src/components/MagicCrystalClusters2.jsx
import React, { forwardRef, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";

const CRYSTAL2_GLB = "/models/magicPlantsAndCrystal/CrystalCluster2.glb";
const COUNT = 15;

// ---- 15 baked placements (rotY in degrees; rounded to sensible precision) ----
const BAKED = [
  { px: -2.32, py: -4.66, pz: -1.52, ry: 77.4, s: 0.077 },
  { px: -2.48, py: -4.71, pz: -1.97, ry: 30.7, s: 0.041 },
  { px: -2.23, py: -4.8, pz: -1.69, ry: 0.0, s: 0.068 },
  { px: -2.48, py: -4.63, pz: -2.22, ry: 20.2, s: 0.093 },
  { px: -0.98, py: -4.31, pz: -3.0, ry: -3.4, s: 0.079 },
  { px: -0.99, py: -4.28, pz: -0.19, ry: -16.8, s: 0.128 },
  { px: -1.03, py: -4.54, pz: -2.33, ry: 118.2, s: 0.05 },
  { px: -2.51, py: -4.26, pz: -3.5, ry: 54.6, s: 0.097 },
  { px: -2.54, py: -4.24, pz: -3.39, ry: -180.0, s: 0.077 },
  { px: -2.84, py: -4.59, pz: -2.98, ry: -53.8, s: 0.047 },
  { px: -2.56, py: -4.59, pz: -2.98, ry: -53.8, s: 0.047 },
  { px: -1.02, py: -4.42, pz: -3.14, ry: 11.7, s: 0.072 },
  { px: -2.04, py: -4.47, pz: -3.47, ry: 180.0, s: 0.067 },
  { px: -2.0, py: -4.48, pz: -3.49, ry: 86.6, s: 0.052 },
  { px: -2.45, py: -4.7, pz: -2.28, ry: 134.6, s: 0.052 },
];

export default forwardRef(function MagicCrystalClusters2(props, ref) {
  const { scene } = useGLTF(CRYSTAL2_GLB);
  const instancedRef = useRef();

  // ===== Instance transforms (kept) =====
  const instanceSchema = useMemo(() => {
    const schema = {};
    for (let i = 0; i < COUNT; i++) {
      const d = BAKED[i] ?? { px: -2, py: -4, pz: -2, ry: 0, s: 0.5 };
      const label = `Instance ${String(i + 1).padStart(2, "0")}`;
      schema[label] = folder(
        {
          [`pX_${i}`]: {
            value: d.px,
            min: -20,
            max: 20,
            step: 0.001,
            label: "x",
          },
          [`pY_${i}`]: {
            value: d.py,
            min: -20,
            max: 20,
            step: 0.001,
            label: "y",
          },
          [`pZ_${i}`]: {
            value: d.pz,
            min: -20,
            max: 20,
            step: 0.001,
            label: "z",
          },
          [`rY_${i}`]: {
            value: d.ry,
            min: -180,
            max: 180,
            step: 0.1,
            label: "rotY°",
          },
          [`s_${i}`]: {
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
  const ctl = useControls("Crystal2 / Instances", instanceSchema, {
    collapsed: false,
  });

  // ===== 2-Color Gradient & Glass controls (same as MagicCrystalCluster3) =====
  const {
    colorA,
    colorB,
    mid,
    softness,
    bottomSatBoost,
    bottomEmissiveBoost,
    bottomFresnelBoost,
    bottomFresnelPower,
  } = useControls(
    "Crystal2 / Gradient",
    {
      colorA: { value: "#20c4ff", label: "Bottom Color (A)" },
      colorB: { value: "#7bffcf", label: "Top Color (B)" },
      mid: {
        value: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.001,
        label: "Blend Midpoint",
      },
      softness: {
        value: 0.15,
        min: 0.0,
        max: 0.5,
        step: 0.001,
        label: "Blend Softness",
      },
      bottomSatBoost: {
        value: 0.5,
        min: 0.0,
        max: 1.5,
        step: 0.01,
        label: "Bottom Saturation +",
      },
      bottomEmissiveBoost: {
        value: 0.8,
        min: 0.0,
        max: 2.0,
        step: 0.01,
        label: "Bottom Glow +",
      },
      bottomFresnelBoost: {
        value: 1.0,
        min: 0.0,
        max: 3.0,
        step: 0.01,
        label: "Bottom Fresnel +",
      },
      bottomFresnelPower: {
        value: 2.0,
        min: 0.5,
        max: 6.0,
        step: 0.1,
        label: "Bottom Fresnel Falloff",
      },
    },
    { collapsed: false }
  );

  const { ior, thickness, attenuationDistance, roughness, emissiveIntensity } =
    useControls("Crystal2 / Glass", {
      ior: { value: 1.0, min: 1.0, max: 2.333, step: 0.001 },
      thickness: { value: 4.68, min: 0, max: 10, step: 0.01 },
      attenuationDistance: { value: 57.5, min: 0.1, max: 200, step: 0.1 },
      roughness: { value: 0.61, min: 0, max: 1, step: 0.001 },
      emissiveIntensity: { value: 0.3, min: 0, max: 8, step: 0.01 },
    });

  // ===== Geometry (rotate to Y-up, cache bbox) =====
  const geometry = useMemo(() => {
    if (!scene) return null;
    let g = null;
    scene.traverse((n) => {
      if (!g && n.isMesh && n.geometry) g = n.geometry.clone();
    });
    if (!g) return null;

    if (g.index) g = g.toNonIndexed();
    const fix = new THREE.Matrix4().makeRotationX(+Math.PI / 2);
    g.applyMatrix4(fix);
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }, [scene]);

  // ===== Shared material with PER-INSTANCE world-Y gradient/fresnel/emissive =====
  const material = useMemo(() => {
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
      color: new THREE.Color("#ffffff"), // base white; tinted in shader
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

      // Gradient/boost uniforms
      shader.uniforms.uColorA = { value: new THREE.Color(colorA) };
      shader.uniforms.uColorB = { value: new THREE.Color(colorB) };
      shader.uniforms.uMid = { value: mid };
      shader.uniforms.uSoft = { value: softness };
      shader.uniforms.uBottomSatBoost = { value: bottomSatBoost };
      shader.uniforms.uBottomEmissiveBoost = { value: bottomEmissiveBoost };
      shader.uniforms.uBottomFresnelBoost = { value: bottomFresnelBoost };
      shader.uniforms.uBottomFresnelPower = { value: bottomFresnelPower };
      shader.uniforms.uEmissiveIntensity = { value: emissiveIntensity };

      // Per-vertex normalized height vH computed from instanceMatrix
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
          // translation.y
          float ty = MI[3].y;
          // scale along world Y axis (length of Y column)
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
        uniform vec3  uColorA;
        uniform vec3  uColorB;
        uniform float uMid, uSoft;
        uniform float uBottomSatBoost;
        uniform float uBottomEmissiveBoost;
        uniform float uBottomFresnelBoost;
        uniform float uBottomFresnelPower;
        uniform float uEmissiveIntensity;
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
        float t = smoothstep(uMid - uSoft, uMid + uSoft, vH);
        vec3 grad = mix(uColorA, uColorB, t);

        // bottom emphasis
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uBottomSatBoost * bottom);

        // tint base shading
        gl_FragColor.rgb *= grad;

        // fresnel (stronger near bottom)
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(normalize(normal), V)), 1.3);
        float fresBoost = 1.0 + uBottomFresnelBoost * pow(bottom, uBottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // emissive bump near bottom
        float eBoost = 1.0 + uBottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uEmissiveIntensity * eBoost;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Instancing: write matrices to GPU whenever controls change =====
  useEffect(() => {
    const mesh = instancedRef.current;
    if (!mesh) return;

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler(0, 0, 0, "XYZ");

    for (let i = 0; i < COUNT; i++) {
      const px = ctl[`pX_${i}`];
      const py = ctl[`pY_${i}`];
      const pz = ctl[`pZ_${i}`];
      const ry = THREE.MathUtils.degToRad(ctl[`rY_${i}`]);
      const uni = ctl[`s_${i}`];

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

  // ===== Keep uniforms / physical params live & seed bbox Y range =====
  useEffect(() => {
    if (!material) return;
    material.ior = ior;
    material.thickness = thickness;
    material.attenuationDistance = attenuationDistance;
    material.roughness = roughness;
    material.emissiveIntensity = emissiveIntensity;

    const sdr = material.userData.shader;
    if (sdr) {
      sdr.uniforms.uColorA.value.set(colorA);
      sdr.uniforms.uColorB.value.set(colorB);
      sdr.uniforms.uMid.value = mid;
      sdr.uniforms.uSoft.value = softness;
      sdr.uniforms.uBottomSatBoost.value = bottomSatBoost;
      sdr.uniforms.uBottomEmissiveBoost.value = bottomEmissiveBoost;
      sdr.uniforms.uBottomFresnelBoost.value = bottomFresnelBoost;
      sdr.uniforms.uBottomFresnelPower.value = bottomFresnelPower;
      sdr.uniforms.uEmissiveIntensity.value = emissiveIntensity;

      // Geometry object-space Y bounds (shared across instances)
      if (geometry?.boundingBox) {
        sdr.uniforms.uObjMinY.value = geometry.boundingBox.min.y;
        sdr.uniforms.uObjMaxY.value = geometry.boundingBox.max.y;
      }
    }
  }, [
    material,
    geometry,
    // gradient/glow controls
    colorA,
    colorB,
    mid,
    softness,
    bottomSatBoost,
    bottomEmissiveBoost,
    bottomFresnelBoost,
    bottomFresnelPower,
    emissiveIntensity,
    // physical
    ior,
    thickness,
    attenuationDistance,
    roughness,
  ]);

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
