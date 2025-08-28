// src/fog/UnifiedForwardFog.jsx
//
// Unified Forward Fog (UFF)
// - Injects a consistent physically-inspired height & distance fog into forward materials
// - Provides correct cutout depth/distance override materials (no skinning/morphTargets props)
// - Avoids Three.js warnings by NOT setting `skinning`/`morphTargets` on MeshDepthMaterial/MeshDistanceMaterial
//
// Drop this file in and mount <UnifiedForwardFog /> once in your scene.
//
// Example:
// <Canvas>
//   <UnifiedForwardFog color="#98a0a5" density={1.96} extinction={0.1} fogHeight={-12.7} />
//   ...
// </Canvas>

import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

const MATERIAL_TAG = "__UFF_patched__";

function makeDepthOverride(srcMat) {
  // Depth override (RGBA packed). Respect cutouts but DO NOT set skinning/morphTargets.
  const m = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  // Respect alpha cutouts if present on the source material
  m.map = srcMat?.map || null;
  m.alphaMap = srcMat?.alphaMap || null;
  m.alphaTest = srcMat?.alphaTest ?? 0.0;
  m.side = srcMat?.side ?? THREE.FrontSide;
  m.depthWrite = true;
  m.depthTest = true;
  m.blending = THREE.NoBlending;
  // No m.skinning / m.morphTargets here — Three handles these automatically.
  return m;
}

function makeDistanceOverride(srcMat) {
  // Distance override for point/spot shadow maps. Respect cutouts. Do NOT set skinning/morphTargets.
  const m = new THREE.MeshDistanceMaterial();
  m.map = srcMat?.map || null;
  m.alphaMap = srcMat?.alphaMap || null;
  m.alphaTest = srcMat?.alphaTest ?? 0.0;
  m.side = srcMat?.side ?? THREE.FrontSide;
  m.depthWrite = true;
  m.depthTest = true;
  m.blending = THREE.NoBlending;
  // No m.skinning / m.morphTargets here — Three handles these automatically.
  return m;
}

export default function UnifiedForwardFog({
  // Visual look (match your FogParticles defaults if desired)
  color = "#98a0a5",
  density = 1.96,
  extinction = 0.1,
  fogHeight = -12.7,
  fadeStart = 0.0,
  fadeEnd = 51.8,
  distFadeStart = 0.0,
  distFadeEnd = 92.0,
  lightDir = [-0.5, 0.8, -0.4],
  lightIntensity = 0.0,
  anisotropy = 0.0,
  // Target filter (optional)
  include = () => true, // (obj, material) => boolean
}) {
  const { scene } = useThree();

  // Shared uniform values (objects reused across all patched materials)
  const uFogColor = useMemo(() => new THREE.Color(color), [color]);
  const uLightDir = useMemo(
    () => new THREE.Vector3().fromArray(lightDir).normalize(),
    [lightDir]
  );

  // Track patched materials + their shader uniform references to update live
  const patched = useRef(
    new Map() // material -> { shaderUniforms, original: { onBeforeCompile, customDepth, customDist } }
  );

  // Build a function to patch one material
  const patchMaterial = (mesh, mat) => {
    if (!mat || mat[MATERIAL_TAG]) return;
    // Optional filter
    if (!include(mesh, mat)) return;

    const original = {
      onBeforeCompile: mat.onBeforeCompile,
      customDepthMaterial: mesh.customDepthMaterial || null,
      customDistanceMaterial: mesh.customDistanceMaterial || null,
    };

    mat.onBeforeCompile = (shader) => {
      // Inject world position varying
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `
          #include <common>
          varying vec3 vUFFWorldPos;
        `
        )
        .replace(
          "#include <project_vertex>",
          `
          vUFFWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
          #include <project_vertex>
        `
        );

      // Inject our uniforms + fog evaluation and replace the stock fog chunk
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `
          #include <common>
          varying vec3 vUFFWorldPos;

          uniform vec3  uFogColor;
          uniform float uDensity;
          uniform float uExtinction;
          uniform float uFogHeight;
          uniform float uFadeStart;
          uniform float uFadeEnd;
          uniform float uDistFadeStart;
          uniform float uDistFadeEnd;
          uniform vec3  uLightDir;
          uniform float uLightIntensity;
          uniform float uAnisotropy;

          float henyeyGreenstein(float mu, float g){
            float g2 = g*g;
            float denom = pow(1.0 + g2 - 2.0*g*mu, 1.5);
            return (1.0 - g2) / (4.0 * 3.141592653589793 * denom);
          }

          void UFF_evalFog(in vec3 fragWorld, in vec3 camPos, out float fogFactor, out vec3 fogCol){
            vec3  V = fragWorld - camPos;
            float d = length(V);

            float yRel = fragWorld.y - uFogHeight;
            float heightMask = 1.0 - smoothstep(uFadeStart, uFadeEnd, yRel);
            heightMask = clamp(heightMask, 0.0, 1.0);

            float sigma = max(1e-6, uExtinction * uDensity);
            float trans = exp(-sigma * d);

            float df = smoothstep(uDistFadeStart, uDistFadeEnd, d);
            trans = mix(trans, 0.0, df);

            fogFactor = (1.0 - trans) * heightMask;

            vec3 viewDir = normalize(V);
            float mu   = dot(viewDir, -normalize(uLightDir));
            float phase = henyeyGreenstein(mu, clamp(uAnisotropy, -0.9, 0.9));
            fogCol = uFogColor * mix(1.0, (0.4 + 1.6*phase), uLightIntensity);
          }
        `
        )
        .replace(
          "#include <fog_fragment>",
          `
          {
            float fogF; vec3 fogC;
            UFF_evalFog(vUFFWorldPos, cameraPosition, fogF, fogC);
            // Blend scene color towards fog color
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, clamp(fogF, 0.0, 1.0));
          }
        `
        );

      // Wire uniforms
      shader.uniforms.uFogColor = { value: uFogColor };
      shader.uniforms.uDensity = { value: density };
      shader.uniforms.uExtinction = { value: extinction };
      shader.uniforms.uFogHeight = { value: fogHeight };
      shader.uniforms.uFadeStart = { value: fadeStart };
      shader.uniforms.uFadeEnd = { value: fadeEnd };
      shader.uniforms.uDistFadeStart = { value: distFadeStart };
      shader.uniforms.uDistFadeEnd = { value: distFadeEnd };
      shader.uniforms.uLightDir = { value: uLightDir };
      shader.uniforms.uLightIntensity = { value: lightIntensity };
      shader.uniforms.uAnisotropy = { value: anisotropy };

      // Store reference for live updates later
      patched.current.set(mat, {
        shaderUniforms: shader.uniforms,
        original,
      });
    };

    // Provide override materials for correct depth/shadow behavior (cutouts supported)
    mesh.customDepthMaterial = makeDepthOverride(mat);
    mesh.customDistanceMaterial = makeDistanceOverride(mat);

    // Mark as patched and trigger recompile
    Object.defineProperty(mat, MATERIAL_TAG, {
      value: true,
      configurable: true,
    });
    mat.needsUpdate = true;
  };

  // Initial traversal + patch
  useEffect(() => {
    const toUnpatch = [];
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;

      // Handle multi-material meshes
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      materials.forEach((m) => patchMaterial(obj, m));

      toUnpatch.push(obj);
    });

    // Cleanup: restore original hooks and remove our tag/overrides
    return () => {
      toUnpatch.forEach((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const materials = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        materials.forEach((m) => {
          const record = patched.current.get(m);
          if (record) {
            // Restore original onBeforeCompile
            m.onBeforeCompile =
              record.original.onBeforeCompile || ((/*shader*/) => {});
            // Remove our tag
            try {
              delete m[MATERIAL_TAG];
            } catch (_) {
              // ignore
            }
            patched.current.delete(m);
          }
        });
        obj.customDepthMaterial = null;
        obj.customDistanceMaterial = null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Live-update uniforms when props change (no recompile)
  useEffect(() => {
    patched.current.forEach(({ shaderUniforms }) => {
      shaderUniforms.uFogColor.value.copy(uFogColor);
      shaderUniforms.uDensity.value = density;
      shaderUniforms.uExtinction.value = extinction;
      shaderUniforms.uFogHeight.value = fogHeight;
      shaderUniforms.uFadeStart.value = fadeStart;
      shaderUniforms.uFadeEnd.value = fadeEnd;
      shaderUniforms.uDistFadeStart.value = distFadeStart;
      shaderUniforms.uDistFadeEnd.value = distFadeEnd;
      shaderUniforms.uLightDir.value.copy(uLightDir);
      shaderUniforms.uLightIntensity.value = lightIntensity;
      shaderUniforms.uAnisotropy.value = anisotropy;
    });
  }, [
    uFogColor,
    density,
    extinction,
    fogHeight,
    fadeStart,
    fadeEnd,
    distFadeStart,
    distFadeEnd,
    uLightDir,
    lightIntensity,
    anisotropy,
  ]);

  return null;
}
