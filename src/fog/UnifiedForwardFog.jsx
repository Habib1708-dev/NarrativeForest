// src/fog/UnifiedForwardFog.jsx
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

export default function UnifiedForwardFog({
  enabled = true,
  color = "#98a0a5",
  density = 1.96,
  extinction = 0.1,
  fogHeight = -3.9,
  fadeStart = 3.9,
  fadeEnd = 41.3,
  distFadeStart = 0.0,
  distFadeEnd = 92.0,
  lightDir = [-0.5, 0.8, -0.4],
  lightIntensity = 0.0,
  anisotropy = 0.0,
  skyRadius = 100,
  // NEW: which layer the sky-dome should render on (background pass)
  layer = 1,
}) {
  const { scene, camera } = useThree();
  const patched = useRef(new Map());
  const group = useRef();

  const uniforms = useMemo(
    () => ({
      uFogColor: { value: new THREE.Color(color) },
      uDensity: { value: density },
      uExtinction: { value: extinction },
      uFogHeight: { value: fogHeight },
      uFadeStart: { value: fadeStart },
      uFadeEnd: { value: fadeEnd },
      uDistFadeStart: { value: distFadeStart },
      uDistFadeEnd: { value: distFadeEnd },
      uLightDir: { value: new THREE.Vector3().fromArray(lightDir).normalize() },
      uLightIntensity: { value: lightIntensity },
      uAnisotropy: { value: THREE.MathUtils.clamp(anisotropy, -0.9, 0.9) },
    }),
    []
  );

  useEffect(() => {
    uniforms.uFogColor.value.set(color);
  }, [color, uniforms]);
  useEffect(() => {
    uniforms.uDensity.value = density;
  }, [density, uniforms]);
  useEffect(() => {
    uniforms.uExtinction.value = extinction;
  }, [extinction, uniforms]);
  useEffect(() => {
    uniforms.uFogHeight.value = fogHeight;
  }, [fogHeight, uniforms]);
  useEffect(() => {
    uniforms.uFadeStart.value = fadeStart;
  }, [fadeStart, uniforms]);
  useEffect(() => {
    uniforms.uFadeEnd.value = fadeEnd;
  }, [fadeEnd, uniforms]);
  useEffect(() => {
    uniforms.uDistFadeStart.value = distFadeStart;
  }, [distFadeStart, uniforms]);
  useEffect(() => {
    uniforms.uDistFadeEnd.value = distFadeEnd;
  }, [distFadeEnd, uniforms]);
  useEffect(() => {
    uniforms.uLightDir.value.fromArray(lightDir).normalize();
  }, [lightDir, uniforms]);
  useEffect(() => {
    uniforms.uLightIntensity.value = lightIntensity;
  }, [lightIntensity, uniforms]);
  useEffect(() => {
    uniforms.uAnisotropy.value = THREE.MathUtils.clamp(anisotropy, -0.9, 0.9);
  }, [anisotropy, uniforms]);

  const GLSL_COMMON = `
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
      return (1.0 - g2) / (4.0 * 3.14159265 * denom);
    }
    void evalFog(in vec3 fragWorld, in vec3 camPos, out float fogFactor, out vec3 fogCol){
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
      float phase = henyeyGreenstein(mu, uAnisotropy);
      fogCol = uFogColor * mix(1.0, (0.4 + 1.6*phase), uLightIntensity);
    }
  `;

  const patchMaterial = (mat) => {
    if (!enabled || !mat || patched.current.has(mat)) return;
    if (mat.isShaderMaterial) return;
    if (mat.isPointsMaterial) return;
    mat.fog = true;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms = { ...shader.uniforms, ...uniforms };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vWorldPos;`
        )
        .replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>\nvWorldPos = worldPosition.xyz;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vWorldPos;\n${GLSL_COMMON}`
        )
        .replace(
          "#include <fog_fragment>",
          `#ifdef USE_FOG
             float fogFactor; vec3 fogCol;
             evalFog(vWorldPos, cameraPosition, fogFactor, fogCol);
             gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogFactor, 0.0, 1.0));
           #endif`
        );
      patched.current.set(mat, shader.uniforms);
    };
    mat.needsUpdate = true;
  };

  useFrame(() => {
    if (!enabled) return;
    // Patch built-ins
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) patchMaterial(m);
    });
    // Keep sky dome at camera
    if (group.current) group.current.position.copy(camera.position);
  });

  useEffect(() => () => patched.current.clear(), []);

  // Put the sky-dome and all its children on the requested layer
  useEffect(() => {
    if (!group.current) return;
    const setLayersRecursive = (obj, idx) => {
      obj.layers.set(idx);
      for (const c of obj.children) setLayersRecursive(c, idx);
    };
    setLayersRecursive(group.current, layer);
  }, [layer]);

  return (
    <group ref={group} layers={layer}>
      <mesh frustumCulled={false}>
        <sphereGeometry args={[skyRadius, 32, 18]} />
        <shaderMaterial
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          depthTest
          blending={THREE.NormalBlending}
          uniforms={uniforms}
          vertexShader={
            /* glsl */ `
            varying vec3 vWorldPos;
            void main(){
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            varying vec3 vWorldPos;
            ${GLSL_COMMON}
            void main(){
              float fogFactor; vec3 fogCol;
              evalFog(vWorldPos, cameraPosition, fogFactor, fogCol);
              gl_FragColor = vec4(fogCol, clamp(fogFactor, 0.0, 1.0));
            }
          `
          }
        />
      </mesh>
    </group>
  );
}
