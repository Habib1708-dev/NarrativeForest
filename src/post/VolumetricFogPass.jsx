// src/post/VolumetricFogPass.jsx
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { EffectComposer, RenderPass, ShaderPass } from "three-stdlib";

// Volumetric, STATIC cloud-fog with sky-blend and NO jitter (animation removed)
const VolumetricFogShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },

    // camera & matrices
    cameraNear: { value: 0.1 },
    cameraFar: { value: 100.0 },
    projectionMatrixInverse: { value: new THREE.Matrix4() },
    viewMatrixInverse: { value: new THREE.Matrix4() },
    camPos: { value: new THREE.Vector3() },

    // fog look
    fogColor: { value: new THREE.Color("#98a0a5") },
    globalDensity: { value: 0.5 },
    extinction: { value: 1.2 },
    baseHeight: { value: 0.0 },
    heightFalloff: { value: 1.2 },

    // noise (static; no time animation)
    noiseScale: { value: 0.12 },
    noiseIntensity: { value: 0.85 },
    octaves: { value: 4 },
    persistence: { value: 0.55 },
    wind: { value: new THREE.Vector3(0.03, 0.0, 0.06) },
    time: { value: 0.0 },

    // march
    steps: { value: 48 },
    maxDistanceMul: { value: 1.0 },
    jitter: { value: 0.0 }, // kept for API, not used

    // lighting
    lightDir: { value: new THREE.Vector3(-0.5, 0.8, -0.4).normalize() },
    lightIntensity: { value: 0.4 },
    anisotropy: { value: 0.35 },

    // behavior
    affectSky: { value: 1 },

    // SKY BLEND (new)
    skyMaxDistanceMul: { value: 0.1 },
    skyStart: { value: 0.15 },
    skyEnd: { value: 0.07 },
    skyUpFadePow: { value: 6.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    varying vec2 vUv;

    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;

    uniform float cameraNear;
    uniform float cameraFar;
    uniform mat4 projectionMatrixInverse;
    uniform mat4 viewMatrixInverse;
    uniform vec3 camPos;

    uniform vec3 fogColor;
    uniform float globalDensity;
    uniform float extinction;
    uniform float baseHeight;
    uniform float heightFalloff;

    uniform float noiseScale;
    uniform float noiseIntensity;
    uniform int octaves;
    uniform float persistence;
  // animation removed: wind/time not used

    uniform int steps;
    uniform float maxDistanceMul;
    uniform float jitter; // not used anymore

    uniform vec3 lightDir;
    uniform float lightIntensity;
    uniform float anisotropy;

    uniform int affectSky;

    // sky blend
    uniform float skyMaxDistanceMul;
    uniform float skyStart;
    uniform float skyEnd;
    uniform float skyUpFadePow;

    // ---- helpers ----
    vec3 worldPosFromDepth(vec2 uv, float ndcDepth){
      vec4 ndc = vec4(uv * 2.0 - 1.0, ndcDepth * 2.0 - 1.0, 1.0);
      vec4 view = projectionMatrixInverse * ndc;
      view /= view.w;
      vec4 world = viewMatrixInverse * view;
      return world.xyz;
    }

    float hash(vec3 p){
      p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float valueNoise(vec3 p){
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f*f*(3.0 - 2.0*f);
      float n000 = hash(i + vec3(0,0,0));
      float n100 = hash(i + vec3(1,0,0));
      float n010 = hash(i + vec3(0,1,0));
      float n110 = hash(i + vec3(1,1,0));
      float n001 = hash(i + vec3(0,0,1));
      float n101 = hash(i + vec3(1,0,1));
      float n011 = hash(i + vec3(0,1,1));
      float n111 = hash(i + vec3(1,1,1));
      float nx00 = mix(n000, n100, f.x);
      float nx10 = mix(n010, n110, f.x);
      float nx01 = mix(n001, n101, f.x);
      float nx11 = mix(n011, n111, f.x);
      float nxy0 = mix(nx00, nx10, f.y);
      float nxy1 = mix(nx01, nx11, f.y);
      return mix(nxy0, nxy1, f.z);
    }

    float fbm(vec3 p){
      float a = 0.5;
      float s = 0.0;
      float amp = 0.5;
      for(int i=0;i<8;i++){
        if(i>=octaves) break;
        s += valueNoise(p * a) * amp;
        a *= 2.0;
        amp *= persistence;
      }
      return s;
    }

    float henyeyGreenstein(float mu, float g){
      float g2 = g*g;
      float denom = pow(1.0 + g2 - 2.0*g*mu, 1.5);
      return (1.0 - g2) / (4.0 * 3.14159265 * denom);
    }

    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      float depthTex = texture2D(tDepth, vUv).x;

      // Build a world ray
      vec4 ndcNear = vec4(vUv*2.0-1.0, -1.0, 1.0);
      vec4 ndcFar  = vec4(vUv*2.0-1.0,  1.0, 1.0);
      vec4 worldNear = viewMatrixInverse * (projectionMatrixInverse * ndcNear);
      worldNear /= worldNear.w;
      vec4 worldFar  = viewMatrixInverse * (projectionMatrixInverse * ndcFar);
      worldFar  /= worldFar.w;

      vec3 rayOrigin = camPos;
      vec3 rayDir = normalize(worldFar.xyz - rayOrigin);

      // Geometry hit position & distances
      vec3 sceneWorld = worldPosFromDepth(vUv, depthTex);
      bool isSky = (depthTex >= 0.999);

      float maxTGeo = distance(rayOrigin, sceneWorld) * maxDistanceMul;
      float maxTSky = cameraFar * skyMaxDistanceMul;
      float maxT = isSky ? maxTSky : maxTGeo;

      // If no geometry AND we don't want to affect sky, keep original scene
      if(isSky && affectSky == 0){
        gl_FragColor = base;
        return;
      }

      int N = steps;
      float stepLen = maxT / float(N);
      float t = 0.0; // NO JITTER

      vec3 accum = vec3(0.0);
      float transmittance = 1.0;

      // Simple lighting phase
      float mu = dot(rayDir, -normalize(lightDir));
      float phase = henyeyGreenstein(mu, anisotropy);
      float lightBoost = mix(1.0, (0.4 + 1.6*phase), lightIntensity);

      for(int i=0;i<256;i++){
        if(i>=N) break;
        vec3 p = rayOrigin + rayDir * t;

        // Height-based density
        float h = clamp(1.0 - max(0.0, (p.y - baseHeight)) * heightFalloff, 0.0, 1.0);

  // Static FBM noise (no animation)
  vec3 q = p * noiseScale;
        float n = fbm(q);

        float density = globalDensity * h * mix(1.0, n, noiseIntensity);

        // --- SKY BLEND: fade density along sky rays so sky becomes fully visible ---
        if(isSky){
          float tNorm = clamp(t / maxT, 0.0, 1.0);                  // progress along sky march
          float distFade = smoothstep(skyStart, skyEnd, tNorm);      // 0..1
          float up = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);         // 0..1 (upwards)
          float upFade = pow(up, skyUpFadePow);
          density *= (1.0 - distFade) * (1.0 - upFade);
        }

        // Beer-Lambert over this segment
        float sigma = density * extinction;
        float atten = exp(-sigma * stepLen);
        float weight = (1.0 - atten);

        vec3 fogCol = fogColor * lightBoost;
        accum += transmittance * weight * fogCol;

        transmittance *= atten;
        if(transmittance < 1.0/255.0) break;

        t += stepLen;
      }

      vec3 color = base.rgb * transmittance + accum;
      gl_FragColor = vec4(color, base.a);
    }
  `,
};

export default function VolumetricFogPass({
  color = "#98a0a5",
  globalDensity = 0.45,
  extinction = 1.2,
  baseHeight = 0.0,
  heightFalloff = 1.1,
  noiseScale = 0.12,
  noiseIntensity = 0.85,
  octaves = 4,
  persistence = 0.55,
  wind = [0.0, 0.0, 0.0], // unused; kept for API compatibility
  steps = 48,
  maxDistanceMul = 1.0,
  jitter = 0.0, // kept for prop compatibility
  lightDir = [-0.5, 0.8, -0.4],
  lightIntensity = 0.4,
  anisotropy = 0.35,
  affectSky = true,
  // new sky-blend props
  skyMaxDistanceMul = 0.8,
  skyStart = 0.6,
  skyEnd = 0.95,
  skyUpFadePow = 2.0,
  enabled = true,
}) {
  const { gl, scene, camera, size } = useThree();
  const composer = useRef();
  const rt = useRef();
  const pass = useRef();
  // animation clock removed (no time-based animation)
  const clock = useRef({ getDelta: () => 0 });

  const shader = useMemo(() => {
    const s = {
      ...VolumetricFogShader,
      uniforms: THREE.UniformsUtils.clone(VolumetricFogShader.uniforms),
    };
    return s;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // RT with a depthTexture for the shader to read scene depth
    rt.current = new THREE.WebGLRenderTarget(size.width, size.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    });
    rt.current.depthTexture = new THREE.DepthTexture(
      size.width,
      size.height,
      THREE.UnsignedIntType
    );

    composer.current = new EffectComposer(gl, rt.current);
    composer.current.addPass(new RenderPass(scene, camera));

    pass.current = new ShaderPass(shader);
    pass.current.uniforms.tDepth.value = rt.current.depthTexture;
    composer.current.addPass(pass.current);

    return () => {
      composer.current?.dispose();
      rt.current?.dispose();
      composer.current = undefined;
      rt.current = undefined;
      pass.current = undefined;
    };
  }, [gl, scene, camera, size.width, size.height, shader, enabled]);

  // Keep uniforms synced
  useEffect(() => {
    if (!pass.current) return;
    const u = pass.current.uniforms;
    u.fogColor.value.set(color);
    u.globalDensity.value = globalDensity;
    u.extinction.value = extinction;
    u.baseHeight.value = baseHeight;
    u.heightFalloff.value = heightFalloff;
    u.noiseScale.value = noiseScale;
    u.noiseIntensity.value = noiseIntensity;
    u.octaves.value = Math.max(1, Math.min(8, Math.floor(octaves)));
    u.persistence.value = persistence;
    // wind ignored (static noise)
    u.wind.value.set(0, 0, 0);
    u.steps.value = Math.max(8, Math.min(256, Math.floor(steps)));
    u.maxDistanceMul.value = maxDistanceMul;
    u.jitter.value = jitter; // not used, but safe to keep
    u.lightDir.value.fromArray(lightDir).normalize();
    u.lightIntensity.value = lightIntensity;
    u.anisotropy.value = Math.max(-0.9, Math.min(0.9, anisotropy));
    u.affectSky.value = affectSky ? 1 : 0;

    // sky-blend
    u.skyMaxDistanceMul.value = skyMaxDistanceMul;
    u.skyStart.value = skyStart;
    u.skyEnd.value = skyEnd;
    u.skyUpFadePow.value = skyUpFadePow;
  }, [
    color,
    globalDensity,
    extinction,
    baseHeight,
    heightFalloff,
    noiseScale,
    noiseIntensity,
    octaves,
    persistence,
    wind,
    steps,
    maxDistanceMul,
    jitter,
    lightDir,
    lightIntensity,
    anisotropy,
    affectSky,
    skyMaxDistanceMul,
    skyStart,
    skyEnd,
    skyUpFadePow,
  ]);

  // Resize handling
  useEffect(() => {
    if (!composer.current || !rt.current) return;
    composer.current.setSize(size.width, size.height);
    rt.current.setSize(size.width, size.height);
  }, [size]);

  // Per-frame camera updates & time
  useFrame(() => {
    if (!composer.current || !pass.current || !enabled) return;
    const u = pass.current.uniforms;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    u.projectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
    u.viewMatrixInverse.value.copy(camera.matrixWorld);
    u.camPos.value.copy(camera.position);
    // no time progression; keep value constant

    composer.current.render();
  }, 1);

  return null;
}
