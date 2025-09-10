// src/components/MagicCrystalClusters2.jsx
import React, { forwardRef, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";

const CRYSTAL2_GLB = "/models/magicPlantsAndCrystal/CrystalCluster2.glb";
const COUNT = 15;

// ---- 15 baked placements (rotY in degrees; rounded to sensible precision) ----
// Note: #4 (index 3) only had y/z/rot/scale provided; px assumed -2.0.
const BAKED = [
  { px: -2.32, py: -4.66, pz: -1.52, ry: 77.4, s: 0.077 },
  { px: -2.48, py: -4.71, pz: -1.97, ry: 30.7, s: 0.041 },
  { px: -2.23, py: -4.8, pz: -1.69, ry: 0.0, s: 0.068 },
  { px: -2.48, py: -4.63, pz: -2.22, ry: 20.2, s: 0.093 }, // px fallback
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

  // ===== Material controls (same system as MagicCrystalClusters.jsx) =====
  const {
    color,
    attenuationColor,
    ior,
    thickness,
    attenuationDistance,
    roughness,
    fresnelStrength,
    fresnelPower,
    fresnelColor,
    emissiveColor,
    emissiveIntensity,
  } = useControls(
    "Crystal2 / Material",
    {
      Glow: folder(
        {
          emissiveColor: { value: "#ffffff" },
          emissiveIntensity: { value: 0.0, min: 0, max: 8, step: 0.01 },
        },
        { collapsed: false }
      ),
      Glass: folder(
        {
          color: { value: "#ffffff" },
          attenuationColor: { value: "#ffffff" },
          ior: { value: 1.0, min: 1.0, max: 2.333, step: 0.001 },
          thickness: { value: 4.68, min: 0, max: 10, step: 0.01 },
          attenuationDistance: { value: 57.5, min: 0.1, max: 200, step: 0.1 },
          roughness: { value: 0.61, min: 0, max: 1, step: 0.001 },
        },
        { collapsed: false }
      ),
      Fresnel: folder(
        {
          fresnelStrength: { value: 1.85, min: 0, max: 2, step: 0.001 },
          fresnelPower: { value: 1.3, min: 0.1, max: 8, step: 0.01 },
          fresnelColor: { value: "#ffffff" },
        },
        { collapsed: true }
      ),
    },
    { collapsed: false }
  );

  // ===== Instance controls (x/y/z, rotY°, uniform scale) with baked defaults =====
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

  // ===== Geometry (fix -90° tilt: rotate +90° around X to make Y-up) =====
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

  // ===== Material (glassy/translucent + Fresnel + emissive) =====
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

      color: new THREE.Color(color),
      attenuationColor: new THREE.Color(attenuationColor),
      attenuationDistance,

      transparent: false,
      opacity: 1.0,
      toneMapped: true,
      flatShading: true,
      side: THREE.FrontSide,

      emissive: new THREE.Color(emissiveColor),
      emissiveIntensity,
    });

    // Fresnel sparkle (same as MagicCrystalClusters.jsx)
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uFresnelStrength = { value: fresnelStrength };
      shader.uniforms.uFresnelPower = { value: fresnelPower };
      shader.uniforms.uFresnelColor = { value: new THREE.Color(fresnelColor) };

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform float uFresnelStrength;
        uniform float uFresnelPower;
        uniform vec3  uFresnelColor;
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
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(normalize(normal), V)), uFresnelPower);
        gl_FragColor.rgb += uFresnelColor * (fres * uFresnelStrength);
        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live material updates
  useEffect(() => {
    if (!material) return;
    material.color.set(color);
    material.attenuationColor.set(attenuationColor);
    material.ior = ior;
    material.thickness = thickness;
    material.attenuationDistance = attenuationDistance;
    material.roughness = roughness;
    material.emissive.set(emissiveColor);
    material.emissiveIntensity = emissiveIntensity;

    const s = material.userData.shader;
    if (s) {
      s.uniforms.uFresnelStrength.value = fresnelStrength;
      s.uniforms.uFresnelPower.value = fresnelPower;
      s.uniforms.uFresnelColor.value.set(fresnelColor);
    }
  }, [material, color, attenuationColor, ior, thickness, attenuationDistance, roughness, emissiveColor, emissiveIntensity, fresnelStrength, fresnelPower, fresnelColor]);

  // ===== Instancing: write matrices on control changes =======================
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
