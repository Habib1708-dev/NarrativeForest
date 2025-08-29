// src/components/Lake.jsx
import React, {
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls, folder } from "leva";
import * as THREE from "three";
import lakeVertexShader from "../shaders/lake/vertex.glsl?raw";
import lakeFragmentShader from "../shaders/lake/fragment.glsl?raw";

export default forwardRef(function Lake(props, ref) {
  const meshRef = useRef();
  const { scene, camera, gl } = useThree();

  // Trail system state
  const maxTrailPoints = 50;
  const [trailPoints, setTrailPoints] = useState([]);
  const trailDecayTime = useRef(2.0);
  const trailSpreadSpeed = useRef(0.3);
  const lastCleanupTime = useRef(0);
  const cleanupInterval = 0.1;

  // Mouse interaction
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const lastTrailTime = useRef(0);
  const trailSpacing = 0.016; // Small spacing for smooth trail

  useImperativeHandle(ref, () => meshRef.current, []);

  // Controls - original water properties + simple biobluemessence trail
  const {
    opacity,
    wavesAmplitude,
    wavesFrequency,
    wavesPersistence,
    wavesLacunarity,
    wavesIterations,
    wavesSpeed,
    troughColor,
    surfaceColor,
    peakColor,
    peakThreshold,
    peakTransition,
    troughThreshold,
    troughTransition,
    fresnelScale,
    fresnelPower,
    resolution,
    // Simple biobluemessence trail controls
    bioBlueColor,
    bioBlueIntensity,
    trailDecayTimeControl,
    trailSpreadSpeedControl,
    trailMaxRadius,
  } = useControls({
    Lake: folder({
      "Wave Properties": folder({
        wavesAmplitude: { value: 0.025, min: 0, max: 0.1, step: 0.001 },
        wavesFrequency: { value: 1.07, min: 0.1, max: 3, step: 0.01 },
        wavesPersistence: { value: 0.3, min: 0, max: 1, step: 0.01 },
        wavesLacunarity: { value: 2.18, min: 1, max: 4, step: 0.01 },
        wavesIterations: { value: 8, min: 1, max: 12, step: 1 },
        wavesSpeed: { value: 0.4, min: 0, max: 2, step: 0.01 },
      }),
      Colors: folder({
        troughColor: { value: "#186691" },
        surfaceColor: { value: "#9bd8c0" },
        peakColor: { value: "#bbd8e0" },
      }),
      Thresholds: folder({
        peakThreshold: { value: 0.08, min: -0.1, max: 0.2, step: 0.001 },
        peakTransition: { value: 0.05, min: 0.001, max: 0.1, step: 0.001 },
        troughThreshold: { value: -0.01, min: -0.1, max: 0.1, step: 0.001 },
        troughTransition: { value: 0.15, min: 0.001, max: 0.3, step: 0.001 },
      }),
      Material: folder({
        opacity: { value: 0.8, min: 0, max: 1, step: 0.01 },
        fresnelScale: { value: 0.8, min: 0, max: 2, step: 0.01 },
        fresnelPower: { value: 0.5, min: 0.1, max: 2, step: 0.01 },
      }),
      Geometry: folder({
        resolution: { value: 52, min: 64, max: 1024, step: 64 },
      }),
      "Biobluemessence Trail": folder({
        bioBlueColor: { value: "#00FFFF", label: "Trail Color" },
        bioBlueIntensity: {
          value: 0.5,
          min: 0,
          max: 2,
          step: 0.1,
          label: "Intensity",
        },
        trailDecayTimeControl: {
          value: 2.0,
          min: 0.5,
          max: 5,
          step: 0.1,
          label: "Decay Time",
        },
        trailSpreadSpeedControl: {
          value: 0.3,
          min: 0.1,
          max: 1,
          step: 0.05,
          label: "Spread Speed",
        },
        trailMaxRadius: {
          value: 0.3,
          min: 0.1,
          max: 1,
          step: 0.05,
          label: "Max Radius",
        },
      }),
    }),
  });

  // Update refs when controls change
  useEffect(() => {
    trailDecayTime.current = trailDecayTimeControl;
    trailSpreadSpeed.current = trailSpreadSpeedControl;
  }, [trailDecayTimeControl, trailSpreadSpeedControl]);

  // Mouse interaction - only on mouse move (not clicks)
  const onMouseMove = useCallback(
    (event) => {
      if (!camera || !gl) return;

      const rect = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      checkWaterIntersection();
    },
    [camera, gl]
  );

  const checkWaterIntersection = useCallback(() => {
    if (!meshRef.current || !camera) return;

    const currentTime = performance.now() / 1000;

    // Throttle trail creation for smooth trails
    if (currentTime - lastTrailTime.current < trailSpacing) {
      return;
    }

    raycaster.current.setFromCamera(mouse.current, camera);
    const intersects = raycaster.current.intersectObject(
      meshRef.current,
      false
    );

    if (intersects.length > 0) {
      const point = intersects[0].point;
      addTrailPoint(point.x, point.z, currentTime);
      lastTrailTime.current = currentTime;
    }
  }, [camera]);

  const addTrailPoint = useCallback((x, z, timestamp) => {
    setTrailPoints((prev) => {
      const newPoints = [...prev];

      // Remove oldest point if we're at capacity
      if (newPoints.length >= maxTrailPoints) {
        newPoints.shift();
      }

      newPoints.push({
        x,
        z,
        timestamp,
        intensity: 1.0,
        initialRadius: 0.05, // Small initial radius for subtle effect
      });

      return newPoints;
    });
  }, []);

  const cleanupExpiredTrails = useCallback((currentTime) => {
    setTrailPoints((prev) =>
      prev.filter((trail) => {
        const age = currentTime - trail.timestamp;
        return age < trailDecayTime.current;
      })
    );
  }, []);

  // Setup mouse event listeners
  useEffect(() => {
    if (!gl) return;

    const canvas = gl.domElement;
    canvas.addEventListener("mousemove", onMouseMove);

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
    };
  }, [gl, onMouseMove]);

  // Create a simple environment map for reflections
  const environmentMap = useMemo(() => {
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
      format: THREE.RGBFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });

    const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
    cubeCamera.position.set(0, 0, 0);

    return cubeRenderTarget.texture;
  }, []);

  // Shader material with uniforms for both vertex and fragment shaders
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lakeVertexShader,
      fragmentShader: lakeFragmentShader,
      uniforms: {
        // Original water uniforms (used by vertex shader)
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uEnvironmentMap: { value: environmentMap },
        uWavesAmplitude: { value: wavesAmplitude },
        uWavesFrequency: { value: wavesFrequency },
        uWavesPersistence: { value: wavesPersistence },
        uWavesLacunarity: { value: wavesLacunarity },
        uWavesIterations: { value: wavesIterations },
        uWavesSpeed: { value: wavesSpeed },
        uTroughColor: { value: new THREE.Color(troughColor) },
        uSurfaceColor: { value: new THREE.Color(surfaceColor) },
        uPeakColor: { value: new THREE.Color(peakColor) },
        uPeakThreshold: { value: peakThreshold },
        uPeakTransition: { value: peakTransition },
        uTroughThreshold: { value: troughThreshold },
        uTroughTransition: { value: troughTransition },
        uFresnelScale: { value: fresnelScale },
        uFresnelPower: { value: fresnelPower },

        // Biobluemessence trail uniforms (used by fragment shader only)
        uTrailPositions: { value: new Float32Array(maxTrailPoints * 2) },
        uTrailData: { value: new Float32Array(maxTrailPoints * 3) },
        uTrailCount: { value: 0 },
        uTrailDecayTime: { value: trailDecayTimeControl },
        uBioBlueColor: { value: new THREE.Color(bioBlueColor) },
        uBioBlueIntensity: { value: bioBlueIntensity },
        uTrailSpreadSpeed: { value: trailSpreadSpeedControl },
        uTrailMaxRadius: { value: trailMaxRadius },
      },
      transparent: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
  }, [
    environmentMap,
    opacity,
    wavesAmplitude,
    wavesFrequency,
    wavesPersistence,
    wavesLacunarity,
    wavesIterations,
    wavesSpeed,
    troughColor,
    surfaceColor,
    peakColor,
    peakThreshold,
    peakTransition,
    troughThreshold,
    troughTransition,
    fresnelScale,
    fresnelPower,
    bioBlueColor,
    bioBlueIntensity,
    trailDecayTimeControl,
    trailSpreadSpeedControl,
    trailMaxRadius,
  ]);

  // Update trail uniforms when trail points change
  const updateTrailUniforms = useCallback(() => {
    if (!material) return;

    const positions = material.uniforms.uTrailPositions.value;
    const data = material.uniforms.uTrailData.value;
    const currentTime = performance.now() / 1000;

    for (let i = 0; i < maxTrailPoints; i++) {
      if (i < trailPoints.length) {
        const trail = trailPoints[i];
        const age = currentTime - trail.timestamp;
        const normalizedAge = age / trailDecayTime.current;

        // Position
        positions[i * 2] = trail.x;
        positions[i * 2 + 1] = trail.z;

        // Data: timestamp, intensity, radius
        data[i * 3] = trail.timestamp;
        data[i * 3 + 1] = Math.max(0, 1.0 - normalizedAge); // intensity fades over time
        data[i * 3 + 2] = trail.initialRadius + age * trailSpreadSpeed.current; // radius grows over time
      } else {
        // Clear unused slots
        positions[i * 2] = 0;
        positions[i * 2 + 1] = 0;
        data[i * 3] = 0;
        data[i * 3 + 1] = 0;
        data[i * 3 + 2] = 0;
      }
    }

    material.uniforms.uTrailCount.value = trailPoints.length;
    material.uniforms.uTrailPositions.needsUpdate = true;
    material.uniforms.uTrailData.needsUpdate = true;
  }, [material, trailPoints]);

  // Update uniforms when controls change
  useEffect(() => {
    if (!material) return;

    // Original water uniforms
    material.uniforms.uOpacity.value = opacity;
    material.uniforms.uWavesAmplitude.value = wavesAmplitude;
    material.uniforms.uWavesFrequency.value = wavesFrequency;
    material.uniforms.uWavesPersistence.value = wavesPersistence;
    material.uniforms.uWavesLacunarity.value = wavesLacunarity;
    material.uniforms.uWavesIterations.value = wavesIterations;
    material.uniforms.uWavesSpeed.value = wavesSpeed;
    material.uniforms.uTroughColor.value.setStyle(troughColor);
    material.uniforms.uSurfaceColor.value.setStyle(surfaceColor);
    material.uniforms.uPeakColor.value.setStyle(peakColor);
    material.uniforms.uPeakThreshold.value = peakThreshold;
    material.uniforms.uPeakTransition.value = peakTransition;
    material.uniforms.uTroughThreshold.value = troughThreshold;
    material.uniforms.uTroughTransition.value = troughTransition;
    material.uniforms.uFresnelScale.value = fresnelScale;
    material.uniforms.uFresnelPower.value = fresnelPower;

    // Biobluemessence trail uniforms
    material.uniforms.uTrailDecayTime.value = trailDecayTimeControl;
    material.uniforms.uBioBlueColor.value.setStyle(bioBlueColor);
    material.uniforms.uBioBlueIntensity.value = bioBlueIntensity;
    material.uniforms.uTrailSpreadSpeed.value = trailSpreadSpeedControl;
    material.uniforms.uTrailMaxRadius.value = trailMaxRadius;
  }, [material, opacity, wavesAmplitude, wavesFrequency, wavesPersistence, wavesLacunarity, wavesIterations, wavesSpeed, troughColor, surfaceColor, peakColor, peakThreshold, peakTransition, troughThreshold, troughTransition, fresnelScale, fresnelPower, bioBlueColor, bioBlueIntensity, trailDecayTimeControl, trailSpreadSpeedControl, trailMaxRadius]);

  // Geometry
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(1, 1, resolution, resolution);
  }, [resolution]);

  // Animation loop - update time uniform and manage trails
  useFrame(({ clock }) => {
    if (material) {
      material.uniforms.uTime.value = clock.getElapsedTime();

      // Cleanup expired trails periodically
      const currentTime = clock.getElapsedTime();
      if (currentTime - lastCleanupTime.current > cleanupInterval) {
        cleanupExpiredTrails(currentTime);
        lastCleanupTime.current = currentTime;
      }

      // Update trail uniforms for animation
      if (trailPoints.length > 0) {
        updateTrailUniforms();
      }
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[-2, -2, -2]}
      rotation={[Math.PI * 0.5, 0, 0]}
      {...props}
    />
  );
});
