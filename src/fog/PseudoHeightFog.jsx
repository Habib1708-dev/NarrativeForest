// src/fog/PseudoHeightFog.jsx
import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Faraz-style "pseudo height fog":
 * - Overrides the built-in fog shader chunk (fog_fragment) the way the demo describes:
 *   overriding Three.js' ShaderChunk to add a height-based + distance fog with animated noise.
 * - We still attach uniforms per-material via onBeforeCompile so values are dynamic via React.
 * - Skips ShaderMaterial and PointsMaterial (stars stay crisp).
 *
 * Notes:
 * - Keep <fog/> on the scene so USE_FOG is defined.
 * - Safe to keep alongside your UnifiedForwardFog — give each its own enable toggle.
 */
export default function PseudoHeightFog({
  enabled = true,

  // Visual
  color = "#9aa4aa",
  density = 0.35, // base multiplier
  extinction = 1.0, // Beer-Lambert coefficient

  // Height band (your terrain sits around y=-10)
  fogHeight = -10.0, // base of fog layer
  fadeStart = 0.0, // start fading out above base
  fadeEnd = 14.0, // fully disappears above this (world Y)

  // Force far meshes to vanish into fog (fit 20×20 world)
  distFadeStart = 10.0,
  distFadeEnd = 18.0,

  // Motion / “volumetric” feel (animated noise)
  noiseScale = 0.18, // bigger -> lumpier
  noiseIntensity = 0.6, // 0..1
  wind = [0.02, 0.0, 0.03], // world-space drift
  octaves = 4,
  persistence = 0.55,

  // Lighting kick (subtle)
  lightDir = [-0.5, 0.8, -0.4],
  lightIntensity = 0.25,
  anisotropy = 0.2,
}) {
  const { scene } = useThree();
  const patched = useRef(new WeakMap());
  const tRef = useRef(0);

  // Shared defaults cached each frame
  const cache = useRef({
    color3: new THREE.Color(color),
    density,
    extinction,
    fogHeight,
    fadeStart,
    fadeEnd,
    distFadeStart,
    distFadeEnd,
    noiseScale,
    noiseIntensity,
    octaves: Math.max(1, Math.min(8, Math.floor(octaves))),
    persistence,
    wind: new THREE.Vector3().fromArray(wind),
    lightDir: new THREE.Vector3().fromArray(lightDir).normalize(),
    lightIntensity,
    anisotropy: THREE.MathUtils.clamp(anisotropy, -0.9, 0.9),
  });

  // Keep cache in sync with props
  useEffect(() => {
    cache.current.color3.set(color);
  }, [color]);
  useEffect(() => {
    cache.current.density = density;
  }, [density]);
  useEffect(() => {
    cache.current.extinction = extinction;
  }, [extinction]);
  useEffect(() => {
    cache.current.fogHeight = fogHeight;
  }, [fogHeight]);
  useEffect(() => {
    cache.current.fadeStart = fadeStart;
  }, [fadeStart]);
  useEffect(() => {
    cache.current.fadeEnd = fadeEnd;
  }, [fadeEnd]);
  useEffect(() => {
    cache.current.distFadeStart = distFadeStart;
  }, [distFadeStart]);
  useEffect(() => {
    cache.current.distFadeEnd = distFadeEnd;
  }, [distFadeEnd]);
  useEffect(() => {
    cache.current.noiseScale = noiseScale;
  }, [noiseScale]);
  useEffect(() => {
    cache.current.noiseIntensity = noiseIntensity;
  }, [noiseIntensity]);
  useEffect(() => {
    cache.current.octaves = Math.max(1, Math.min(8, Math.floor(octaves)));
  }, [octaves]);
  useEffect(() => {
    cache.current.persistence = persistence;
  }, [persistence]);
  useEffect(() => {
    cache.current.wind.fromArray(wind);
  }, [wind]);
  useEffect(() => {
    cache.current.lightDir.fromArray(lightDir).normalize();
  }, [lightDir]);
  useEffect(() => {
    cache.current.lightIntensity = lightIntensity;
  }, [lightIntensity]);
  useEffect(() => {
    cache.current.anisotropy = THREE.MathUtils.clamp(anisotropy, -0.9, 0.9);
  }, [anisotropy]);

  // GLSL helpers (fast value noise + FBM)
  const NOISE_GLSL = `
    float hash3(vec3 p){
      p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
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
    float fbm3(vec3 p, int oct, float pers){
      float s = 0.0;
      float a = 0.5;
      float amp = 0.5;
      for(int i=0;i<8;i++){
        if(i>=oct) break;
        s += valueNoise3(p * a) * amp;
        a *= 2.0;
        amp *= pers;
      }
      return s;
    }
    float henyeyGreenstein(float mu, float g){
      float g2 = g*g;
      float denom = pow(1.0 + g2 - 2.0*g*mu, 1.5);
      return (1.0 - g2) / (4.0 * 3.14159265 * denom);
    }
  `;

  // Inject per-material
  const patch = (mat) => {
    if (!enabled || !mat || patched.current.has(mat)) return;
    if (mat.isShaderMaterial) return;
    if (mat.isPointsMaterial) return;

    mat.fog = true; // ensure USE_FOG path

    mat.onBeforeCompile = (shader) => {
      // uniforms for this material (bound every frame)
      shader.uniforms.uPHF_Color = { value: cache.current.color3.clone() };
      shader.uniforms.uPHF_Density = { value: cache.current.density };
      shader.uniforms.uPHF_Extinction = { value: cache.current.extinction };
      shader.uniforms.uPHF_Height = { value: cache.current.fogHeight };
      shader.uniforms.uPHF_FadeStart = { value: cache.current.fadeStart };
      shader.uniforms.uPHF_FadeEnd = { value: cache.current.fadeEnd };
      shader.uniforms.uPHF_DistStart = { value: cache.current.distFadeStart };
      shader.uniforms.uPHF_DistEnd = { value: cache.current.distFadeEnd };
      shader.uniforms.uPHF_NoiseScale = { value: cache.current.noiseScale };
      shader.uniforms.uPHF_NoiseIntensity = {
        value: cache.current.noiseIntensity,
      };
      shader.uniforms.uPHF_Octaves = { value: cache.current.octaves };
      shader.uniforms.uPHF_Persistence = { value: cache.current.persistence };
      shader.uniforms.uPHF_Wind = { value: cache.current.wind.clone() };
      shader.uniforms.uPHF_Time = { value: tRef.current };
      shader.uniforms.uPHF_LightDir = { value: cache.current.lightDir.clone() };
      shader.uniforms.uPHF_LightIntensity = {
        value: cache.current.lightIntensity,
      };
      shader.uniforms.uPHF_Anisotropy = { value: cache.current.anisotropy };

      // vertex: capture world position
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vPHF_WorldPos;`
        )
        .replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>
           vPHF_WorldPos = worldPosition.xyz;`
        );

      // fragment: add our uniforms + noise; override fog mix
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vPHF_WorldPos;
           uniform vec3  uPHF_Color;
           uniform float uPHF_Density;
           uniform float uPHF_Extinction;
           uniform float uPHF_Height;
           uniform float uPHF_FadeStart;
           uniform float uPHF_FadeEnd;
           uniform float uPHF_DistStart;
           uniform float uPHF_DistEnd;
           uniform float uPHF_NoiseScale;
           uniform float uPHF_NoiseIntensity;
           uniform int   uPHF_Octaves;
           uniform float uPHF_Persistence;
           uniform vec3  uPHF_Wind;
           uniform float uPHF_Time;
           uniform vec3  uPHF_LightDir;
           uniform float uPHF_LightIntensity;
           uniform float uPHF_Anisotropy;
           ${NOISE_GLSL}`
        )
        .replace(
          "#include <fog_fragment>",
          `#ifdef USE_FOG
            // Vector from camera -> fragment
            vec3  V = vPHF_WorldPos - cameraPosition;
            float d = length(V);

            // Height fade (top cutoff)
            float yRel = vPHF_WorldPos.y - uPHF_Height;
            float hMask = 1.0 - smoothstep(uPHF_FadeStart, uPHF_FadeEnd, yRel);
            hMask = clamp(hMask, 0.0, 1.0);

            // Animated noise (gives soft "volume" feel)
            vec3 q = vPHF_WorldPos * uPHF_NoiseScale + uPHF_Wind * uPHF_Time;
            float n = fbm3(q, uPHF_Octaves, uPHF_Persistence);
            float noisy = mix(1.0, n, clamp(uPHF_NoiseIntensity, 0.0, 1.0));

            // Exponential fog (Beer-Lambert)
            float sigma = max(1e-6, uPHF_Extinction * uPHF_Density * noisy);
            float trans = exp(-sigma * d);

            // Force distant geometry to vanish fully
            float df = smoothstep(uPHF_DistStart, uPHF_DistEnd, d);
            trans = mix(trans, 0.0, df);

            // Phase-like forward scatter (very mild)
            float mu = dot(normalize(V), -normalize(uPHF_LightDir));
            float phase = henyeyGreenstein(mu, uPHF_Anisotropy);
            vec3 fogCol = uPHF_Color * mix(1.0, (0.4 + 1.6*phase), uPHF_LightIntensity);

            float fogFactor = (1.0 - trans) * hMask;
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogFactor, 0.0, 1.0));
          #endif`
        );

      patched.current.set(mat, shader.uniforms);
    };

    mat.needsUpdate = true;
  };

  useFrame((_, dt) => {
    if (!enabled) return;
    tRef.current += dt;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) patch(m);
    });
    // push updated uniform values each frame
    patched.current.forEach((u, m) => {
      if (!m || !u) return;
      u.uPHF_Color?.value.copy(cache.current.color3);
      if (u.uPHF_Density) u.uPHF_Density.value = cache.current.density;
      if (u.uPHF_Extinction) u.uPHF_Extinction.value = cache.current.extinction;
      if (u.uPHF_Height) u.uPHF_Height.value = cache.current.fogHeight;
      if (u.uPHF_FadeStart) u.uPHF_FadeStart.value = cache.current.fadeStart;
      if (u.uPHF_FadeEnd) u.uPHF_FadeEnd.value = cache.current.fadeEnd;
      if (u.uPHF_DistStart)
        u.uPHF_DistStart.value = cache.current.distFadeStart;
      if (u.uPHF_DistEnd) u.uPHF_DistEnd.value = cache.current.distFadeEnd;
      if (u.uPHF_NoiseScale) u.uPHF_NoiseScale.value = cache.current.noiseScale;
      if (u.uPHF_NoiseIntensity)
        u.uPHF_NoiseIntensity.value = cache.current.noiseIntensity;
      if (u.uPHF_Octaves) u.uPHF_Octaves.value = cache.current.octaves;
      if (u.uPHF_Persistence)
        u.uPHF_Persistence.value = cache.current.persistence;
      u.uPHF_Wind?.value.copy(cache.current.wind);
      u.uPHF_LightDir?.value.copy(cache.current.lightDir);
      if (u.uPHF_LightIntensity)
        u.uPHF_LightIntensity.value = cache.current.lightIntensity;
      if (u.uPHF_Anisotropy) u.uPHF_Anisotropy.value = cache.current.anisotropy;
      if (u.uPHF_Time) u.uPHF_Time.value = tRef.current;
    });
  });

  useEffect(() => () => (patched.current = new WeakMap()), []);

  return null;
}
