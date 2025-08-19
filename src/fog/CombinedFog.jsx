import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

// Ashima noise (3D) + FBM
const Noise = `
//
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
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m*=m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float FBM(vec3 p){
  float v=0.0; float a=0.5;
  for(int i=0;i<6;++i){ v+=a*snoise(p); p*=2.0; a*=0.5; }
  return v;
}
`;

export default function CombinedFog({
  // Master
  enabled = true,

  // Base extinction fog
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

  // Noise layer
  enableNoiseFog = true, // Set to true by default
  noiseSpeed = 2.75, // Changed from 1.0
  noiseDistortion = 0.66, // Changed from 1.0
  noiseDirection = [-0.19, -0.18, -0.69], // Changed from [1, 0, 0]
  noiseScale = [20, 4, 20], // Changed from [1, 1, 1]
  noisePosition = [0, 0, 0], // Same as before
  noiseFrequency = 0.04,
  noiseInfluence = 0.85,
}) {
  const { scene, camera } = useThree();
  const patched = useRef(new WeakSet());
  const group = useRef();

  // Shared uniforms
  const uniforms = useMemo(() => {
    const fogColor = new THREE.Color(color);
    fogColor.convertSRGBToLinear();

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

      // noise
      uFogTime: { value: 0 },
      uFogSpeed: { value: noiseSpeed },
      uFogDistortion: { value: noiseDistortion },
      uFogDirection: { value: new THREE.Vector3().fromArray(noiseDirection) },
      uFogScale: { value: new THREE.Vector3().fromArray(noiseScale) },
      uFogPosition: { value: new THREE.Vector3().fromArray(noisePosition) },
      uEnableNoiseFog: { value: enableNoiseFog ? 1 : 0 },
      uNoiseFreq: { value: noiseFrequency },
      uNoiseInfluence: { value: noiseInfluence },
    };
  }, []); // values updated below

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

    uniforms.uFogSpeed.value = noiseSpeed;
    uniforms.uFogDistortion.value = noiseDistortion;
    uniforms.uFogDirection.value.fromArray(noiseDirection);
    uniforms.uFogScale.value.fromArray(noiseScale);
    uniforms.uFogPosition.value.fromArray(noisePosition);
    uniforms.uEnableNoiseFog.value = enableNoiseFog ? 1 : 0;
    uniforms.uNoiseFreq.value = noiseFrequency;
    uniforms.uNoiseInfluence.value = noiseInfluence;
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
    noiseSpeed,
    noiseDistortion,
    noiseDirection,
    noiseScale,
    noisePosition,
    enableNoiseFog,
    noiseFrequency,
    noiseInfluence,
  ]);

  // GLSL common
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

// Noise
uniform float uFogTime;
uniform float uFogSpeed;
uniform float uFogDistortion;
uniform vec3  uFogDirection;
uniform vec3  uFogScale;
uniform vec3  uFogPosition;
uniform float uEnableNoiseFog;
uniform float uNoiseFreq;
uniform float uNoiseInfluence;

float henyeyGreenstein(float mu, float g){
  float g2 = g*g;
  float denom = pow(1.0 + g2 - 2.0*g*mu, 1.5);
  return (1.0 - g2) / (4.0 * 3.14159265 * denom);
}

${Noise}

float sdBox(vec3 p, vec3 b){
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}

void evalFog(in vec3 fragWorld, in vec3 camPos, out float fogFactor, out vec3 fogCol){
  vec3 V = fragWorld - camPos;
  float d = length(V);

  // Height top fade
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

  // Phase / forward scatter tint
  vec3 viewDir = normalize(V);
  float mu = dot(viewDir, -normalize(uLightDir));
  float phase = henyeyGreenstein(mu, uAnisotropy);
  fogCol = uFogColor * mix(1.0, (0.4 + 1.6*phase), uLightIntensity);

  float finalFog = baseFog;

  // Local noise fog (animated)
if(uEnableNoiseFog > 0.5){
  float mask = 1.0 - sdBox(fragWorld - uFogPosition, uFogScale);
  mask = pow(max(mask, 0.0), 0.5);

  vec3 coord = fragWorld * 0.025;
  float n = FBM(coord + FBM(coord + (uFogDirection * uFogTime * 0.025 * uFogSpeed))) * 0.5 + 0.5;
  n = 1.0 - (n * uFogDistortion);

  // Apply stronger effect with additive blending
  float noiseFog = mask * (1.0 - trans) * n * (uDensity * 2.5); // Increased multiplier
  finalFog = finalFog + noiseFog; // Add instead of max() for visible effect
}

  fogFactor = clamp(finalFog * uEnabled, 0.0, 1.0);
}
`;

  const patchMaterial = (mat) => {
    if (!mat || patched.current.has(mat)) return;
    if (mat.isShaderMaterial) return;
    if (mat.isPointsMaterial) return;

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

  useFrame(({ clock }) => {
    uniforms.uFogTime.value = clock.getElapsedTime();

    if (!enabled) return;

    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) patchMaterial(m);
    });

    if (group.current) group.current.position.copy(camera.position);
  });

  // Sky dome draws only fog contribution
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
