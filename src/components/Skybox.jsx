// src/components/Skybox.jsx
import * as THREE from "three";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

export default function Skybox({
  night = 0, // 0 = day, 1 = night
  sunDir = [1, 0.3, 2],
  radius = 500,
  starDensity = 0.0025, // 0.0005..0.005
  starIntensity = 1.2,
  timeScale = 1.0,
  dayTop = "#88bfff",
  dayHorizon = "#cfe8ff",
  nightTop = "#0a0e1a",
  nightHorizon = "#0b132b",
}) {
  const matRef = useRef();

  const uniforms = useMemo(
    () => ({
      uNight: { value: night },
      uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
      uTime: { value: 0 },
      uDayTop: { value: new THREE.Color(dayTop) },
      uDayHorizon: { value: new THREE.Color(dayHorizon) },
      uNightTop: { value: new THREE.Color(nightTop) },
      uNightHorizon: { value: new THREE.Color(nightHorizon) },
      uStarDensity: { value: starDensity },
      uStarIntensity: { value: starIntensity },
    }),
    []
  );

  useFrame((_, dt) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value += dt * timeScale;
    u.uNight.value = THREE.MathUtils.clamp(night, 0, 1);
    u.uSunDir.value.set(...sunDir).normalize();
    u.uStarDensity.value = starDensity;
    u.uStarIntensity.value = starIntensity;
  });

  return (
    <mesh frustumCulled={false} renderOrder={-999}>
      <sphereGeometry args={[radius, 64, 32]} />
      <shaderMaterial
        ref={matRef}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
          varying vec3 vDir;
          void main(){
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          precision highp float;
          varying vec3 vDir;
          uniform float uNight, uTime;
          uniform vec3 uSunDir;
          uniform vec3 uDayTop, uDayHorizon;
          uniform vec3 uNightTop, uNightHorizon;
          uniform float uStarDensity, uStarIntensity;

          vec2 dirToUV(vec3 d){
            float u = atan(d.z, d.x) / (2.0*3.14159265) + 0.5;
            float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
            return vec2(u, v);
          }
          float hash(vec2 p){
            p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)));
            return fract(sin(p.x + p.y) * 43758.5453);
          }
          float stars(vec2 uv, float density, float t){
            vec2 grid = uv * vec2(2048.0, 1024.0);
            vec2 cell = floor(grid);
            float h = hash(cell);
            float isStar = step(1.0 - density, h);
            vec2 f = fract(grid) - 0.5;
            float dist = dot(f,f);
            float core = exp(-dist * 500.0);
            float twinkle = 0.85 + 0.15 * sin(t * (1.7 + h*3.1) + h*10.0);
            return isStar * core * twinkle;
          }

          void main(){
            vec3 d = normalize(vDir);

            // Elevation-based gradient factor
            float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

            // Day
            vec3 dayCol = mix(uDayHorizon, uDayTop, pow(h, 0.9));
            float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
            dayCol += pow(sunAmt, 800.0) * 4.0;   // sun core
            dayCol += pow(sunAmt, 16.0) * 0.05;   // light halo

            // Night + stars
            vec3 nightCol = mix(uNightHorizon, uNightTop, pow(h, 0.7));
            float starMask = stars(dirToUV(d), uStarDensity, uTime);
            nightCol += vec3(starMask) * uStarIntensity;

            vec3 col = mix(dayCol, nightCol, clamp(uNight, 0.0, 1.0));
            gl_FragColor = vec4(col, 1.0);
          }
        `
        }
      />
    </mesh>
  );
}
