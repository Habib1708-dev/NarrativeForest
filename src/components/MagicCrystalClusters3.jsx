// src/components/MagicCrystalCluster3.jsx
import React, { forwardRef, useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";

const CLUSTER4_GLB = "/models/magicPlantsAndCrystal/CrystalCluster4.glb";

export default forwardRef(function MagicCrystalCluster3(props, ref) {
  const { scene: raw4 } = useGLTF(CLUSTER4_GLB);
  const groupRef = useRef(); // outer transform group (for world bbox)

  // ===== 2-Color Crystal Controls =====
  const {
    colorA, // bottom
    colorB, // top
    mid,
    softness,
    bottomSatBoost,
    bottomEmissiveBoost,
    bottomFresnelBoost,
    bottomFresnelPower,
  } = useControls("Crystal3 / Gradient", {
    colorA: { value: "#20c4ff", label: "Bottom Color (A)" },
    colorB: { value: "#7a92ff", label: "Top Color (B)" },
    mid: {
      value: 0.6,
      min: 0.0,
      max: 1.0,
      step: 0.001,
      label: "Blend Midpoint",
    },
    softness: {
      value: 0.37,
      min: 0.0,
      max: 0.5,
      step: 0.001,
      label: "Blend Softness",
    },
    bottomSatBoost: {
      value: 1.5,
      min: 0.0,
      max: 1.5,
      step: 0.01,
      label: "Bottom Saturation +",
    },
    bottomEmissiveBoost: {
      value: 2.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: "Bottom Glow +",
    },
    bottomFresnelBoost: {
      value: 3.0,
      min: 0.0,
      max: 3.0,
      step: 0.01,
      label: "Bottom Fresnel +",
    },
    bottomFresnelPower: {
      value: 0.6,
      min: 0.5,
      max: 6.0,
      step: 0.1,
      label: "Bottom Fresnel Falloff",
    },
  });

  // Glass base
  const { ior, thickness, attenuationDistance, roughness, emissiveIntensity } =
    useControls("Crystal3 / Glass", {
      ior: { value: 1.0, min: 1.0, max: 2.333, step: 0.001 },
      thickness: { value: 4.68, min: 0, max: 10, step: 0.01 },
      attenuationDistance: { value: 57.5, min: 0.1, max: 200, step: 0.1 },
      roughness: { value: 0.61, min: 0, max: 1, step: 0.001 },
      emissiveIntensity: { value: 0.3, min: 0, max: 8, step: 0.01 },
    });

  // Transform (single model)
  const { pX, pY, pZ, rY, s } = useControls("Crystal3 / Transform", {
    pX: { value: -2.61, min: -3, max: 0, step: 0.001, label: "x" },
    pY: { value: -4.45, min: -5, max: -1, step: 0.001, label: "y" },
    pZ: { value: -3.47, min: -3, max: 0, step: 0.001, label: "z" },
    rY: { value: 127.9, min: -180, max: 180, step: 0.1, label: "rotY°" },
    s: { value: 0.17, min: 0.01, max: 0.2, step: 0.001, label: "scale" },
  });

  // ===== Shared material with WORLD-Y gradient/fresnel/emissive =====
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
      // uniforms
      shader.uniforms.uColorA = { value: new THREE.Color(colorA) };
      shader.uniforms.uColorB = { value: new THREE.Color(colorB) };
      shader.uniforms.uWorldYMin = { value: 0.0 };
      shader.uniforms.uWorldYMax = { value: 1.0 };
      shader.uniforms.uMid = { value: mid };
      shader.uniforms.uSoft = { value: softness };
      shader.uniforms.uBottomSatBoost = { value: bottomSatBoost };
      shader.uniforms.uBottomEmissiveBoost = { value: bottomEmissiveBoost };
      shader.uniforms.uBottomFresnelBoost = { value: bottomFresnelBoost };
      shader.uniforms.uBottomFresnelPower = { value: bottomFresnelPower };
      shader.uniforms.uEmissiveIntensity = { value: emissiveIntensity };

      // world pos varying
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        varying float vWorldY;
        `
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vec4 wp = modelMatrix * vec4( transformed, 1.0 );
        vWorldY = wp.y;
        `
      );

      // helpers + gradient/fresnel logic
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform vec3  uColorA;
        uniform vec3  uColorB;
        uniform float uWorldYMin, uWorldYMax;
        uniform float uMid, uSoft;
        uniform float uBottomSatBoost;
        uniform float uBottomEmissiveBoost;
        uniform float uBottomFresnelBoost;
        uniform float uBottomFresnelPower;
        uniform float uEmissiveIntensity;
        varying float vWorldY;

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
        float h = (vWorldY - uWorldYMin) / max(1e-5, (uWorldYMax - uWorldYMin));
        h = clamp(h, 0.0, 1.0);
        float t = smoothstep(uMid - uSoft, uMid + uSoft, h);
        vec3 grad = mix(uColorA, uColorB, t);

        // more saturation near bottom
        float bottom = 1.0 - h;
        grad = boostSaturation(grad, uBottomSatBoost * bottom);

        // tint base shading
        gl_FragColor.rgb *= grad;

        // fresnel, stronger near bottom
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

  // keep material/uniforms live with controls
  useEffect(() => {
    if (!material?.userData?.shader) return;
    const u = material.userData.shader.uniforms;
    u.uColorA.value.set(colorA);
    u.uColorB.value.set(colorB);
    u.uMid.value = mid;
    u.uSoft.value = softness;
    u.uBottomSatBoost.value = bottomSatBoost;
    u.uBottomEmissiveBoost.value = bottomEmissiveBoost;
    u.uBottomFresnelBoost.value = bottomFresnelBoost;
    u.uBottomFresnelPower.value = bottomFresnelPower;
    u.uEmissiveIntensity.value = emissiveIntensity;

    material.ior = ior;
    material.thickness = thickness;
    material.attenuationDistance = attenuationDistance;
    material.roughness = roughness;
    material.emissiveIntensity = emissiveIntensity;
  }, [material, colorA, colorB, mid, softness, bottomSatBoost, bottomEmissiveBoost, bottomFresnelBoost, bottomFresnelPower, emissiveIntensity, ior, thickness, attenuationDistance, roughness]);

  // ===== Clone scene & apply material to every Mesh descendant =====
  const cluster4 = useMemo(() => {
    if (!raw4) return null;
    const clone = raw4.clone(true);
    clone.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        n.material = material;
      }
    });
    return clone;
  }, [raw4, material]);

  // ===== Update world Y bounds when transform changes =====
  useEffect(() => {
    if (!material?.userData?.shader || !groupRef.current) return;
    const box = new THREE.Box3().setFromObject(groupRef.current);
    const u = material.userData.shader.uniforms;
    u.uWorldYMin.value = box.min.y;
    u.uWorldYMax.value = box.max.y;
  }, [material, pX, pY, pZ, rY, s, cluster4]); // recalc when you move/rotate/scale

  if (!cluster4) return null;

  return (
    <group ref={ref} name="MagicCrystalCluster3" {...props}>
      <group
        ref={groupRef}
        position={[pX, pY, pZ]}
        rotation={[0, THREE.MathUtils.degToRad(rY), 0]}
        scale={s}
      >
        <primitive object={cluster4} />
      </group>
    </group>
  );
});

useGLTF.preload(CLUSTER4_GLB);
