// src/components/MagicCrystalClusters.jsx
import React, { forwardRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";

const CRYSTAL_GLB = "/models/magicPlantsAndCrystal/CrystalCluster.glb";

export default forwardRef(function MagicCrystalClusters(props, ref) {
  const { scene } = useGLTF(CRYSTAL_GLB);

  // === Leva controls (defaults = your debugged values) ======================
  const {
    // Glass core
    color,
    attenuationColor,
    ior,
    thickness,
    attenuationDistance,
    roughness,

    // Fresnel sparkle (you tuned power; strength kept for flexibility)
    fresnelStrength,
    fresnelPower,
    fresnelColor,

    // Subtle emissive glow that preserves glass look
    emissiveColor,
    emissiveIntensity,
  } = useControls(
    "Crystals",
    {
      Glass: folder(
        {
          color: { value: "#99f4ff" },
          attenuationColor: { value: "#99f4ff" },
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
          fresnelColor: { value: "#9ad1ff" },
        },
        { collapsed: true }
      ),
      Glow: folder(
        {
          emissiveColor: { value: "#99f4ff" },
          emissiveIntensity: { value: 0.24, min: 0, max: 8, step: 0.01 },
        },
        { collapsed: false }
      ),
    },
    { collapsed: false }
  );

  // === Base glass material (no envMap usage) =================================
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

      // No envMapIntensity here (removed per project)

      transparent: false,
      opacity: 1.0,
      toneMapped: true,
      flatShading: true,
      side: THREE.FrontSide,

      // Emissive = gentle inner glow
      emissive: new THREE.Color(emissiveColor),
      emissiveIntensity,
    });

    // Fresnel sparkle on facets
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
        // Fresnel term (view space)
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(normalize(normal), V)), uFresnelPower);
        gl_FragColor.rgb += uFresnelColor * (fres * uFresnelStrength);
        ${hook}
        `
      );

      mat.userData.shader = shader;
    };

    return mat;
    // built once; reactive updates below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reactive updates from Leva without re-creating material
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

  // === Clone model and apply the crystal material ============================
  const model = useMemo(() => {
    if (!scene) return null;
    const cloned = scene.clone(true);

    cloned.traverse((n) => {
      if (n.isMesh && n.geometry) {
        if (n.geometry.index) n.geometry = n.geometry.toNonIndexed();
        n.geometry.computeVertexNormals();
        n.material = crystalMaterial;
        n.castShadow = true;
        n.receiveShadow = true;
      }
    });

    return cloned;
  }, [scene, crystalMaterial]);

  if (!model) return null;

  return (
    <group
      ref={ref}
      name="MagicCrystalClusters"
      position={[-1, -4, -2]}
      scale={0.5}
      {...props}
    >
      <primitive object={model} />
    </group>
  );
});

useGLTF.preload(CRYSTAL_GLB);
