// src/components/Aurora.jsx
import React, { forwardRef, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

const MAX_BENDS = 32;

// tiny xorshift RNG
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const Aurora = forwardRef(function Aurora(
  {
    width = 14,
    height = 3,
    segW = 400,
    segH = 32,
    position = [-2, 2, -2],
    opacity = 0.6,

    // fixed during animation
    bends = 12,
    intensity = 1.0,
    seed = 12345,

    // subtle motion
    giBias = 1.15,
    giAmp = 0.18,
    giFreq = 0.035,
    giFreq2 = 0.012,
    smoothnessBase = 1.0,
    smoothnessK = 0.35,
    driftSpeed = 0.004,
    driftJitter = 0.02,
    driftFreq = 0.2,

    // Perlin fragment controls
    noiseScale = 3.0, // overall tiling density
    noiseSpeed = 0.15, // animation speed
    stretchY = 0.15, // < 1.0 => elongated features along Y (vertically stretched)
  },
  ref
) {
  const meshRef = useRef();

  // stable per-bend params
  const bendParams = useMemo(() => {
    const N = Math.min(bends, MAX_BENDS);
    const rand = rng(seed);
    const centers = new Float32Array(N);
    const theta = new Float32Array(N);
    const sign = new Float32Array(N);
    const phase = new Float32Array(N);

    const tmp = [];
    for (let i = 0; i < N; i++) {
      const base = (i + 0.5) / N;
      const jitter = (rand() - 0.5) * (1.0 / N) * 0.4;
      tmp.push(Math.min(0.98, Math.max(0.02, base + jitter)));
    }
    tmp.sort((a, b) => a - b);
    for (let i = 0; i < N; i++) centers[i] = tmp[i];

    for (let i = 0; i < N; i++) {
      const thetaBase = 0.25 + 1.5 * intensity;
      const thetaRand = (rand() * 0.6 - 0.3) * thetaBase; // ±30%
      const sgn = rand() > 0.5 ? 1.0 : -1.0;
      sign[i] = sgn;
      theta[i] = sgn * Math.max(0.05, thetaBase + thetaRand);
      phase[i] = rand() * Math.PI * 2.0;
    }

    return { N, centers, theta, sign, phase };
  }, [bends, intensity, seed]);

  // static geometry
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(width, height, segW, segH),
    [width, height, segW, segH]
  );

  // material + shader (set onBeforeCompile ONCE)
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      side: THREE.DoubleSide,
      transparent: true,
      opacity,
      roughness: 0.9,
      metalness: 0.0,
    });

    m.onBeforeCompile = (shader) => {
      shader.defines = shader.defines || {};
      shader.defines.MAX_BENDS = String(MAX_BENDS);

      // shared uniforms
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWidth = { value: width };
      shader.uniforms.uBendCount = { value: bendParams.N };

      shader.uniforms.uGI = { value: giBias };
      shader.uniforms.uSBase = { value: smoothnessBase };
      shader.uniforms.uSK = { value: smoothnessK };
      shader.uniforms.uGIFreq1 = { value: giFreq };
      shader.uniforms.uGIFreq2 = { value: giFreq2 };
      shader.uniforms.uGIAmp = { value: giAmp };

      shader.uniforms.uDriftSpeed = { value: driftSpeed };
      shader.uniforms.uDriftJitter = { value: driftJitter };
      shader.uniforms.uDriftFreq = { value: driftFreq };

      shader.uniforms.uCenters = { value: bendParams.centers };
      shader.uniforms.uTheta = { value: bendParams.theta };
      shader.uniforms.uSign = { value: bendParams.sign };
      shader.uniforms.uPhase = { value: bendParams.phase };

      // fragment-only Perlin uniforms
      shader.uniforms.uNoiseScale = { value: noiseScale };
      shader.uniforms.uNoiseSpeed = { value: noiseSpeed };
      shader.uniforms.uStretchY = { value: stretchY };

      // ===== Vertex: keep your existing curling logic intact =====
      shader.vertexShader =
        `
        uniform float uTime;
        uniform float uWidth;
        uniform int   uBendCount;

        uniform float uGI; // bias
        uniform float uSBase;
        uniform float uSK;
        uniform float uGIFreq1, uGIFreq2, uGIAmp;

        uniform float uDriftSpeed, uDriftJitter, uDriftFreq;

        uniform float uCenters[MAX_BENDS];
        uniform float uTheta[MAX_BENDS];
        uniform float uSign[MAX_BENDS];
        uniform float uPhase[MAX_BENDS];

        float smootherstep(float e0, float e1, float x){
          float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
          return t*t*t*(t*(t*6.0 - 15.0) + 10.0);
        }
        void arcMap(in float s, in float R, out float xOut, out float zOut){
          float a = s / R;
          xOut = R * sin(a);
          zOut = R * (1.0 - cos(a));
        }
        ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>

        float u = (transformed.x + uWidth * 0.5) / uWidth;

        // global breathing
        float gi = uGI + uGIAmp * (
          0.62 * cos(uGIFreq1 * uTime) +
          0.38 * cos(uGIFreq2 * uTime + 1.3)
        );
        gi = clamp(gi, 0.0, 5.0);

        // inverse coupling for smoothness
        float S = uSBase / (1.0 + uSK * gi);
        S = clamp(S, 0.15, 2.5);

        // mirrored global bend (left forward, right backward)
        float dir = -1.0 + 2.0 * u;
        float thetaG = gi * abs(dir);
        if(thetaG > 1e-6){
          float RG = uWidth / thetaG;
          float xOut; float zOut;
          arcMap(transformed.x, RG, xOut, zOut);
          transformed.z += zOut * sign(dir);
          transformed.x  = xOut;
        }

        // local multi-bends
        int N = uBendCount;
        float spanU = (1.0 / float(N)) * (0.8 + 0.6 * S);
        float halfWin = spanU * 0.7 + 0.2 * S;

        for(int i=0;i<MAX_BENDS;i++){
          if(i>=N) break;

          float u0 = uCenters[i];
          u0 += uDriftSpeed * uTime;
          u0 += uDriftJitter * 0.5 * cos(uDriftFreq * uTime + uPhase[i]);
          u0 = fract(u0);

          float du = abs(u - u0);
          if(du > halfWin) continue;

          float t = 1.0 - du / halfWin;
          float w = smootherstep(0.0, 1.0, t);

          float th = uTheta[i];
          float span = spanU * uWidth;
          float R = abs(span / th);

          // align center to same global map for sLocal
          float xCenterStraight = (u0 - 0.5) * uWidth;
          float dirC = -1.0 + 2.0 * u0;
          float thetaC = gi * abs(dirC);
          float xCenterG = xCenterStraight;
          if(thetaC > 1e-6){
            float RGc = uWidth / thetaC;
            float xTmp; float zTmp;
            arcMap(xCenterStraight, RGc, xTmp, zTmp);
            xCenterG = xTmp;
          }

          float sLocal = transformed.x - xCenterG;

          float xA; float zA;
          arcMap(sLocal, R, xA, zA);

          transformed.x += (xA - sLocal) * w;
          transformed.z += (zA * uSign[i]) * w;
        }
        `
      );

      // ===== Fragment: Perlin noise (animated), grayscale output =====
      // Add Perlin helpers
      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uNoiseScale;
        uniform float uNoiseSpeed;
        uniform float uStretchY;

        // --- 2D/3D Perlin noise (compact GLSL) ---
        vec3 fade(vec3 t){ return t*t*t*(t*(t*6.0-15.0)+10.0); }
        float rand3(vec3 p){
          // hash to 0..1
          return fract(sin(dot(p, vec3(127.1,311.7, 74.7)))*43758.5453123);
        }
        vec3 grad3(vec3 p){
          // pseudo-gradient from hash
          float r = rand3(p)*6.28318530718; // 2π
          return vec3(cos(r), sin(r), cos(r*0.7)); // not unit, but fine
        }
        float perlin3(vec3 P){
          vec3 Pi = floor(P);
          vec3 Pf = P - Pi;
          vec3 w = fade(Pf);

          float n000 = dot(grad3(Pi + vec3(0.0,0.0,0.0)), Pf - vec3(0.0,0.0,0.0));
          float n100 = dot(grad3(Pi + vec3(1.0,0.0,0.0)), Pf - vec3(1.0,0.0,0.0));
          float n010 = dot(grad3(Pi + vec3(0.0,1.0,0.0)), Pf - vec3(0.0,1.0,0.0));
          float n110 = dot(grad3(Pi + vec3(1.0,1.0,0.0)), Pf - vec3(1.0,1.0,0.0));
          float n001 = dot(grad3(Pi + vec3(0.0,0.0,1.0)), Pf - vec3(0.0,0.0,1.0));
          float n101 = dot(grad3(Pi + vec3(1.0,0.0,1.0)), Pf - vec3(1.0,0.0,1.0));
          float n011 = dot(grad3(Pi + vec3(0.0,1.0,1.0)), Pf - vec3(0.0,1.0,1.0));
          float n111 = dot(grad3(Pi + vec3(1.0,1.0,1.0)), Pf - vec3(1.0,1.0,1.0));

          float nx00 = mix(n000, n100, w.x);
          float nx10 = mix(n010, n110, w.x);
          float nx01 = mix(n001, n101, w.x);
          float nx11 = mix(n011, n111, w.x);

          float nxy0 = mix(nx00, nx10, w.y);
          float nxy1 = mix(nx01, nx11, w.y);

          float nxyz = mix(nxy0, nxy1, w.z);
          return nxyz; // ~[-1,1]
        }
        ` + shader.fragmentShader;

      // Replace the base diffuse color with our grayscale from Perlin
      shader.fragmentShader = shader.fragmentShader.replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `
        // Compute vertically stretched Perlin noise in fragment
        vec2 uvN = vUv;
        // stretch along Y: smaller factor = elongated vertical features
        uvN = vec2(uvN.x, uvN.y * uStretchY);

        // animate over time (z uses time for evolving noise; also slide in x)
        vec3 p = vec3(uvN * uNoiseScale + vec2(uTime * uNoiseSpeed, 0.0), uTime * 0.2);

        float n = perlin3(p);        // [-1,1]
        float g = 0.5 + 0.5 * n;     // [0,1] grayscale

        vec4 diffuseColor = vec4(vec3(g), opacity);
        `
      );

      // keep ref for animation
      m.userData.shader = shader;
    };

    return m;
  }, [
    width,
    opacity,
    bendParams,
    giBias,
    giAmp,
    giFreq,
    giFreq2,
    smoothnessBase,
    smoothnessK,
    driftSpeed,
    driftJitter,
    driftFreq,
    noiseScale,
    noiseSpeed,
    stretchY,
  ]);

  // animate time uniform (no recursive onBeforeCompile!)
  useFrame((_, dt) => {
    const mat = meshRef.current?.material;
    const shader = mat?.userData?.shader;
    if (shader) shader.uniforms.uTime.value += dt;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={position}
      rotation={[0, 0, 0]}
      castShadow={false}
      receiveShadow={false}
    />
  );
});

export default Aurora;
