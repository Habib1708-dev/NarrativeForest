// src/fog/ForwardFog.jsx
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";

/**
 * Forward (component) fog injected into built-in materials via onBeforeCompile.
 * - Height-based density
 * - Animated FBM noise (wind-driven)
 * - Simple phase-like light boost toward a lightDir
 * - "Look-up" fade so the sky/stars remain visible overhead
 *
 * Notes:
 * - Requires scene.fog to be present so three.js defines USE_FOG (you already have <fog/> in Experience).
 * - Skips PointsMaterial/ShaderMaterial by default (so stars are untouched).
 */
export default function ForwardFog({
  enabled = true,
  color = "#98a0a5",
  globalDensity = 0.45,
  extinction = 1.2,
  baseHeight = 0.0,
  heightFalloff = 1.1,
  noiseScale = 0.12,
  noiseIntensity = 0.85,
  octaves = 4,
  persistence = 0.55,
  wind = [0.03, 0.0, 0.06],
  lightDir = [-0.5, 0.8, -0.4],
  lightIntensity = 0.4,
  anisotropy = 0.35,
  // Forward version uses only "look-up" fade (no depth sky blend needed)
  skyUpFadePow = 2.0,
  // Also optionally haze the sky near the horizon so meshes blend into sky
  affectSky = true,
  skyHazeStart = 0.05, // 'up' at which haze starts (0=horizon, 1=zenith)
  skyHazeEnd = 0.5, // 'up' where haze fully fades
  skyHazePow = 1.8,
}) {
  const { scene } = useThree();
  const fogMats = useRef(new Map()); // material -> shader.uniforms
  const uniformsCache = useRef({
    uFogColor: new THREE.Color(color),
    uGlobalDensity: globalDensity,
    uExtinction: extinction,
    uBaseHeight: baseHeight,
    uHeightFalloff: heightFalloff,
    uNoiseScale: noiseScale,
    uNoiseIntensity: noiseIntensity,
    uOctaves: Math.max(1, Math.min(8, Math.floor(octaves))),
    uPersistence: persistence,
    uWind: new THREE.Vector3().fromArray(wind),
    uLightDir: new THREE.Vector3().fromArray(lightDir).normalize(),
    uLightIntensity: lightIntensity,
    uAnisotropy: Math.max(-0.9, Math.min(0.9, anisotropy)),
    uSkyUpFadePow: skyUpFadePow,
    // sky haze controls
    uSkyHazeStart: skyHazeStart,
    uSkyHazeEnd: skyHazeEnd,
    uSkyHazePow: skyHazePow,
  });
  const timeRef = useRef(0);

  // Update cache when props change
  useEffect(() => {
    uniformsCache.current.uFogColor.set(color);
  }, [color]);
  useEffect(() => {
    uniformsCache.current.uGlobalDensity = globalDensity;
  }, [globalDensity]);
  useEffect(() => {
    uniformsCache.current.uExtinction = extinction;
  }, [extinction]);
  useEffect(() => {
    uniformsCache.current.uBaseHeight = baseHeight;
  }, [baseHeight]);
  useEffect(() => {
    uniformsCache.current.uHeightFalloff = heightFalloff;
  }, [heightFalloff]);
  useEffect(() => {
    uniformsCache.current.uNoiseScale = noiseScale;
  }, [noiseScale]);
  useEffect(() => {
    uniformsCache.current.uNoiseIntensity = noiseIntensity;
  }, [noiseIntensity]);
  useEffect(() => {
    uniformsCache.current.uOctaves = Math.max(
      1,
      Math.min(8, Math.floor(octaves))
    );
  }, [octaves]);
  useEffect(() => {
    uniformsCache.current.uPersistence = persistence;
  }, [persistence]);
  useEffect(() => {
    uniformsCache.current.uWind.fromArray(wind);
  }, [wind]);
  useEffect(() => {
    uniformsCache.current.uLightDir.fromArray(lightDir).normalize();
  }, [lightDir]);
  useEffect(() => {
    uniformsCache.current.uLightIntensity = lightIntensity;
  }, [lightIntensity]);
  useEffect(() => {
    uniformsCache.current.uAnisotropy = Math.max(
      -0.9,
      Math.min(0.9, anisotropy)
    );
  }, [anisotropy]);
  useEffect(() => {
    uniformsCache.current.uSkyUpFadePow = skyUpFadePow;
  }, [skyUpFadePow]);
  useEffect(() => {
    uniformsCache.current.uSkyHazeStart = skyHazeStart;
  }, [skyHazeStart]);
  useEffect(() => {
    uniformsCache.current.uSkyHazeEnd = skyHazeEnd;
  }, [skyHazeEnd]);
  useEffect(() => {
    uniformsCache.current.uSkyHazePow = skyHazePow;
  }, [skyHazePow]);

  // Patch helper
  const patchMaterial = (mat) => {
    if (!enabled) return;
    if (!mat || fogMats.current.has(mat)) return;

    // Special-case: patch drei Sky shader for horizon haze (optional)
    if (
      affectSky &&
      mat.isShaderMaterial &&
      mat.uniforms &&
      "sunPosition" in mat.uniforms
    ) {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uFogColor = {
          value: uniformsCache.current.uFogColor.clone(),
        };
        shader.uniforms.uGlobalDensity = {
          value: uniformsCache.current.uGlobalDensity,
        };
        shader.uniforms.uSkyHazeStart = {
          value: uniformsCache.current.uSkyHazeStart,
        };
        shader.uniforms.uSkyHazeEnd = {
          value: uniformsCache.current.uSkyHazeEnd,
        };
        shader.uniforms.uSkyHazePow = {
          value: uniformsCache.current.uSkyHazePow,
        };

        // Ensure we have world position varying (drei Sky already provides vWorldPosition)
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
             uniform vec3 uFogColor;
             uniform float uGlobalDensity;
             uniform float uSkyHazeStart;
             uniform float uSkyHazeEnd;
             uniform float uSkyHazePow;`
          )
          .replace(
            /gl_FragColor\s*=\s*vec4\(\s*color\s*,\s*1\.0\s*\);/,
            `
             // horizon haze: stronger near horizon (low up value), fades toward zenith
             vec3 viewDirSky = normalize(vWorldPosition - cameraPosition);
             float upSky = clamp(viewDirSky.y * 0.5 + 0.5, 0.0, 1.0);
             float haze = 1.0 - smoothstep(uSkyHazeStart, uSkyHazeEnd, upSky);
             haze = pow(haze, uSkyHazePow) * clamp(uGlobalDensity, 0.0, 2.0);
             vec3 blended = mix(color, uFogColor, clamp(haze, 0.0, 1.0));
             gl_FragColor = vec4( blended, 1.0 );
            `
          );

        fogMats.current.set(mat, shader.uniforms);
      };
      mat.needsUpdate = true;
      return;
    }

    if (mat.isShaderMaterial) return; // skip other user shaders
    if (mat.isPointsMaterial) return; // keep stars unaffected

    // Force fog path to compile (#ifdef USE_FOG)
    mat.fog = true;

    mat.onBeforeCompile = (shader) => {
      // uniforms
      shader.uniforms.uFogColor = {
        value: uniformsCache.current.uFogColor.clone(),
      };
      shader.uniforms.uGlobalDensity = {
        value: uniformsCache.current.uGlobalDensity,
      };
      shader.uniforms.uExtinction = {
        value: uniformsCache.current.uExtinction,
      };
      shader.uniforms.uBaseHeight = {
        value: uniformsCache.current.uBaseHeight,
      };
      shader.uniforms.uHeightFalloff = {
        value: uniformsCache.current.uHeightFalloff,
      };
      shader.uniforms.uNoiseScale = {
        value: uniformsCache.current.uNoiseScale,
      };
      shader.uniforms.uNoiseIntensity = {
        value: uniformsCache.current.uNoiseIntensity,
      };
      shader.uniforms.uOctaves = { value: uniformsCache.current.uOctaves };
      shader.uniforms.uPersistence = {
        value: uniformsCache.current.uPersistence,
      };
      shader.uniforms.uWind = { value: uniformsCache.current.uWind.clone() };
      shader.uniforms.uTime = { value: timeRef.current };
      shader.uniforms.uLightDir = {
        value: uniformsCache.current.uLightDir.clone(),
      };
      shader.uniforms.uLightIntensity = {
        value: uniformsCache.current.uLightIntensity,
      };
      shader.uniforms.uAnisotropy = {
        value: uniformsCache.current.uAnisotropy,
      };
      shader.uniforms.uSkyUpFadePow = {
        value: uniformsCache.current.uSkyUpFadePow,
      };

      // vertex: carry world position
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

      // fragment: uniforms + helpers + fog override
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vWorldPos;
           uniform vec3 uFogColor;
           uniform float uGlobalDensity;
           uniform float uExtinction;
           uniform float uBaseHeight;
           uniform float uHeightFalloff;
           uniform float uNoiseScale;
           uniform float uNoiseIntensity;
           uniform int uOctaves;
           uniform float uPersistence;
           uniform vec3 uWind;
           uniform float uTime;
           uniform vec3 uLightDir;
           uniform float uLightIntensity;
           uniform float uAnisotropy;
           uniform float uSkyUpFadePow;

           // --- small value noise + FBM ---
           float hash3(vec3 p){
             p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
             p *= 17.0;
             return fract(p.x*p.y*p.z*(p.x + p.y + p.z));
           }
           float valueNoise3(vec3 p){
             vec3 i = floor(p);
             vec3 f = fract(p);
             f = f*f*(3.0 - 2.0*f);
             float n000 = hash3(i + vec3(0,0,0));
             float n100 = hash3(i + vec3(1,0,0));
             float n010 = hash3(i + vec3(0,1,0));
             float n110 = hash3(i + vec3(1,1,0));
             float n001 = hash3(i + vec3(0,0,1));
             float n101 = hash3(i + vec3(1,0,1));
             float n011 = hash3(i + vec3(0,1,1));
             float n111 = hash3(i + vec3(1,1,1));
             float nx00 = mix(n000, n100, f.x);
             float nx10 = mix(n010, n110, f.x);
             float nx01 = mix(n001, n101, f.x);
             float nx11 = mix(n011, n111, f.x);
             float nxy0 = mix(nx00, nx10, f.y);
             float nxy1 = mix(nx01, nx11, f.y);
             return mix(nxy0, nxy1, f.z);
           }
           float fbm3(vec3 p){
             float s = 0.0;
             float a = 0.5;
             float amp = 0.5;
             for(int i=0;i<8;i++){
               if(i>=uOctaves) break;
               s += valueNoise3(p * a) * amp;
               a *= 2.0;
               amp *= uPersistence;
             }
             return s;
           }
           float henyeyGreenstein(float mu, float g){
             float g2 = g*g;
             float denom = pow(1.0 + g2 - 2.0*g*mu, 1.5);
             return (1.0 - g2) / (4.0 * 3.14159265 * denom);
           }`
        )
        .replace(
          "#include <fog_fragment>",
          `#ifdef USE_FOG
             // View direction from camera to fragment
             vec3 viewDir = normalize(vWorldPos - cameraPosition);

             // Height term (ground fog / low clouds)
             float h = clamp(1.0 - max(0.0, (vWorldPos.y - uBaseHeight)) * uHeightFalloff, 0.0, 1.0);

             // Animated 3D noise (world space)
             vec3 q = vWorldPos * uNoiseScale + uWind * uTime;
             float n = fbm3(q);

             // Density at this fragment
             float density = uGlobalDensity * h * mix(1.0, n, uNoiseIntensity);

             // Fade fog when looking up so sky/stars remain visible
             float up = clamp(viewDir.y * 0.5 + 0.5, 0.0, 1.0);
             density *= (1.0 - pow(up, uSkyUpFadePow));

             // Beer-Lambert along approximate distance camera->fragment
             float distCF = length(vWorldPos - cameraPosition);
             float sigma = density * uExtinction;
             float transmittance = exp(-sigma * distCF);

             // Gentle forward-scatter look
             float mu = dot(-viewDir, normalize(-uLightDir));
             float phase = henyeyGreenstein(mu, uAnisotropy);
             vec3 fogCol = uFogColor * mix(1.0, (0.4 + 1.6*phase), uLightIntensity);

             gl_FragColor.rgb = mix(fogCol, gl_FragColor.rgb, clamp(transmittance, 0.0, 1.0));
           #endif`
        );

      fogMats.current.set(mat, shader.uniforms);
    };

    // trigger recompile
    mat.needsUpdate = true;
  };

  // Scan & patch new materials (cheap guard via WeakMap)
  useFrame((_, delta) => {
    if (!enabled) return;

    timeRef.current += delta;

    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      for (const m of materials) patchMaterial(m);
    });

    // Update uniforms for all patched materials (including sky shader)
    fogMats.current.forEach((u, mat) => {
      if (!mat || mat.isDisposed) return;
      if (!u) return;
      u.uFogColor?.value.copy(uniformsCache.current.uFogColor);
      if (u.uGlobalDensity)
        u.uGlobalDensity.value = uniformsCache.current.uGlobalDensity;
      if (u.uExtinction)
        u.uExtinction.value = uniformsCache.current.uExtinction;
      if (u.uBaseHeight)
        u.uBaseHeight.value = uniformsCache.current.uBaseHeight;
      if (u.uHeightFalloff)
        u.uHeightFalloff.value = uniformsCache.current.uHeightFalloff;
      if (u.uNoiseScale)
        u.uNoiseScale.value = uniformsCache.current.uNoiseScale;
      if (u.uNoiseIntensity)
        u.uNoiseIntensity.value = uniformsCache.current.uNoiseIntensity;
      if (u.uOctaves) u.uOctaves.value = uniformsCache.current.uOctaves;
      if (u.uPersistence)
        u.uPersistence.value = uniformsCache.current.uPersistence;
      u.uWind?.value.copy(uniformsCache.current.uWind);
      u.uLightDir?.value.copy(uniformsCache.current.uLightDir);
      if (u.uLightIntensity)
        u.uLightIntensity.value = uniformsCache.current.uLightIntensity;
      if (u.uAnisotropy)
        u.uAnisotropy.value = uniformsCache.current.uAnisotropy;
      if (u.uSkyUpFadePow)
        u.uSkyUpFadePow.value = uniformsCache.current.uSkyUpFadePow;
      if (u.uTime) u.uTime.value = timeRef.current;
      // sky haze params
      if (u.uSkyHazeStart)
        u.uSkyHazeStart.value = uniformsCache.current.uSkyHazeStart;
      if (u.uSkyHazeEnd)
        u.uSkyHazeEnd.value = uniformsCache.current.uSkyHazeEnd;
      if (u.uSkyHazePow)
        u.uSkyHazePow.value = uniformsCache.current.uSkyHazePow;
    });
  });

  // Clean up map on unmount
  useEffect(() => {
    return () => {
      fogMats.current.clear();
    };
  }, []);

  return null;
}
