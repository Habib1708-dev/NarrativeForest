import { useEffect, useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { button, folder, useControls } from "leva";
import {
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
} from "three";

const DEFAULT_SIDE_CELL_COLUMNS = 16;
const DEFAULT_SIDE_CELL_ROWS = 6;
const SIDE_BLACK_ROWS = 2;

const GRID_VERTEX = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const GRID_FRAGMENT = `
  uniform float uNumCols;
  uniform float uNumRows;
  uniform float uBlackRows;
  uniform float uMaxDarkestValue;
  uniform float uBuildOpacity;
  uniform float uChipMinY;
  uniform float uChipMaxY;
  uniform vec3 uSolidColor;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 gridUv = vUv * vec2(uNumCols, uNumRows);
    vec2 cellId = floor(gridUv);
    float isBlackBand = step(uNumRows - uBlackRows, cellId.y);

    vec3 darkEnd = mix(vec3(0.0), uSolidColor, uMaxDarkestValue);
    float brightness = hash12(cellId);
    vec3 color = mix(darkEnd, vec3(1.0), brightness);

    if (isBlackBand > 0.5) {
      color = darkEnd;
    }

    float revealY = mix(uChipMaxY, uChipMinY, uBuildOpacity);
    float vis = smoothstep(revealY - 0.015, revealY + 0.015, vWorldPosition.y);
    if (vis < 0.01) discard;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const AI_TOP_VERTEX = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const AI_TOP_FRAGMENT = `
  uniform sampler2D uAITexture;
  uniform float uLogoSize;
  uniform float uLogoRotation;
  uniform float uBuildOpacity;
  uniform float uChipMinY;
  uniform float uChipMaxY;
  uniform float uMaxDarkestValue;
  uniform vec3 uSolidColor;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    float revealY = mix(uChipMaxY, uChipMinY, uBuildOpacity);
    float vis = smoothstep(revealY - 0.015, revealY + 0.015, vWorldPosition.y);
    if (vis < 0.01) discard;

    vec3 darkEnd = mix(vec3(0.0), uSolidColor, uMaxDarkestValue);

    vec2 center = vec2(0.5, 0.5);
    vec2 scaled = (vUv - center) / uLogoSize + center;
    float c = cos(uLogoRotation);
    float s = sin(uLogoRotation);
    vec2 d = scaled - center;
    vec2 rotated = center + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
    if (rotated.x < 0.0 || rotated.x > 1.0 || rotated.y < 0.0 || rotated.y > 1.0) {
      gl_FragColor = vec4(darkEnd, 1.0);
      return;
    }
    vec3 sampled = texture2D(uAITexture, rotated).rgb;
    float luminance = dot(sampled, vec3(0.299, 0.587, 0.114));
    float textMask = 1.0 - smoothstep(0.08, 0.92, luminance);

    vec3 finalColor = mix(darkEnd, vec3(1.0), textMask);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

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
  uniform float uBuildProgress;
  uniform float uBuildOpacity;

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

    float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
    float revealRadius = length(vUv - vec2(0.5, 0.5)) * 1.414; // sqrt(2) so radius 1 reaches corners
    float revealMask = 1.0 - smoothstep(
      uBuildProgress - 0.04,
      uBuildProgress + 0.04,
      revealRadius
    );
    float alpha = smoothstep(0.04, 0.18, lum) * revealMask;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const degToRad = (value) => (value * Math.PI) / 180;

export default function Motherboard({
  texturePath = "/textures/motherboard/Motherboard.png",
  defaultPlaneSize = [9, 9],
  defaultMotherboardScale = [0.9, 0.9],
  defaultMotherboardOffset = [-0.055, -0.03],
  defaultPlaneColor = "#0f1014",
  defaultMotherboardColor = "#f2f5f7",
  defaultPosition = [0, -5.5, 0],
  defaultRotation = [-90, 0, 0],
  planeVisible = true,
}) {
  const motherboardTexture = useTexture(texturePath);
  const aiTexture = useTexture("/textures/motherboard/AI.png");
  const buildProgressRef = useRef(0);
  const buildTargetRef = useRef(0);

  useEffect(() => {
    motherboardTexture.colorSpace = SRGBColorSpace;
    motherboardTexture.wrapS = ClampToEdgeWrapping;
    motherboardTexture.wrapT = ClampToEdgeWrapping;
    motherboardTexture.needsUpdate = true;
  }, [motherboardTexture]);

  useEffect(() => {
    aiTexture.colorSpace = SRGBColorSpace;
    aiTexture.wrapS = ClampToEdgeWrapping;
    aiTexture.wrapT = ClampToEdgeWrapping;
    aiTexture.needsUpdate = true;
  }, [aiTexture]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: true,
        depthTest: true,
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
          uBuildProgress: { value: 0 },
          uBuildOpacity: { value: 0 },
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

  const gridMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GRID_VERTEX,
        fragmentShader: GRID_FRAGMENT,
        transparent: false,
        side: DoubleSide,
        depthWrite: true,
        depthTest: true,
        uniforms: {
          uNumCols: { value: DEFAULT_SIDE_CELL_COLUMNS },
          uNumRows: { value: DEFAULT_SIDE_CELL_ROWS },
          uBlackRows: { value: SIDE_BLACK_ROWS },
          uMaxDarkestValue: { value: 1.0 },
          uBuildOpacity: { value: 0 },
          uChipMinY: { value: 0 },
          uChipMaxY: { value: 0 },
          uSolidColor: { value: new Color("#000000") },
        },
      }),
    []
  );

  const topFaceMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: AI_TOP_VERTEX,
        fragmentShader: AI_TOP_FRAGMENT,
        transparent: false,
        side: DoubleSide,
        depthWrite: true,
        depthTest: true,
        uniforms: {
          uAITexture: { value: null },
          uLogoSize: { value: 0.7 },
          uLogoRotation: { value: 0 },
          uBuildOpacity: { value: 0 },
          uChipMinY: { value: 0 },
          uChipMaxY: { value: 0 },
          uMaxDarkestValue: { value: 1.0 },
          uSolidColor: { value: new Color("#000000") },
        },
      }),
    []
  );

  const controls = useControls(
    "About/Motherboard",
    {
      Plane: folder(
        {
          planeWidth: {
            value: defaultPlaneSize[0],
            min: 0.5,
            max: 20,
            step: 0.001,
          },
          planeHeight: {
            value: defaultPlaneSize[1],
            min: 0.5,
            max: 20,
            step: 0.001,
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
            step: 0.001,
            label: "Size X",
          },
          motherboardScaleY: {
            value: defaultMotherboardScale[1],
            min: 0.1,
            max: 2,
            step: 0.001,
            label: "Size Y",
          },
          motherboardOffsetX: {
            value: defaultMotherboardOffset[0],
            min: -0.75,
            max: 0.75,
            step: 0.001,
            label: "Offset X",
          },
          motherboardOffsetY: {
            value: defaultMotherboardOffset[1],
            min: -0.75,
            max: 0.75,
            step: 0.001,
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
            step: 0.001,
          },
          positionY: {
            value: defaultPosition[1],
            min: -20,
            max: 20,
            step: 0.001,
          },
          positionZ: {
            value: defaultPosition[2],
            min: -20,
            max: 20,
            step: 0.001,
          },
          rotationX: {
            value: defaultRotation[0],
            min: -180,
            max: 180,
            step: 0.001,
          },
          rotationY: {
            value: defaultRotation[1],
            min: -180,
            max: 180,
            step: 0.001,
          },
          rotationZ: {
            value: defaultRotation[2],
            min: -180,
            max: 180,
            step: 0.001,
          },
        },
        { collapsed: false }
      ),
      Chip: folder(
        {
          chipWidth: {
            value: 1.036,
            min: 0.05,
            max: 2,
            step: 0.001,
            label: "Width (X & Z)",
          },
          chipHeight: {
            value: 0.3,
            min: 0.01,
            max: 2,
            step: 0.001,
            label: "Height (Y)",
          },
          sideCellColumns: {
            value: DEFAULT_SIDE_CELL_COLUMNS,
            min: 1,
            max: 64,
            step: 1,
            label: "Side cell columns",
          },
          sideCellRows: {
            value: DEFAULT_SIDE_CELL_ROWS,
            min: 1,
            max: 64,
            step: 1,
            label: "Side cell rows",
          },
          logoSize: {
            value: 1,
            min: 0.2,
            max: 1,
            step: 0.01,
            label: "AI logo size",
          },
          logoRotation: {
            value: 0,
            options: { "0°": 0, "90°": 90, "180°": 180, "270°": 270 },
            label: "AI logo rotation",
          },
          offsetX: {
            value: 0,
            min: -5,
            max: 5,
            step: 0.001,
            label: "Offset X",
          },
          offsetY: {
            value: 0,
            min: -2,
            max: 2,
            step: 0.001,
            label: "Offset Y",
          },
          offsetZ: {
            value: -0.056,
            min: -5,
            max: 5,
            step: 0.001,
            label: "Offset Z",
          },
          chipRotationX: {
            value: 0,
            min: -180,
            max: 180,
            step: 0.001,
            label: "Rotation X",
          },
          chipRotationY: {
            value: 0,
            min: -180,
            max: 180,
            step: 0.001,
            label: "Rotation Y",
          },
          chipRotationZ: {
            value: 0,
            min: -180,
            max: 180,
            step: 0.001,
            label: "Rotation Z",
          },
          chipColor: {
            value: "#000000",
            label: "Color (sides & AI)",
          },
          maxDarkestValue: {
            value: 1.0,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Max darkest value",
          },
        },
        { collapsed: false }
      ),
      Animation: folder(
        {
          activateBuild: button(() => {
            buildTargetRef.current = 1;
          }),
          resetBuild: button(() => {
            buildTargetRef.current = 0;
            buildProgressRef.current = 0;
            material.uniforms.uBuildProgress.value = 0;
            material.uniforms.uBuildOpacity.value = 0;
            gridMaterial.uniforms.uBuildOpacity.value = 0;
            topFaceMaterial.uniforms.uBuildOpacity.value = 0;
          }),
          buildDuration: {
            value: 2.4,
            min: 0.1,
            max: 10,
            step: 0.01,
            label: "Build duration",
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

  useEffect(() => {
    topFaceMaterial.uniforms.uAITexture.value = aiTexture;
    topFaceMaterial.uniforms.uLogoSize.value = Math.max(0.01, controls.logoSize);
    topFaceMaterial.uniforms.uLogoRotation.value =
      (controls.logoRotation * Math.PI) / 180;
    topFaceMaterial.uniforms.uSolidColor.value.set(controls.chipColor);
    topFaceMaterial.uniforms.uMaxDarkestValue.value = controls.maxDarkestValue;
  }, [
    aiTexture,
    controls.logoSize,
    controls.logoRotation,
    controls.chipColor,
    controls.maxDarkestValue,
    topFaceMaterial,
  ]);

  useEffect(() => {
    gridMaterial.uniforms.uNumCols.value = Math.max(
      1,
      Math.round(controls.sideCellColumns)
    );
    gridMaterial.uniforms.uNumRows.value = Math.max(
      1,
      Math.round(controls.sideCellRows)
    );
    gridMaterial.uniforms.uSolidColor.value.set(controls.chipColor);
    gridMaterial.uniforms.uMaxDarkestValue.value = controls.maxDarkestValue;
  }, [
    gridMaterial,
    controls.sideCellColumns,
    controls.sideCellRows,
    controls.chipColor,
    controls.maxDarkestValue,
  ]);

  useEffect(() => {
    return () => {
      gridMaterial.dispose();
      topFaceMaterial.dispose();
    };
  }, [gridMaterial, topFaceMaterial]);

  const chipCenterY =
    controls.positionY + controls.chipHeight / 2 + controls.offsetY;
  const chipMinY = controls.positionY + controls.offsetY + 0.001;
  const chipMaxY = controls.positionY + controls.offsetY + controls.chipHeight + 0.001;

  useFrame((_, delta) => {
    const duration = Math.max(controls.buildDuration, 0.0001);
    const step = delta / duration;
    const next =
      buildTargetRef.current > buildProgressRef.current
        ? Math.min(buildTargetRef.current, buildProgressRef.current + step)
        : Math.max(buildTargetRef.current, buildProgressRef.current - step);

    if (Math.abs(next - buildProgressRef.current) < 0.0001) return;

    buildProgressRef.current = next;
    material.uniforms.uBuildProgress.value = next;
    material.uniforms.uBuildOpacity.value = next;
    gridMaterial.uniforms.uBuildOpacity.value = next;
    gridMaterial.uniforms.uChipMinY.value = chipMinY;
    gridMaterial.uniforms.uChipMaxY.value = chipMaxY;
    topFaceMaterial.uniforms.uBuildOpacity.value = next;
    topFaceMaterial.uniforms.uChipMinY.value = chipMinY;
    topFaceMaterial.uniforms.uChipMaxY.value = chipMaxY;
  });

  return (
    <group>
      <group
        position={[
          controls.positionX + controls.offsetX,
          chipCenterY + 0.001,
          controls.positionZ + controls.offsetZ,
        ]}
        rotation={[
          degToRad(controls.chipRotationX),
          degToRad(controls.chipRotationY),
          degToRad(controls.chipRotationZ),
        ]}
        renderOrder={0}
      >
        <mesh>
          <boxGeometry
            args={[controls.chipWidth, controls.chipHeight, controls.chipWidth]}
          />
          <primitive object={gridMaterial} attach="material-0" />
          <primitive object={gridMaterial} attach="material-1" />
          <meshBasicMaterial
            attach="material-2"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
          />
          <meshBasicMaterial
            attach="material-3"
            transparent
            opacity={0}
            depthWrite={true}
            depthTest={true}
            colorWrite={false}
          />
          <primitive object={gridMaterial} attach="material-4" />
          <primitive object={gridMaterial} attach="material-5" />
        </mesh>
        <mesh
          position={[0, controls.chipHeight / 2, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1}
          material={topFaceMaterial}
        >
          <planeGeometry
            args={[controls.chipWidth, controls.chipWidth]}
          />
        </mesh>
      </group>
      {planeVisible && (
        <mesh
          position={[controls.positionX, controls.positionY, controls.positionZ]}
          rotation={[
            degToRad(controls.rotationX),
            degToRad(controls.rotationY),
            degToRad(controls.rotationZ),
          ]}
          material={material}
          renderOrder={1}
        >
          <planeGeometry args={[controls.planeWidth, controls.planeHeight]} />
        </mesh>
      )}
    </group>
  );
}
