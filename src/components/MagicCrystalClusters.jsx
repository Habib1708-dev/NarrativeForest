// src/components/MagicCrystalClusters.jsx
import React, { forwardRef, useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";

const CRYSTAL_GLB = "/models/magicPlantsAndCrystal/CrystalCluster.glb";
const COUNT = 15;
const d2r = (deg) => (deg * Math.PI) / 180;

// ---- 15 baked placements (rounded to 3 decimals) ----
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
    px: -2.75,
    py: -4.47,
    pz: -2.9,
    rx: 0.0,
    ry: 78.7,
    rz: 0.0,
    s: 0.14,
    sy: 1.2,
  },
];

export default forwardRef(function MagicCrystalClusters(props, ref) {
  const { scene } = useGLTF(CRYSTAL_GLB);

  // Material controls (your tuned defaults)
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
    "Crystals",
    {
      Glass: folder(
        {
          color: { value: "#ffca05" },
          attenuationColor: { value: "#ffac00" },
          ior: { value: 2.064, min: 1.0, max: 2.333, step: 0.001 },
          thickness: { value: 4.68, min: 0, max: 10, step: 0.01 },
          attenuationDistance: { value: 50, min: 0.1, max: 100, step: 0.1 },
          roughness: { value: 0.146, min: 0, max: 1, step: 0.001 },
        },
        { collapsed: false }
      ),
      Fresnel: folder(
        {
          fresnelStrength: { value: 1.85, min: 0, max: 2, step: 0.001 },
          fresnelPower: { value: 0.75, min: 0.1, max: 8, step: 0.01 },
          fresnelColor: { value: "#fcffca" },
        },
        { collapsed: true }
      ),
      Glow: folder(
        {
          emissiveColor: { value: "#ffb647" },
          emissiveIntensity: { value: 0.24, min: 0, max: 8, step: 0.01 },
        },
        { collapsed: false }
      ),
    },
    { collapsed: false }
  );

  // Per-instance transform controls (prefilled from BAKED)
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
        [`pX_${i}`]: { value: d.px, min: -4, max: 4, step: 0.01, label: "x" },
        [`pY_${i}`]: { value: d.py, min: -5, max: -2, step: 0.01, label: "y" },
        [`pZ_${i}`]: { value: d.pz, min: -4, max: 4, step: 0.01, label: "z" },
        [`rX_${i}`]: {
          value: d.rx,
          min: -180,
          max: 180,
          step: 0.1,
          label: "rotX°",
        },
        [`rY_${i}`]: {
          value: d.ry,
          min: -180,
          max: 180,
          step: 0.1,
          label: "rotY°",
        },
        [`rZ_${i}`]: {
          value: d.rz,
          min: -180,
          max: 180,
          step: 0.1,
          label: "rotZ°",
        },
        [`s_${i}`]: {
          value: d.s,
          min: 0.01,
          max: 5,
          step: 0.001,
          label: "scale",
        },
        [`sy_${i}`]: {
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
      schema[`Crystal ${(i + 1).toString().padStart(2, "0")}`] =
        makeInstanceFolder(i);
    }
    return schema;
  }, []);

  const placements = useControls("Crystal Instances", instanceSchema, {
    collapsed: true,
  });

  // Geometry: make Y the up-axis (rotate +90° around X)
  const crystalGeometry = useMemo(() => {
    if (!scene) return null;
    let geom = null;
    scene.traverse((n) => {
      if (!geom && n.isMesh && n.geometry) geom = n.geometry.clone();
    });
    if (!geom) return null;
    if (geom.index) geom = geom.toNonIndexed(); // assign result!

    // Axis correction: +90° around X maps (former) +Z-up → +Y-up.
    const fix = new THREE.Matrix4().makeRotationX(+Math.PI / 2);
    geom.applyMatrix4(fix);

    geom.computeVertexNormals();
    return geom;
  }, [scene]);

  // Material (transmission + emissive glow) with Fresnel
  const crystalMaterial = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
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

    mat.onBeforeCompile = (shader) => {
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

      mat.userData.shader = shader;
    };

    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live material updates
  useEffect(() => {
    crystalMaterial.color.set(color);
    crystalMaterial.attenuationColor = new THREE.Color(attenuationColor);
    crystalMaterial.ior = ior;
    crystalMaterial.thickness = thickness;
    crystalMaterial.attenuationDistance = attenuationDistance;
    crystalMaterial.roughness = roughness;
    crystalMaterial.emissive.set(emissiveColor);
    crystalMaterial.emissiveIntensity = emissiveIntensity;

    const s = crystalMaterial.userData.shader;
    if (s) {
      s.uniforms.uFresnelStrength.value = fresnelStrength;
      s.uniforms.uFresnelPower.value = fresnelPower;
      s.uniforms.uFresnelColor.value.set(fresnelColor);
    }
  }, [color, attenuationColor, ior, thickness, attenuationDistance, roughness, emissiveColor, emissiveIntensity, fresnelStrength, fresnelPower, fresnelColor, crystalMaterial]);

  // Instancing
  const instancedRef = useRef();
  const tmpObj = useMemo(() => new THREE.Object3D(), []);
  const tmpScale = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpEuler = useMemo(() => new THREE.Euler(), []);

  useEffect(() => {
    if (!instancedRef.current) return;
    instancedRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < COUNT; i++) {
      const px = placements[`pX_${i}`];
      const py = placements[`pY_${i}`];
      const pz = placements[`pZ_${i}`];
      const rx = d2r(placements[`rX_${i}`]);
      const ry = d2r(placements[`rY_${i}`]);
      const rz = d2r(placements[`rZ_${i}`]);
      const s = placements[`s_${i}`];
      const sy = placements[`sy_${i}`];

      tmpObj.position.set(px, py, pz);
      tmpEuler.set(rx, ry, rz);
      tmpQuat.setFromEuler(tmpEuler);
      tmpObj.quaternion.copy(tmpQuat);

      // y-scale stretches height (geometry is +Y-up)
      tmpScale.set(s, s * sy, s);
      tmpObj.scale.copy(tmpScale);

      tmpObj.updateMatrix();
      instancedRef.current.setMatrixAt(i, tmpObj.matrix);
    }
    instancedRef.current.instanceMatrix.needsUpdate = true;
  }, [placements, tmpEuler, tmpObj, tmpQuat, tmpScale]);

  if (!crystalGeometry) return null;

  return (
    <group ref={ref} name="MagicCrystalClusters" {...props}>
      <instancedMesh
        ref={instancedRef}
        args={[crystalGeometry, crystalMaterial, COUNT]}
        castShadow
        receiveShadow
      />
    </group>
  );
});

useGLTF.preload(CRYSTAL_GLB);
