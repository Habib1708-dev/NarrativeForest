import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { folder, useControls } from "leva";
import {
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
} from "three";

const VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D uTexture;
  uniform vec3 uPlaneColor;
  uniform vec3 uMotherboardColor;
  uniform vec2 uPatternScale;
  uniform vec2 uPatternOffset;

  varying vec2 vUv;

  void main() {
    vec2 sampleUv = ((vUv - 0.5) - uPatternOffset) / uPatternScale + 0.5;
    bool outsideTexture =
      sampleUv.x < 0.0 ||
      sampleUv.x > 1.0 ||
      sampleUv.y < 0.0 ||
      sampleUv.y > 1.0;

    vec3 finalColor = uPlaneColor;

    if (!outsideTexture) {
      vec3 textureColor = texture2D(uTexture, sampleUv).rgb;
      float luminance = dot(textureColor, vec3(0.299, 0.587, 0.114));
      float blend = smoothstep(0.08, 0.92, luminance);
      finalColor = mix(uMotherboardColor, uPlaneColor, blend);
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const degToRad = (value) => (value * Math.PI) / 180;

export default function Motherboard({
  texturePath = "/textures/motherboard/Motherboard.png",
  defaultPlaneSize = [9, 9],
  defaultMotherboardScale = [0.9, 0.9],
  defaultMotherboardOffset = [-0.05, -0.03],
  defaultPlaneColor = "#0f1014",
  defaultMotherboardColor = "#f2f5f7",
  defaultPosition = [0, -5.5, 0],
  defaultRotation = [-90, 0, 0],
}) {
  const motherboardTexture = useTexture(texturePath);

  useEffect(() => {
    motherboardTexture.colorSpace = SRGBColorSpace;
    motherboardTexture.wrapS = ClampToEdgeWrapping;
    motherboardTexture.wrapT = ClampToEdgeWrapping;
    motherboardTexture.needsUpdate = true;
  }, [motherboardTexture]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uTexture: { value: motherboardTexture },
          uPlaneColor: { value: new Color(defaultPlaneColor) },
          uMotherboardColor: { value: new Color(defaultMotherboardColor) },
          uPatternScale: {
            value: new Vector2(
              defaultMotherboardScale[0],
              defaultMotherboardScale[1]
            ),
          },
          uPatternOffset: {
            value: new Vector2(
              defaultMotherboardOffset[0],
              defaultMotherboardOffset[1]
            ),
          },
        },
        side: DoubleSide,
      }),
    [
      defaultMotherboardColor,
      defaultMotherboardOffset,
      defaultMotherboardScale,
      defaultPlaneColor,
      motherboardTexture,
    ]
  );

  useEffect(() => {
    material.uniforms.uTexture.value = motherboardTexture;
  }, [material, motherboardTexture]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  const controls = useControls(
    "About/Motherboard",
    {
      Plane: folder(
        {
          planeWidth: {
            value: defaultPlaneSize[0],
            min: 0.5,
            max: 20,
            step: 0.1,
          },
          planeHeight: {
            value: defaultPlaneSize[1],
            min: 0.5,
            max: 20,
            step: 0.1,
          },
          planeColor: { value: defaultPlaneColor },
        },
        { collapsed: false }
      ),
      Pattern: folder(
        {
          motherboardScaleX: {
            value: defaultMotherboardScale[0],
            min: 0.1,
            max: 2,
            step: 0.01,
            label: "Size X",
          },
          motherboardScaleY: {
            value: defaultMotherboardScale[1],
            min: 0.1,
            max: 2,
            step: 0.01,
            label: "Size Y",
          },
          motherboardOffsetX: {
            value: defaultMotherboardOffset[0],
            min: -0.75,
            max: 0.75,
            step: 0.01,
            label: "Offset X",
          },
          motherboardOffsetY: {
            value: defaultMotherboardOffset[1],
            min: -0.75,
            max: 0.75,
            step: 0.01,
            label: "Offset Y",
          },
          motherboardColor: { value: defaultMotherboardColor },
        },
        { collapsed: false }
      ),
      Transform: folder(
        {
          positionX: {
            value: defaultPosition[0],
            min: -20,
            max: 20,
            step: 0.1,
          },
          positionY: {
            value: defaultPosition[1],
            min: -20,
            max: 20,
            step: 0.1,
          },
          positionZ: {
            value: defaultPosition[2],
            min: -20,
            max: 20,
            step: 0.1,
          },
          rotationX: {
            value: defaultRotation[0],
            min: -180,
            max: 180,
            step: 1,
          },
          rotationY: {
            value: defaultRotation[1],
            min: -180,
            max: 180,
            step: 1,
          },
          rotationZ: {
            value: defaultRotation[2],
            min: -180,
            max: 180,
            step: 1,
          },
        },
        { collapsed: false }
      ),
    },
    { collapsed: false }
  );

  useEffect(() => {
    material.uniforms.uPlaneColor.value.set(controls.planeColor);
    material.uniforms.uMotherboardColor.value.set(controls.motherboardColor);
    material.uniforms.uPatternScale.value.set(
      Math.max(controls.motherboardScaleX, 0.001),
      Math.max(controls.motherboardScaleY, 0.001)
    );
    material.uniforms.uPatternOffset.value.set(
      controls.motherboardOffsetX,
      controls.motherboardOffsetY
    );
  }, [
    controls.motherboardColor,
    controls.motherboardOffsetX,
    controls.motherboardOffsetY,
    controls.motherboardScaleX,
    controls.motherboardScaleY,
    controls.planeColor,
    material,
  ]);

  return (
    <mesh
      position={[controls.positionX, controls.positionY, controls.positionZ]}
      rotation={[
        degToRad(controls.rotationX),
        degToRad(controls.rotationY),
        degToRad(controls.rotationZ),
      ]}
      material={material}
    >
      <planeGeometry args={[controls.planeWidth, controls.planeHeight]} />
    </mesh>
  );
}
