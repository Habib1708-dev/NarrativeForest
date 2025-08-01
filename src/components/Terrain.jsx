import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { useControls } from "leva";

export default function Terrain() {
  const materialRef = useRef();
  const clockRef = useRef(new THREE.Clock());
  // Use this to force material recreation
  const [materialKey, setMaterialKey] = useState(0);

  // Leva controls
  const terrainParams = useControls("Terrain", {
    elevation: { value: 50, min: 0, max: 150, step: 1, label: "Elevation" },
    frequency: {
      value: 0.005,
      min: 0.001,
      max: 0.05,
      step: 0.001,
      label: "Feature Size",
    },
    octaves: { value: 5, min: 1, max: 8, step: 1, label: "Detail Layers" },
    seed: { value: 1.0, min: 0.1, max: 10.0, step: 0.1, label: "Seed" },
    scale: { value: 1.0, min: 0.1, max: 5.0, step: 0.1, label: "Zoom" },
    color: { value: "#4b7d23", label: "Terrain Color" },
    plateauHeight: {
      value: 0.3,
      min: 0,
      max: 1.0,
      step: 0.01,
      label: "Plateau Height",
    },
    plateauSmoothing: {
      value: 0.2,
      min: 0,
      max: 1.0,
      step: 0.01,
      label: "Plateau Smoothness",
    },
  });

  // Force material recreation for structural changes that require recompilation
  useEffect(() => {
    setMaterialKey((prev) => prev + 1);
  }, [terrainParams.octaves]);

  // Ensure uniform updates for parameters that don't need full recompilation
  useEffect(() => {
    if (!materialRef.current) return;

    // Update material color directly
    materialRef.current.color.set(terrainParams.color);

    const shader = materialRef.current.userData.shader;
    if (shader) {
      shader.uniforms.elevation.value = terrainParams.elevation;
      shader.uniforms.noiseFrequency.value = terrainParams.frequency;
      shader.uniforms.noiseSeed.value = terrainParams.seed;
      shader.uniforms.noiseScale.value = terrainParams.scale;
      shader.uniforms.plateauHeight.value = terrainParams.plateauHeight;
      shader.uniforms.plateauSmoothing.value = terrainParams.plateauSmoothing;
    }

    // Force the material to update
    materialRef.current.needsUpdate = true;
  }, [
    terrainParams.elevation,
    terrainParams.frequency,
    terrainParams.seed,
    terrainParams.scale,
    terrainParams.color,
    terrainParams.plateauHeight,
    terrainParams.plateauSmoothing,
  ]);

  useEffect(() => {
    if (!materialRef.current) return;

    // Hook into shader
    materialRef.current.onBeforeCompile = (shader) => {
      // Inject uniforms
      shader.uniforms.time = { value: 0 };
      shader.uniforms.elevation = { value: terrainParams.elevation };
      shader.uniforms.noiseFrequency = { value: terrainParams.frequency };
      shader.uniforms.noiseSeed = { value: terrainParams.seed };
      shader.uniforms.noiseScale = { value: terrainParams.scale };
      shader.uniforms.noiseOctaves = { value: terrainParams.octaves };
      // Inside onBeforeCompile function
      shader.uniforms.plateauHeight = { value: terrainParams.plateauHeight };
      shader.uniforms.plateauSmoothing = {
        value: terrainParams.plateauSmoothing,
      };

      // Store the compiled shader for updates
      materialRef.current.userData.shader = shader;

      // Inject noise + terrain displacement
      shader.vertexShader = `
        uniform float elevation;
        uniform float noiseFrequency;
        uniform float noiseSeed;
        uniform float noiseScale;
        uniform int noiseOctaves;
        uniform float plateauHeight;
        uniform float plateauSmoothing;


        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                   -0.577350269189626, 0.024390243902439);

          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v -   i + dot(i, C.xx);

          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;

          i = mod(i, 289.0);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
            + i.x + vec3(0.0, i1.x, 1.0 ));

          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
            dot(x12.zw,x12.zw)), 0.0);
          m = m*m; m = m*m;

          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;

          m *= 1.79284291400159 - 0.85373472095314 * (a0*a0+h*h);

          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = noiseFrequency;
          for (int i = 0; i < 8; i++) {
            if (i >= noiseOctaves) break;
            value += amplitude * snoise((p + noiseSeed * 100.0) * frequency * noiseScale);
            frequency *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }

        // Smoothstep function to create plateaus
  float plateauize(float height, float threshold, float smoothing) {
    float lowThreshold = max(0.0, threshold - smoothing);
    float highThreshold = min(1.0, threshold + smoothing);
    
    // Remap height from [0,1] for smoothstep
    float normalizedHeight = (height - lowThreshold) / (highThreshold - lowThreshold);
    float stepped = smoothstep(0.0, 1.0, normalizedHeight);
    
    // Blend between original and plateaued height based on how close to threshold
    if (height < lowThreshold) return height;
    if (height > highThreshold) return height;
    return mix(lowThreshold, height, stepped);
  }

        ${shader.vertexShader}
      `;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
  #include <begin_vertex>
  // Get raw noise displacement
  float displacement = fbm(position.xy) * elevation;
  
  // Normalize displacement to 0-1 range for plateauizing
  float normalizedDisp = (displacement / elevation);
  
  // Apply plateau effect - only flatten areas below the threshold
  float plateauizedDisp = plateauize(normalizedDisp, plateauHeight, plateauSmoothing) * elevation;
  
  // Apply final displacement
  plateauizedDisp = abs(plateauizedDisp) + 5.0;
  transformed.z += plateauizedDisp;

  #ifdef USE_NORMAL
    float dx = 0.1;
    // Recalculate normals using the plateauized displacement
    vec2 posX = position.xy + vec2(dx, 0.0);
    vec2 negX = position.xy + vec2(-dx, 0.0);
    vec2 posY = position.xy + vec2(0.0, dx);
    vec2 negY = position.xy + vec2(0.0, -dx);
    
    float dispPosX = fbm(posX) * elevation;
    float normPosX = (dispPosX / elevation);
    float plateauPosX = plateauize(normPosX, plateauHeight, plateauSmoothing) * elevation;
    plateauPosX = abs(plateauPosX) + 5.0;
    
    float dispNegX = fbm(negX) * elevation;
    float normNegX = (dispNegX / elevation);
    float plateauNegX = plateauize(normNegX, plateauHeight, plateauSmoothing) * elevation;
    plateauNegX = abs(plateauNegX) + 5.0;
    
    float dispPosY = fbm(posY) * elevation;
    float normPosY = (dispPosY / elevation);
    float plateauPosY = plateauize(normPosY, plateauHeight, plateauSmoothing) * elevation;
    plateauPosY = abs(plateauPosY) + 5.0;
    
    float dispNegY = fbm(negY) * elevation;
    float normNegY = (dispNegY / elevation);
    float plateauNegY = plateauize(normNegY, plateauHeight, plateauSmoothing) * elevation;
    plateauNegY = abs(plateauNegY) + 5.0;

    vec3 newNormal = normalize(vec3(
      plateauNegX - plateauPosX,
      plateauNegY - plateauPosY,
      2.0 * dx
    ));
    objectNormal = newNormal;
  #endif
  `
      );
    };

    // Set up onBeforeRender to update uniforms continuously during rendering
    materialRef.current.onBeforeRender = (
      renderer,
      scene,
      camera,
      geometry,
      material
    ) => {
      const shader = material.userData.shader;
      if (shader) {
        shader.uniforms.time.value = clockRef.current.getElapsedTime();
        shader.uniforms.elevation.value = terrainParams.elevation;
        shader.uniforms.noiseFrequency.value = terrainParams.frequency;
        shader.uniforms.noiseSeed.value = terrainParams.seed;
        shader.uniforms.noiseScale.value = terrainParams.scale;
        shader.uniforms.noiseOctaves.value = terrainParams.octaves;
        shader.uniforms.plateauHeight.value = terrainParams.plateauHeight;
        shader.uniforms.plateauSmoothing.value = terrainParams.plateauSmoothing;
      }
    };

    // Ensure material updates
    materialRef.current.needsUpdate = true;
  }, [materialKey]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -10, 0]}>
      <planeGeometry args={[300, 300, 1024, 1024]} />
      <meshStandardMaterial
        key={materialKey}
        ref={materialRef}
        color={terrainParams.color}
        wireframe={false}
        flatShading={true}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
