import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { folder, useControls } from "leva";
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  ShaderMaterial,
  Uniform,
  Vector3,
} from "three";
import vertexShader from "../../shaders/northernLights/vertex.glsl";
import fragmentShader from "../../shaders/northernLights/fragment.glsl";

const RADIAL_SEGMENTS = 128;
const HEIGHT_SEGMENTS = 96;

export default function NorthernLights({
  sunDirection = new Vector3(0, 0, 1),
  rotationSpeed = 0.1,
}) {
  const meshRef = useRef(null);

  const controls = useControls(
    "Northern Lights",
    {
      Colors: folder(
        {
          color1: { value: "#5dffb0", label: "Lower glow" },
          color2: { value: "#00f7ff", label: "Mid body" },
          color3: { value: "#7f5cff", label: "Upper veil" },
        },
        { collapsed: true }
      ),
      Effect: folder(
        {
          intensity: { value: 1.5, min: 0, max: 4, step: 0.01 },
          speed: { value: 0.22, min: 0, max: 1, step: 0.01 },
          rayDensity: { value: 42, min: 8, max: 80, step: 1 },
          raySharpness: { value: 4.0, min: 1, max: 6, step: 0.1 },
          flutterStrength: { value: 1.0, min: 0, max: 2.5, step: 0.01 },
        },
        { collapsed: true }
      ),
      Shape: folder(
        {
          auroraHeight: { value: 0.26, min: 0.08, max: 0.6, step: 0.01 },
          bandRadius: { value: 0.32, min: 0.15, max: 0.65, step: 0.01 },
          bandHeight: { value: 0.58, min: 0.2, max: 0.9, step: 0.01 },
          yOffset: { value: 0.92, min: 0.65, max: 1.15, step: 0.01 },
        },
        { collapsed: true }
      ),
    },
    { collapsed: true }
  );

  const geometry = useMemo(() => {
    const geo = new CylinderGeometry(
      controls.bandRadius,
      controls.bandRadius,
      controls.bandHeight,
      RADIAL_SEGMENTS,
      HEIGHT_SEGMENTS,
      true
    );
    geo.translate(0, controls.yOffset, 0);
    return geo;
  }, [controls.bandRadius, controls.bandHeight, controls.yOffset]);

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
          uSphereRadius: new Uniform(1.0),
          uAuroraHeight: new Uniform(controls.auroraHeight),
          uFlutterStrength: new Uniform(controls.flutterStrength),
          uColor1: new Uniform(new Color(controls.color1)),
          uColor2: new Uniform(new Color(controls.color2)),
          uColor3: new Uniform(new Color(controls.color3)),
          uIntensity: new Uniform(controls.intensity),
          uSpeed: new Uniform(controls.speed),
          uRayDensity: new Uniform(controls.rayDensity),
          uRaySharpness: new Uniform(controls.raySharpness),
          uSunDirection: new Uniform(sunDirection.clone()),
        },
      }),
    [sunDirection]
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
    material.uniforms.uSunDirection.value.copy(sunDirection);

    material.uniforms.uAuroraHeight.value = controls.auroraHeight;
    material.uniforms.uFlutterStrength.value = controls.flutterStrength;
    material.uniforms.uColor1.value.set(controls.color1);
    material.uniforms.uColor2.value.set(controls.color2);
    material.uniforms.uColor3.value.set(controls.color3);
    material.uniforms.uIntensity.value = controls.intensity;
    material.uniforms.uSpeed.value = controls.speed;
    material.uniforms.uRayDensity.value = controls.rayDensity;
    material.uniforms.uRaySharpness.value = controls.raySharpness;

    if (meshRef.current) {
      meshRef.current.rotation.y += delta * rotationSpeed;
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      scale={2}
      frustumCulled={false}
      renderOrder={1}
    />
  );
}
