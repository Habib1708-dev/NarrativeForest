import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { folder, useControls } from "leva";
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  ShaderMaterial,
  Uniform,
} from "three";
import vertexShader from "../../shaders/northernLights2/vertex.glsl";
import fragmentShader from "../../shaders/northernLights2/fragment.glsl";

const RADIAL_SEGMENTS = 128;
const HEIGHT_SEGMENTS = 96;
const DEFAULTS = {
  colorBottom: "#428fb1",
  colorTop: "#875dfc",
  intensity: 4.0,
  speed: 0.31,
  density: 1.0,
  displacementStrength: 0.0,
  noiseScaleX: 30.0,
  noiseScaleY: 0.1,
  gapFill: 0.2,
  auroraHeight: 0.1,
  ringRadius: 0.41,
  curtainSpan: 0.26,
  polarOffset: 0.65,
  baseInset: 0.18,
  topOutset: 0.17,
  baseDistortionStrength: 0.02,
  baseDistortionScale: 20.0,
  baseDistortionSpeed: 0.7,
  streakLow: 0.0,
  streakHigh: 0.92,
  bandStrength: 0.79,
  bottomFadeStart: 0.0,
  bottomFadeEnd: 0.18,
  topFadeStart: 0.95,
  topFadeEnd: 1.0,
  radialBlend: 0.46,
  fresnelStrength: 0.0,
};

export default function NorthernLights2() {
  const controls = useControls(
    "Northern Lights 2",
    {
      Colors: folder(
        {
          colorBottom: { value: DEFAULTS.colorBottom, label: "Bottom" },
          colorTop: { value: DEFAULTS.colorTop, label: "Top" },
        },
        { collapsed: true }
      ),
      Effect: folder(
        {
          intensity: { value: DEFAULTS.intensity, min: 0, max: 4, step: 0.01 },
          speed: { value: DEFAULTS.speed, min: 0, max: 1, step: 0.01 },
          density: {
            value: DEFAULTS.density,
            min: 0,
            max: 2,
            step: 0.01,
            label: "Density",
          },
          displacementStrength: {
            value: DEFAULTS.displacementStrength,
            min: 0,
            max: 0.6,
            step: 0.01,
          },
          noiseScaleX: { value: DEFAULTS.noiseScaleX, min: 1, max: 30, step: 0.1 },
          noiseScaleY: { value: DEFAULTS.noiseScaleY, min: 0, max: 6, step: 0.05 },
          gapFill: {
            value: DEFAULTS.gapFill,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Gap fill",
          },
        },
        { collapsed: true }
      ),
      Vertex: folder(
        {
          auroraHeight: { value: DEFAULTS.auroraHeight, min: 0.08, max: 0.6, step: 0.01 },
          ringRadius: { value: DEFAULTS.ringRadius, min: 0.15, max: 0.65, step: 0.01 },
          curtainSpan: { value: DEFAULTS.curtainSpan, min: 0.2, max: 0.9, step: 0.01 },
          polarOffset: { value: DEFAULTS.polarOffset, min: 0.65, max: 1.15, step: 0.01 },
          baseInset: { value: DEFAULTS.baseInset, min: 0, max: 0.45, step: 0.01 },
          topOutset: { value: DEFAULTS.topOutset, min: 0, max: 0.45, step: 0.01 },
          baseDistortionStrength: {
            value: DEFAULTS.baseDistortionStrength,
            min: 0,
            max: 0.3,
            step: 0.01,
          },
          baseDistortionScale: {
            value: DEFAULTS.baseDistortionScale,
            min: 1,
            max: 20,
            step: 0.1,
          },
          baseDistortionSpeed: {
            value: DEFAULTS.baseDistortionSpeed,
            min: 0,
            max: 2,
            step: 0.01,
          },
        },
        { collapsed: true }
      ),
      Fragment: folder(
        {
          streakLow: { value: DEFAULTS.streakLow, min: 0, max: 1, step: 0.01 },
          streakHigh: { value: DEFAULTS.streakHigh, min: 0, max: 1, step: 0.01 },
          bandStrength: { value: DEFAULTS.bandStrength, min: 0, max: 2, step: 0.01 },
          bottomFadeStart: {
            value: DEFAULTS.bottomFadeStart,
            min: 0,
            max: 0.5,
            step: 0.01,
            label: "Bottom fade start",
          },
          bottomFadeEnd: {
            value: DEFAULTS.bottomFadeEnd,
            min: 0.02,
            max: 0.6,
            step: 0.01,
            label: "Bottom fade end",
          },
          topFadeStart: {
            value: DEFAULTS.topFadeStart,
            min: 0.3,
            max: 0.98,
            step: 0.01,
            label: "Top fade start",
          },
          topFadeEnd: {
            value: DEFAULTS.topFadeEnd,
            min: 0.5,
            max: 1,
            step: 0.01,
            label: "Top fade end",
          },
          radialBlend: { value: DEFAULTS.radialBlend, min: 0, max: 1, step: 0.01 },
          fresnelStrength: { value: DEFAULTS.fresnelStrength, min: 0, max: 1.5, step: 0.01 },
        },
        { collapsed: true }
      ),
    },
    { collapsed: true }
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }

      const changedControls = Object.fromEntries(
        Object.entries(DEFAULTS).flatMap(([key, defaultValue]) => {
          const currentValue = controls[key];
          const changed =
            typeof defaultValue === "number"
              ? Math.abs(currentValue - defaultValue) > 1e-6
              : currentValue !== defaultValue;

          return changed ? [[key, currentValue]] : [];
        })
      );

      console.log("Northern Lights 2 changed controls:", changedControls);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [controls]);

  const geometry = useMemo(() => {
    const geo = new CylinderGeometry(
      controls.ringRadius,
      controls.ringRadius,
      controls.curtainSpan,
      RADIAL_SEGMENTS,
      HEIGHT_SEGMENTS,
      true
    );
    geo.translate(0, controls.polarOffset, 0);
    return geo;
  }, [controls.curtainSpan, controls.polarOffset, controls.ringRadius]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        uniforms: {
          uTime: new Uniform(0),
          uSpeed: new Uniform(controls.speed),
          uIntensity: new Uniform(controls.intensity),
          uDensity: new Uniform(controls.density),
          uSphereRadius: new Uniform(1.0),
          uAuroraHeight: new Uniform(controls.auroraHeight),
          uDisplacementStrength: new Uniform(controls.displacementStrength),
          uNoiseScaleX: new Uniform(controls.noiseScaleX),
          uNoiseScaleY: new Uniform(controls.noiseScaleY),
          uBaseInset: new Uniform(controls.baseInset),
          uTopOutset: new Uniform(controls.topOutset),
          uBaseDistortionStrength: new Uniform(
            controls.baseDistortionStrength
          ),
          uBaseDistortionScale: new Uniform(controls.baseDistortionScale),
          uBaseDistortionSpeed: new Uniform(controls.baseDistortionSpeed),
          uStreakLow: new Uniform(controls.streakLow),
          uStreakHigh: new Uniform(controls.streakHigh),
          uBandStrength: new Uniform(controls.bandStrength),
          uBottomFadeStart: new Uniform(controls.bottomFadeStart),
          uBottomFadeEnd: new Uniform(controls.bottomFadeEnd),
          uTopFadeStart: new Uniform(controls.topFadeStart),
          uTopFadeEnd: new Uniform(controls.topFadeEnd),
          uGapFill: new Uniform(controls.gapFill),
          uRadialBlend: new Uniform(controls.radialBlend),
          uFresnelStrength: new Uniform(controls.fresnelStrength),
          uColorBottom: new Uniform(new Color(controls.colorBottom)),
          uColorTop: new Uniform(new Color(controls.colorTop)),
        },
      }),
    []
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
    material.uniforms.uSpeed.value = controls.speed;
    material.uniforms.uIntensity.value = controls.intensity;
    material.uniforms.uDensity.value = controls.density;
    material.uniforms.uAuroraHeight.value = controls.auroraHeight;
    material.uniforms.uDisplacementStrength.value =
      controls.displacementStrength;
    material.uniforms.uNoiseScaleX.value = controls.noiseScaleX;
    material.uniforms.uNoiseScaleY.value = controls.noiseScaleY;
    material.uniforms.uBaseInset.value = controls.baseInset;
    material.uniforms.uTopOutset.value = controls.topOutset;
    material.uniforms.uBaseDistortionStrength.value =
      controls.baseDistortionStrength;
    material.uniforms.uBaseDistortionScale.value = controls.baseDistortionScale;
    material.uniforms.uBaseDistortionSpeed.value = controls.baseDistortionSpeed;
    material.uniforms.uStreakLow.value = controls.streakLow;
    material.uniforms.uStreakHigh.value = controls.streakHigh;
    material.uniforms.uBandStrength.value = controls.bandStrength;
    material.uniforms.uBottomFadeStart.value = controls.bottomFadeStart;
    material.uniforms.uBottomFadeEnd.value = controls.bottomFadeEnd;
    material.uniforms.uTopFadeStart.value = controls.topFadeStart;
    material.uniforms.uTopFadeEnd.value = controls.topFadeEnd;
    material.uniforms.uGapFill.value = controls.gapFill;
    material.uniforms.uRadialBlend.value = controls.radialBlend;
    material.uniforms.uFresnelStrength.value = controls.fresnelStrength;
    material.uniforms.uColorBottom.value.set(controls.colorBottom);
    material.uniforms.uColorTop.value.set(controls.colorTop);
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      scale={2}
      frustumCulled={false}
      renderOrder={1}
    />
  );
}
