// src/fog/CombinedFog.jsx
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

// --- Compact 3D noise + 3-octave FBM (cheap) ---
const Noise = `
// Ashima 3D simplex
vec3 mod289(vec3 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=vec4(1.0)-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+vec4(1.0); vec4 s1=floor(b1)*2.0+vec4(1.0); vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m*=m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
// 3-octave FBM (fast)
float fbm3(vec3 p){
  float v=0.0; float a=0.5;
  v += a * snoise(p); p *= 2.0; a *= 0.5;
  v += a * snoise(p); p *= 2.0; a *= 0.5;
  v += a * snoise(p);
  return v; // ~ -1..1
}
`;

export default function CombinedFog({
  // Master
  enabled = true,

  // Base extinction fog (matches your previous defaults)
  color = "#c1c1c1",
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

  // Sky dome
  skyRadius = 100,

  // Animated local noise fog (culled)
  enableNoiseFog = true,
  noiseDirection = [-2.19, -4.18, -2.69],
  noiseSpeed = 0.2,
  noiseFrequency = 0.01,
  noiseDistortion = 0.74,
  noiseInfluence = 1.14,

  // Cull / scope the animated noise fog
  noiseBoxCenter = [0, -5, 0],
  noiseBoxHalfSize = [10, 2, 10],
  noiseMaxDistance = 10,

  // NEW: separate thickness, near shaping, and far LOD
  noiseBoost = 2.25, // multiplies only noise fog
  noiseNear = 0.0, // start of near boost range
  noiseFar = 16.0, // end of near boost range (falloff to 0)
  noiseAnimFar = 10.0, // beyond this, freeze time & use cheaper noise
}) {
  const { scene } = useThree();
  const patched = useRef(new WeakSet());
  const group = useRef();

  // Shared uniforms
  const uniforms = useMemo(() => {
    const fogColor = new THREE.Color(color).convertSRGBToLinear();
    return {
      // master
      uEnabled: { value: enabled ? 1.0 : 0.0 },

      // base
      uFogColor: { value: fogColor },
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

      // noise (animated, culled)
      uFogTime: { value: 0 },
      uEnableNoiseFog: { value: enableNoiseFog ? 1.0 : 0.0 },
      uNoiseDir: { value: new THREE.Vector3().fromArray(noiseDirection) },
      uNoiseSpeed: { value: noiseSpeed },
      uNoiseFreq: { value: noiseFrequency },
      uNoiseDistortion: { value: noiseDistortion },
      uNoiseInfluence: { value: noiseInfluence },

      uNoiseBoxCenter: { value: new THREE.Vector3().fromArray(noiseBoxCenter) },
      uNoiseBoxHalf: { value: new THREE.Vector3().fromArray(noiseBoxHalfSize) },
      uNoiseMaxDist: { value: noiseMaxDistance },

      // NEW uniforms
      uNoiseBoost: { value: noiseBoost },
      uNoiseNear: { value: noiseNear },
      uNoiseFar: { value: noiseFar },
      uNoiseAnimFar: { value: noiseAnimFar },
    };
  }, []);

  // Live updates
  useEffect(() => {
    uniforms.uEnabled.value = enabled ? 1.0 : 0.0;

    uniforms.uFogColor.value.set(color).convertSRGBToLinear();
    uniforms.uDensity.value = density;
    uniforms.uExtinction.value = extinction;
    uniforms.uFogHeight.value = fogHeight;
    uniforms.uFadeStart.value = fadeStart;
    uniforms.uFadeEnd.value = fadeEnd;
    uniforms.uDistFadeStart.value = distFadeStart;
    uniforms.uDistFadeEnd.value = distFadeEnd;
    uniforms.uLightDir.value.fromArray(lightDir).normalize();
    uniforms.uLightIntensity.value = lightIntensity;
    uniforms.uAnisotropy.value = THREE.MathUtils.clamp(anisotropy, -0.9, 0.9);

    uniforms.uEnableNoiseFog.value = enableNoiseFog ? 1.0 : 0.0;
    uniforms.uNoiseDir.value.fromArray(noiseDirection);
    uniforms.uNoiseSpeed.value = noiseSpeed;
    uniforms.uNoiseFreq.value = noiseFrequency;
    uniforms.uNoiseDistortion.value = noiseDistortion;
    uniforms.uNoiseInfluence.value = noiseInfluence;

    uniforms.uNoiseBoxCenter.value.fromArray(noiseBoxCenter);
    uniforms.uNoiseBoxHalf.value.fromArray(noiseBoxHalfSize);
    uniforms.uNoiseMaxDist.value = noiseMaxDistance;

    // NEW updates
    uniforms.uNoiseBoost.value = noiseBoost;
    uniforms.uNoiseNear.value = noiseNear;
    uniforms.uNoiseFar.value = noiseFar;
    uniforms.uNoiseAnimFar.value = noiseAnimFar;
  }, [
    enabled,
    color,
    density,
    extinction,
    fogHeight,
    fadeStart,
    fadeEnd,
    distFadeStart,
    distFadeEnd,
    lightDir,
    lightIntensity,
    anisotropy,

    enableNoiseFog,
    noiseDirection,
    noiseSpeed,
    noiseFrequency,
    noiseDistortion,
    noiseInfluence,

    noiseBoxCenter,
    noiseBoxHalfSize,
    noiseMaxDistance,

    // NEW deps
    noiseBoost,
    noiseNear,
    noiseFar,
    noiseAnimFar,
  ]);

  // GLSL common with early-outs + distance cull + 3-octave noise
  const GLSL_COMMON = `
uniform float uEnabled;
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

uniform float uFogTime;
uniform float uEnableNoiseFog;
uniform vec3  uNoiseDir;
uniform float uNoiseSpeed;
uniform float uNoiseFreq;
uniform float uNoiseDistortion;
uniform float uNoiseInfluence;

uniform vec3  uNoiseBoxCenter;
uniform vec3  uNoiseBoxHalf;
uniform float uNoiseMaxDist;

// NEW uniforms
uniform float uNoiseBoost;
uniform float uNoiseNear;
uniform float uNoiseFar;
uniform float uNoiseAnimFar;

float henyeyGreenstein(float mu, float g){
  float g2 = g*g;
  float denom = pow(1.0 + g2 - 2.0*g*mu, 1.5);
  return (1.0 - g2) / (4.0 * 3.14159265 * denom);
}

${Noise}

// fast AABB test (inside box?)
bool insideBox(vec3 p, vec3 c, vec3 h){
  vec3 d = abs(p - c);
  return (d.x <= h.x && d.y <= h.y && d.z <= h.z);
}

// Ray-box intersect; returns [t0,t1] param range if hit (slab method)
bool rayBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t0, out float t1){
  vec3 inv = 1.0 / rd;
  vec3 tmin = (bmin - ro) * inv;
  vec3 tmax = (bmax - ro) * inv;
  vec3 t1v = min(tmin, tmax);
  vec3 t2v = max(tmin, tmax);
  t0 = max(max(t1v.x, t1v.y), t1v.z);
  t1 = min(min(t2v.x, t2v.y), t2v.z);
  return t1 >= max(t0, 0.0);
}

void evalFog(in vec3 fragWorld, in vec3 camPos, out float fogFactor, out vec3 fogCol){
  vec3 V = fragWorld - camPos;
  float d = length(V);

  // Height fade
  float yRel = fragWorld.y - uFogHeight;
  float heightMask = 1.0 - smoothstep(uFadeStart, uFadeEnd, yRel);
  heightMask = clamp(heightMask, 0.0, 1.0);

  // Beer-Lambert
  float sigma = max(1e-6, uExtinction * uDensity);
  float trans = exp(-sigma * d);

  // Distance-forced fade
  float df = smoothstep(uDistFadeStart, uDistFadeEnd, d);
  trans = mix(trans, 0.0, df);

  float baseFog = (1.0 - trans) * heightMask;

  // Phase (skip math when intensity is ~0)
  vec3 viewDir = normalize(V);
  float phaseMix = 1.0;
  if(uLightIntensity > 0.001){
    float mu = dot(viewDir, -normalize(uLightDir));
    float phase = henyeyGreenstein(mu, uAnisotropy);
    phaseMix = mix(1.0, (0.4 + 1.6*phase), uLightIntensity);
  }
  fogCol = uFogColor * phaseMix;

  float finalFog = baseFog;

  // Animated noise — only if enabled, inside box, and within camera distance
  if(uEnableNoiseFog > 0.5){
    if(d <= uNoiseMaxDist && insideBox(fragWorld, uNoiseBoxCenter, uNoiseBoxHalf)){
      // --- Volumetric-ish thickness (ray length inside fog box up to the fragment) ---
      vec3 ro = camPos;
      vec3 rd = normalize(V);
      vec3 bmin = uNoiseBoxCenter - uNoiseBoxHalf;
      vec3 bmax = uNoiseBoxCenter + uNoiseBoxHalf;
      float t0, t1;
      float thicknessWeight = 0.0;
      if (rayBox(ro, rd, bmin, bmax, t0, t1)) {
        float tEnter = max(t0, 0.0);
        float tExit  = min(t1, d);
        float seg = max(tExit - tEnter, 0.0);
        // normalize by a typical thickness: box height
        float refLen = max(2.0 * uNoiseBoxHalf.y, 1e-3);
        thicknessWeight = clamp(seg / refLen, 0.0, 1.0);
      }

      // --- Near weight: full near, fades by uNoiseFar ---
      float nearW = 1.0 - smoothstep(uNoiseNear, uNoiseFar, d);

      // --- Cheap LOD: stop animation & use cheaper noise when far ---
      float tPhase = (d <= uNoiseAnimFar) ? uFogTime : 0.0;

      vec3 coord = fragWorld * uNoiseFreq + uNoiseDir * (tPhase * uNoiseSpeed);

      // 2 quality levels: fbm near, single octave far — blended by nearW
      float nNear = fbm3(coord) * 0.5 + 0.5; // 0..1 (3 octaves)
      float nFar  = snoise(coord) * 0.5 + 0.5; // 0..1 (1 octave)
      float n = mix(nFar, nNear, nearW);

      // Shape to “misty” and apply your distortion
      float shaped = 1.0 - (n * uNoiseDistortion);
      shaped = clamp(shaped, 0.0, 1.0);

      // Final noise fog — separate gain via uNoiseBoost
      float noiseFog = (1.0 - trans) * shaped * uNoiseInfluence
                     * thicknessWeight * nearW * uNoiseBoost;

      finalFog += noiseFog;
    }
  }

  fogFactor = clamp(finalFog * uEnabled, 0.0, 1.0);
}
`;

  // Patch built-in materials once per material
  const patchMaterial = (mat) => {
    if (!mat || patched.current.has(mat)) return;
    if (mat.isShaderMaterial) return;
    if (mat.isPointsMaterial) return; // keep stars crisp

    mat.fog = true;
    const prev = mat.onBeforeCompile;

    mat.onBeforeCompile = (shader) => {
      if (prev) prev(shader);
      shader.uniforms = { ...shader.uniforms, ...uniforms };

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\n varying vec3 vCFWorldPos;`
        )
        .replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>\n vCFWorldPos = worldPosition.xyz;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\n varying vec3 vCFWorldPos;\n ${GLSL_COMMON}`
        )
        .replace(
          "#include <fog_fragment>",
          `#include <fog_fragment>
#ifdef USE_FOG
{
  float fogFactor; vec3 fogCol;
  evalFog(vCFWorldPos, cameraPosition, fogFactor, fogCol);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogFactor);
}
#endif
`
        );
    };

    patched.current.add(mat);
    mat.needsUpdate = true;
  };

  // Scan a few frames to catch late-loaded meshes, then stop
  const scanFramesLeft = useRef(180);
  useFrame(({ clock }) => {
    uniforms.uFogTime.value = clock.getElapsedTime();

    if (!enabled) return;

    if (scanFramesLeft.current > 0) {
      scene.traverse((obj) => {
        if (!obj.isMesh) return;
        const list = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const m of list) patchMaterial(m);
      });
      scanFramesLeft.current--;
    }
  });

  // Sky dome: uses same eval but noise won’t run (outside box & far away)
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
              float fogFactor; vec3 fogCol;
              evalFog(vWorldPos, cameraPosition, fogFactor, fogCol);
              gl_FragColor = vec4(fogCol, fogFactor);
            }
          `
          }
        />
      </mesh>
    </group>
  );
}
