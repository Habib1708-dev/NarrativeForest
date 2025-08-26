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
  layer = 1, // sky/stars layer
}) {
  const { scene, camera, gl } = useThree();
  const patched = useRef(new WeakSet());
  const domeRef = useRef();

  // Stable uniforms (mutate .value only)
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

  // keep in sync
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

  // Shared GLSL
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
  return (1.0 - g2) / (4.0 * 3.141592653589793 * denom);
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
`.trim();

  // Patch each MeshStandard/Physical/etc once
  const patchMaterial = (mat) => {
    if (!enabled || !mat || patched.current.has(mat)) return;
    if (mat.isShaderMaterial || mat.isPointsMaterial || mat.isLineBasicMaterial)
      return;

    mat.fog = true;

    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      prev?.(shader);
      Object.assign(shader.uniforms, uniforms);

      // Declare our varying at the top (Three will handle GLSL1/2 transpile)
      shader.vertexShader =
        `varying vec3 uFog_vWorldPos;\n` + shader.vertexShader;

      // Compute world position ourselves AFTER project step (instancing-safe)
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `
#include <project_vertex>
vec4 uFog_wp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  uFog_wp = instanceMatrix * uFog_wp;
#endif
uFog_wp = modelMatrix * uFog_wp;
uFog_vWorldPos = uFog_wp.xyz;
`
      );

      shader.fragmentShader =
        `varying vec3 uFog_vWorldPos;\n${GLSL_COMMON}\n` +
        shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <fog_fragment>",
        `
#ifdef USE_FOG
  float fogFactor; vec3 fogCol;
  evalFog(uFog_vWorldPos, cameraPosition, fogFactor, fogCol);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogFactor, 0.0, 1.0));
#endif
`
      );

      mat.needsUpdate = true;
    };

    patched.current.add(mat);
    mat.needsUpdate = true;
  };

  // Traverse & patch; keep dome centered
  useFrame(() => {
    if (!enabled) return;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) patchMaterial(m);
    });
    if (domeRef.current) domeRef.current.position.copy(camera.position);
  });

  // Cleanup (force program rebuild)
  useEffect(() => {
    return () => {
      patched.current = new WeakSet();
      scene.traverse((o) => {
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m && (m.needsUpdate = true));
        }
      });
      gl.info.programs?.forEach((p) => p?.program?.dispose?.());
    };
  }, [scene, gl]);

  // Put the dome & children on the requested layer
  useEffect(() => {
    if (!domeRef.current) return;
    const setLayers = (obj, idx) => {
      obj.layers.set(idx);
      obj.children?.forEach((c) => setLayers(c, idx));
    };
    setLayers(domeRef.current, layer);
  }, [layer]);

  // Sky dome that visualizes fog at infinity (optional)
  return (
    <group ref={domeRef} layers={layer}>
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
            varying vec3 uFog_vWorldPos;
            void main(){
              vec4 wp = modelMatrix * vec4(position, 1.0);
              uFog_vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `
          }
          fragmentShader={
            /* glsl */ `
            varying vec3 uFog_vWorldPos;
            ${GLSL_COMMON}
            void main(){
              float fogFactor; vec3 fogCol;
              evalFog(uFog_vWorldPos, cameraPosition, fogFactor, fogCol);
              gl_FragColor = vec4(fogCol, clamp(fogFactor, 0.0, 1.0));
            }
          `
          }
        />
      </mesh>
    </group>
  );
}
