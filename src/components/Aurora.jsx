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

      // keep shader ref for animation
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
