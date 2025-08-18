// src/fog/UnifiedForwardFog.jsx
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

/**
 * One unified fog:
 *  - Patches built-in materials (forward pass) with exponential + height top-fade + distance fade.
 *  - Draws a sky volume (camera-centered back-face sphere) with the SAME uniforms and math.
 *  - Skips ShaderMaterial and PointsMaterial (stars stay crisp).
 *  - Requires scene.fog to be present so USE_FOG is defined in built-in materials.
 */
export default function UnifiedForwardFog({
  enabled = true,
  // Defaults updated per user request
  color = "#98a0a5",
  density = 1.96, // global density multiplier
  extinction = 0.1, // Beer-Lambert coefficient

  fogHeight = -3.9, // world-Y base of fog layer
  fadeStart = 3.9, // starts fading above base
  fadeEnd = 41.3, // fully gone above this

  // Force far objects to fully vanish into fog
  distFadeStart = 0.0, // start forcing to full fog
  distFadeEnd = 92.0, // fully fogged by here

  lightDir = [-0.5, 0.8, -0.4],
  lightIntensity = 0.0,
  anisotropy = 0.0,

  skyRadius = 100, // camera-centered sky dome size
}) {
  const { scene, camera } = useThree();
  const patched = useRef(new Map());
  const group = useRef();

  // Shared uniforms object (one source of truth for both geometry + sky)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Keep uniforms in sync with props
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

  // GLSL snippet used in both geometry patch + sky shader
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

    // Compute fog factor & fog color contribution
    // in: world position of the fragment, camera position
    // out: fogFactor [0..1], fogCol (lit fog color)
    void evalFog(in vec3 fragWorld, in vec3 camPos, out float fogFactor, out vec3 fogCol){
      vec3  V = fragWorld - camPos;
      float d = length(V);

      // Height top fade
      float yRel = fragWorld.y - uFogHeight;
      float heightMask = 1.0 - smoothstep(uFadeStart, uFadeEnd, yRel);
      heightMask = clamp(heightMask, 0.0, 1.0);

      // Beer-Lambert
      float sigma = max(1e-6, uExtinction * uDensity);
      float trans = exp(-sigma * d);

      // Distance-forced fade to ensure far meshes vanish
      float df = smoothstep(uDistFadeStart, uDistFadeEnd, d);
      trans = mix(trans, 0.0, df);

      fogFactor = (1.0 - trans) * heightMask;

      // Simple forward-scatter feel
      vec3 viewDir = normalize(V);
      float mu   = dot(viewDir, -normalize(uLightDir));
      float phase = henyeyGreenstein(mu, uAnisotropy);
      fogCol = uFogColor * mix(1.0, (0.4 + 1.6*phase), uLightIntensity);
    }
  `;

  // Patch built-in materials
  const patchMaterial = (mat) => {
    if (!enabled || !mat || patched.current.has(mat)) return;
    if (mat.isShaderMaterial) return; // keep user shaders untouched
    if (mat.isPointsMaterial) return; // keep stars crisp

    mat.fog = true; // ensure USE_FOG path is compiled

    mat.onBeforeCompile = (shader) => {
      // Attach shared uniforms
      shader.uniforms = { ...shader.uniforms, ...uniforms };

      // vertex: capture world position
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vWorldPos;`
        )
        .replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>
           vWorldPos = worldPosition.xyz;`
        );

      // fragment: inject common fog eval + override fog mix
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vWorldPos;
           ${GLSL_COMMON}`
        )
        .replace(
          "#include <fog_fragment>",
          `#ifdef USE_FOG
             float fogFactor;
             vec3  fogCol;
             evalFog(vWorldPos, cameraPosition, fogFactor, fogCol);
             gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogFactor, 0.0, 1.0));
           #endif`
        );

      patched.current.set(mat, shader.uniforms);
    };

    mat.needsUpdate = true;
  };

  // Per frame: traverse and patch; keep sky dome at camera
  useFrame(() => {
    if (!enabled) return;

    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) patchMaterial(m);
    });

    if (group.current) group.current.position.copy(camera.position);
  });

  // Cleanup
  useEffect(() => () => patched.current.clear(), []);

  // Sky dome using SAME uniforms + math
  return (
    <group ref={group}>
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
              float fogFactor;
              vec3  fogCol;
              evalFog(vWorldPos, cameraPosition, fogFactor, fogCol);
              // Draw only the fog contribution over the sky pixels
              gl_FragColor = vec4(fogCol, clamp(fogFactor, 0.0, 1.0));
            }
          `
          }
        />
      </mesh>
    </group>
  );
}
