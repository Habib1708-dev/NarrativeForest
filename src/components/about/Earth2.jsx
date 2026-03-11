import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { button, folder, useControls } from "leva";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Line,
  MathUtils,
  NoColorSpace,
  ShaderMaterial,
  Spherical,
  SphereGeometry,
  SRGBColorSpace,
  Uniform,
  Vector2,
  Vector3,
} from "three";
import earthVertexShader from "../../shaders/earth2/earthVertex.glsl";
import earthFragmentShader from "../../shaders/earth2/earthFragment.glsl";
import particleVertexShader from "../../shaders/earth2/particleVertex.glsl";
import particleFragmentShader from "../../shaders/earth2/particleFragment.glsl";
import atmosphereVertexShader from "../../shaders/aboutEarth/atmosphereVertex.glsl";
import atmosphereFragmentShader from "../../shaders/aboutEarth/atmosphereFragment.glsl";
import funnelLineVertexShader from "../../shaders/funnelLine/vertex.glsl";
import funnelLineFragmentShader from "../../shaders/funnelLine/fragment.glsl";
import NorthernLights2 from "./NorthernLights2";

const SEGMENTS = 128;

// Language spread origin UVs (from docs/language-spread-coordinates.md) for radial ripple
const TURKISH_ORIGIN_UV = new Vector2(0.5926148215402667, 0.7208708637800467);
const ARABIC_ORIGIN_UV = new Vector2(0.600045657460341, 0.6897751993640002);
const SCANDINAVIAN_ORIGIN_UV = new Vector2(0.5347596871653373, 0.812034899839748);
const ENGLISH_ORIGIN_UV = new Vector2(0.4967239532384653, 0.7895651614540524);
const LEBANON_RIPPLE_UV = new Vector2(0.598969569444, 0.688682352069);
const IRAQ_RIPPLE_UV = new Vector2(0.623526212276, 0.685228834652);
const DENMARK_RIPPLE_UV = new Vector2(0.525630074093, 0.814533702003);

const RIPPLE_DURATION_SEC = 2.5;
const TAU = Math.PI * 2;
const FUNNEL_SEGMENT_COUNT = 96;

// Vertical funnel: axis along Y. Top (wide mouth) near sphere half-bottom, tip and end below.
// mouthRadius is the upper opening radius in funnel-local unit space (group has scale 2).
function getFunnelShape(gravity, mouthRadius = 0.7) {
  const gravityNorm = MathUtils.clamp(gravity / 5, 0, 1);

  return {
    entryY: -0.45,
    tipY: -1.1,
    endY: -1.8,
    mouthRadius: Math.max(0.05, mouthRadius),
    tipRadius: 0.018,
    convergeRatio: 0.7,
    captureRatio: MathUtils.lerp(0.4, 0.14, gravityNorm),
    swirlTurns: MathUtils.lerp(0.7, 1.8, gravityNorm),
    waveAmplitude: MathUtils.lerp(0.09, 0.025, gravityNorm),
  };
}

// Writes funnel guide point in funnel-local space (axis Y, cross-section XZ). Optional offset for particle space.
function writeFunnelGuidePoint(
  target,
  progress,
  laneAngle,
  time,
  gravity,
  mouthRadius,
  seed = 0,
  offsetX = 0,
  offsetZ = 0
) {
  const shape = getFunnelShape(gravity, mouthRadius);
  const t = MathUtils.clamp(progress, 0, 1);
  const eased = MathUtils.smootherstep(t, 0, 1);
  const radius = MathUtils.lerp(shape.mouthRadius, shape.tipRadius, eased);
  const wave =
    Math.sin(time * 1.4 + seed * TAU + t * 10.0) *
    shape.waveAmplitude *
    (1 - eased);
  const angle = laneAngle + eased * shape.swirlTurns * TAU + wave;
  const y = MathUtils.lerp(shape.entryY, shape.tipY, eased);

  target.set(
    Math.cos(angle) * radius + offsetX,
    y,
    Math.sin(angle) * radius + offsetZ
  );

  return target;
}

function writeFunnelExitPoint(
  target,
  progress,
  gravity,
  mouthRadius,
  offsetX = 0,
  offsetZ = 0
) {
  const shape = getFunnelShape(gravity, mouthRadius);
  const t = MathUtils.smootherstep(MathUtils.clamp(progress, 0, 1), 0, 1);
  const y = MathUtils.lerp(shape.tipY, shape.endY, t);
  target.set(offsetX, y, offsetZ);
  return target;
}

function writeFunnelParticlePoint(
  target,
  progress,
  laneAngle,
  time,
  gravity,
  mouthRadius,
  seed = 0,
  offsetX = 0,
  offsetZ = 0
) {
  const shape = getFunnelShape(gravity, mouthRadius);
  const t = MathUtils.clamp(progress, 0, 1);

  if (t <= shape.convergeRatio) {
    return writeFunnelGuidePoint(
      target,
      t / Math.max(shape.convergeRatio, 0.0001),
      laneAngle,
      time,
      gravity,
      mouthRadius,
      seed,
      offsetX,
      offsetZ
    );
  }

  return writeFunnelExitPoint(
    target,
    (t - shape.convergeRatio) / Math.max(1 - shape.convergeRatio, 0.0001),
    gravity,
    mouthRadius,
    offsetX,
    offsetZ
  );
}

export default function Earth2({ onParticleBloomChange = () => {} }) {
  const earthRef = useRef(null);
  const earthSurfaceRef = useRef(null);
  const particlePointsRef = useRef(null);
  const atmosphereRef = useRef(null);
  const funnelGroupRef = useRef(null);
  const northernLightsOpacityRef = useRef(1);
  const spaceKeyRef = useRef(false);
  const particleTransition = useRef({ target: 0, progress: 0 });
  const particleBloomEnabledRef = useRef(false);
  const { gl, size } = useThree();
  const languageTargets = useRef({
    specularViewMix: 0,
    scandinavianMix: 0,
    arabicMix: 0,
    turkishMix: 0,
    blueMix: 0,
  });
  const rippleProgress = useRef({
    scandinavian: 0,
    arabic: 0,
    turkish: 0,
    english: 0,
  });
  const interactionState = useRef({
    specularViewEnabled: false,
  });

  const [
    dayMap,
    nightMap,
    cloudsMap,
    normalMap,
    specularMap,
    elevBumpMap,
    citiesMaskMap,
  ] = useTexture([
    "/textures/earth/earth2/8k_earth_daymap.jpg",
    "/textures/earth/earth2/8k_earth_nightmap.jpg",
    "/textures/earth/earth2/2k_earth_clouds.jpg",
    "/textures/earth/earth2/2k_earth_normal_map (1).jpg",
    "/textures/earth/earth2/8k_earth_specular_languages_map (1).jpg",
    "/textures/earth/earth2/elev_bump_8k.jpg",
    "/textures/earth/earth2/cities_mask.png",
  ]);

  const geometry = useMemo(() => {
    const geo = new SphereGeometry(1, SEGMENTS, SEGMENTS);
    geo.computeTangents();
    return geo;
  }, []);

  const particleSystem = useMemo(() => {
    const particlesGeometry = geometry.clone();
    const positionAttribute = particlesGeometry.getAttribute("position");
    const normalAttribute = particlesGeometry.getAttribute("normal");
    const basePositions = Float32Array.from(positionAttribute.array);
    const baseNormals = normalAttribute
      ? Float32Array.from(normalAttribute.array)
      : Float32Array.from(positionAttribute.array);
    const scatterDirections = new Float32Array(basePositions.length);
    const scatterStrengths = new Float32Array(positionAttribute.count);
    const phases = new Float32Array(positionAttribute.count);
    const funnelLaneAngles = new Float32Array(positionAttribute.count);
    const funnelOffsets = new Float32Array(positionAttribute.count);
    const funnelSpeedFactors = new Float32Array(positionAttribute.count);
    const funnelRanks = new Uint32Array(positionAttribute.count);
    const randomDirection = new Vector3();
    const surfaceNormal = new Vector3();
    const shuffledIndices = Array.from(
      { length: positionAttribute.count },
      (_, index) => index
    );

    positionAttribute.setUsage(DynamicDrawUsage);

    for (let i = shuffledIndices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffledIndices[i];
      shuffledIndices[i] = shuffledIndices[j];
      shuffledIndices[j] = tmp;
    }

    shuffledIndices.forEach((particleIndex, rank) => {
      funnelRanks[particleIndex] = rank;
    });

    for (let i = 0; i < positionAttribute.count; i += 1) {
      const i3 = i * 3;

      surfaceNormal
        .fromArray(baseNormals, i3)
        .normalize();

      randomDirection
        .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        .addScaledVector(surfaceNormal, 0.75)
        .normalize();

      scatterDirections[i3] = randomDirection.x;
      scatterDirections[i3 + 1] = randomDirection.y;
      scatterDirections[i3 + 2] = randomDirection.z;
      scatterStrengths[i] = 0.45 + Math.random() * 0.75;
      phases[i] = Math.random() * Math.PI * 2;
      funnelLaneAngles[i] = Math.atan2(basePositions[i3 + 2], basePositions[i3]);
      funnelOffsets[i] = Math.random();
      funnelSpeedFactors[i] = 0.8 + Math.random() * 0.7;
    }

    particlesGeometry.setAttribute("phase", new BufferAttribute(phases, 1));

    return {
      geometry: particlesGeometry,
      basePositions,
      baseNormals,
      scatterDirections,
      scatterStrengths,
      phases,
      funnelLaneAngles,
      funnelOffsets,
      funnelSpeedFactors,
      funnelRanks,
    };
  }, [geometry]);

  const sunDirection = useMemo(() => new Vector3(), []);
  const sunSpherical = useMemo(
    () => new Spherical(1, Math.PI * 0.5, 0.5),
    []
  );

  const earthMaterial = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        vertexShader: earthVertexShader,
        fragmentShader: earthFragmentShader,
        uniforms: {
          uDayTexture: new Uniform(dayMap),
          uNightTexture: new Uniform(nightMap),
          uCloudsTexture: new Uniform(cloudsMap),
          uNormalMap: new Uniform(normalMap),
          uSpecularMap: new Uniform(specularMap),
          uElevBumpMap: new Uniform(elevBumpMap),
          uCitiesMask: new Uniform(citiesMaskMap),
          uSunDirection: new Uniform(new Vector3(0, 0, 1)),
          uAtmosphereDayColor: new Uniform(new Color("#00aaff")),
          uAtmosphereTwilightColor: new Uniform(new Color("#6f6f6f")),
          uNightLightIntensity: new Uniform(1.4),
          uCloudOpacity: new Uniform(0.8),
          uSpecularStrength: new Uniform(0.6),
          uNormalScale: new Uniform(1.0),
          uDayTintColor: new Uniform(new Color("#ffffff")),
          uDayTintIntensity: new Uniform(0.0),
          uDaySaturation: new Uniform(1.0),
          uSpecularViewMix: new Uniform(0.0),
          uScandinavianMix: new Uniform(0.0),
          uArabicMix: new Uniform(0.0),
          uTurkishMix: new Uniform(0.0),
          uBlueMix: new Uniform(0.0),
          uLanguageColor: new Uniform(new Color("#ffffff")),
          uLanguageOverlayOpacity: new Uniform(0.0),
          uSpecularViewElevMix: new Uniform(0.0),
          uElevContrast: new Uniform(1.0),
          uCitiesMode: new Uniform(0.0),
          uCitiesOpacity: new Uniform(0.0),
          uCitiesColor: new Uniform(new Color("#ffffff")),
          uTurkishOriginUV: new Uniform(TURKISH_ORIGIN_UV.clone()),
          uArabicOriginUV: new Uniform(ARABIC_ORIGIN_UV.clone()),
          uScandinavianOriginUV: new Uniform(SCANDINAVIAN_ORIGIN_UV.clone()),
          uEnglishOriginUV: new Uniform(ENGLISH_ORIGIN_UV.clone()),
          uTurkishRippleProgress: new Uniform(0.0),
          uArabicRippleProgress: new Uniform(0.0),
          uScandinavianRippleProgress: new Uniform(0.0),
          uEnglishRippleProgress: new Uniform(0.0),
          uLebanonRippleUV: new Uniform(LEBANON_RIPPLE_UV.clone()),
          uIraqRippleUV: new Uniform(IRAQ_RIPPLE_UV.clone()),
          uDenmarkRippleUV: new Uniform(DENMARK_RIPPLE_UV.clone()),
          uPointRippleScale: new Uniform(0.028),
          uPointRippleOpacity: new Uniform(0.45),
          uPointRippleVisibility: new Uniform(0.0),
          uPointRippleColor: new Uniform(new Color("#ffbf00")),
          uDissolveOpacity: new Uniform(1.0),
          uTime: new Uniform(0.0),
        },
      }),
    [
      dayMap,
      nightMap,
      cloudsMap,
      normalMap,
      specularMap,
      elevBumpMap,
      citiesMaskMap,
    ]
  );

  const atmosphereMaterial = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        transparent: true,
        depthWrite: false,
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        uniforms: {
          uSunDirection: new Uniform(new Vector3(0, 0, 1)),
          uAtmosphereDayColor: new Uniform(new Color("#00aaff")),
          uAtmosphereTwilightColor: new Uniform(new Color("#6f6f6f")),
          uCloudOpacity: new Uniform(0.8),
          uDissolveOpacity: new Uniform(1.0),
        },
      }),
    []
  );

  const particleMaterial = useMemo(() => {
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        uColor: new Uniform(new Color("#ffffff")),
        uOpacity: new Uniform(0.0),
        uSize: new Uniform(0.04),
        uPixelRatio: new Uniform(Math.min(gl.getPixelRatio(), 2)),
        uViewportHeight: new Uniform(size.height),
        uMinPointSize: new Uniform(2.25),
        uSolidRatio: new Uniform(0.05),
        uSolidAlpha: new Uniform(5.0),
        uGlowSpread: new Uniform(0.02),
        uTime: new Uniform(0.0),
        uSparklingAlpha: new Uniform(0.0),
        uSparklingFrequency: new Uniform(1.0),
        uSparklingDuration: new Uniform(0.01),
      },
    });

    material.toneMapped = false;
    return material;
  }, [gl, size.height]);

  const funnelLineMaterial = useMemo(() => {
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      vertexShader: funnelLineVertexShader,
      fragmentShader: funnelLineFragmentShader,
      uniforms: {
        uColor: new Uniform(new Color("#8fc9ff")),
        uOpacity: new Uniform(0.35),
        uFullOpacityY: new Uniform(-0.6),
        uFadeBlendRange: new Uniform(0.35),
        uFadeAtTop: new Uniform(1.0),
      },
    });

    material.toneMapped = false;
    return material;
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "Space") spaceKeyRef.current = true;
    };
    const onKeyUp = (e) => {
      if (e.code === "Space") spaceKeyRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handleSpherePointerDown = (e) => {
    if (!spaceKeyRef.current) return;
    e.stopPropagation();
    const point = earthRef.current
      ? earthRef.current.worldToLocal(e.point.clone()).normalize()
      : e.point.clone().normalize();
    const lat = Math.asin(Math.max(-1, Math.min(1, point.y)));
    const lng = Math.atan2(point.x, point.z);
    const latDeg = (lat * 180) / Math.PI;
    const lngDeg = (lng * 180) / Math.PI;
    const uv = e.uv;
    console.log("Sphere coordinates:", {
      latitude: latDeg,
      longitude: lngDeg,
      latRad: lat,
      lngRad: lng,
      unitPoint: { x: point.x, y: point.y, z: point.z },
      uv: uv ? { u: uv.x, v: uv.y } : null,
    });
  };

  useEffect(() => {
    return () => {
      geometry.dispose();
      particleSystem.geometry.dispose();
    };
  }, [geometry, particleSystem.geometry]);

  useEffect(() => {
    return () => {
      onParticleBloomChange(false);
      earthMaterial.dispose();
      atmosphereMaterial.dispose();
      particleMaterial.dispose();
      funnelLineMaterial.dispose();
    };
  }, [
    atmosphereMaterial,
    earthMaterial,
    funnelLineMaterial,
    onParticleBloomChange,
    particleMaterial,
  ]);

  const [earthControls, setEarthControls] = useControls(
    "Earth2",
    () => ({
      Atmosphere: folder(
        {
          atmosphereDayColor: { value: "#00aaff" },
          atmosphereTwilightColor: { value: "#6f6f6f" },
        },
        { collapsed: false }
      ),
      Sun: folder(
        {
          phi: { value: Math.PI * 0.5, min: 0, max: Math.PI, step: 0.01 },
          theta: { value: 0.5, min: -Math.PI, max: Math.PI, step: 0.01 },
        },
        { collapsed: false }
      ),
      "Day tint": folder(
        {
          dayTintColor: { value: "#ffffff" },
          dayTintIntensity: { value: 0.0, min: 0, max: 1.0, step: 0.01 },
          daySaturation: { value: 1.0, min: 0, max: 2.0, step: 0.01 },
        },
        { collapsed: false }
      ),
      Surface: folder(
        {
          rotate: { value: true, label: "Rotate earth" },
          normalScale: { value: 1.0, min: 0, max: 3.0, step: 0.01 },
          cloudOpacity: { value: 0.8, min: 0, max: 1.0, step: 0.01 },
          specularStrength: { value: 0.6, min: 0, max: 2.0, step: 0.01 },
          nightLightIntensity: { value: 1.4, min: 0, max: 2.0, step: 0.01 },
        },
        { collapsed: false }
      ),
      Particles: folder(
        {
          "Turn To Particles": button(() => {
            particleTransition.current.target = 1;
          }),
          "Return To Globe": button(() => {
            particleTransition.current.target = 0;
          }),
          particleSize: {
            value: 0.04,
            min: 0.005,
            max: 0.12,
            step: 0.001,
            label: "Point size",
          },
          particleOpacity: {
            value: 0.95,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Brightness",
          },
          particleColor: { value: "#f8fbff", label: "Color" },
          particleSurfaceLift: {
            value: 0.045,
            min: 0,
            max: 0.25,
            step: 0.001,
            label: "Surface lift",
          },
          particleDrift: {
            value: 0.02,
            min: 0,
            max: 0.2,
            step: 0.001,
            label: "Soft drift",
          },
          particleShimmer: {
            value: 0.012,
            min: 0,
            max: 0.05,
            step: 0.001,
            label: "Surface shimmer",
          },
          particleShimmerSpeed: {
            value: 2.1,
            min: 0,
            max: 10,
            step: 0.1,
            label: "Shimmer speed",
          },
          particleTransitionSpeed: {
            value: 2.8,
            min: 0.5,
            max: 12,
            step: 0.1,
            label: "Transition speed",
          },
          "Point shape": folder(
            {
              solidRatio: {
                value: 0.05,
                min: 0,
                max: 0.5,
                step: 0.01,
                label: "Solid core size",
              },
              solidAlpha: {
                value: 5.0,
                min: 0,
                max: 10,
                step: 0.01,
                label: "Core opacity",
              },
              glowSpread: {
                value: 0.02,
                min: 0,
                max: 0.1,
                step: 0.001,
                label: "Glow falloff",
              },
            },
            { collapsed: true }
          ),
          Sparkling: folder(
            {
              sparklingAlpha: {
                value: 0,
                min: 0,
                max: 10,
                step: 0.01,
                label: "Sparkle boost (0 = off)",
              },
              sparklingFrequency: {
                value: 1.0,
                min: 0,
                max: 10,
                step: 0.01,
                label: "Frequency",
              },
              sparklingDuration: {
                value: 0.01,
                min: 0,
                max: 0.1,
                step: 0.001,
                label: "Duration",
              },
            },
            { collapsed: true }
          ),
          "Globe ↔ particles": folder(
            {
              crossfadeStart: {
                value: 0.02,
                min: 0,
                max: 1,
                step: 0.01,
                label: "Crossfade start",
              },
              crossfadeEnd: {
                value: 0.72,
                min: 0,
                max: 1,
                step: 0.01,
                label: "Crossfade end",
              },
            },
            { collapsed: false }
          ),
          Funnel: folder(
            {
              funnelEnabled: { value: true, label: "Enable funnel" },
              funnelParticleCount: {
                value: 250,
                min: 0,
                max: 500,
                step: 1,
                label: "Points inside",
              },
              funnelGravity: {
                value: 0.1,
                min: 0.1,
                max: 5,
                step: 0.01,
                label: "Gravity",
              },
              funnelSpeed: {
                value: 0.6,
                min: 0.05,
                max: 4,
                step: 0.01,
                label: "Travel speed",
              },
              funnelOpacity: {
                value: 0.34,
                min: 0,
                max: 1,
                step: 0.01,
                label: "Tunnel opacity",
              },
              funnelLineCount: {
                value: 8,
                min: 8,
                max: 180,
                step: 1,
                label: "Tunnel lines",
              },
              funnelMouthRadius: {
                value: 0.65,
                min: 0.2,
                max: 1.2,
                step: 0.01,
                label: "Upper opening width",
              },
              funnelOffsetX: {
                value: 0,
                min: -1.5,
                max: 1.5,
                step: 0.01,
                label: "Horizontal X",
              },
              funnelOffsetZ: {
                value: 0,
                min: -1.5,
                max: 1.5,
                step: 0.01,
                label: "Horizontal Z",
              },
              funnelOffsetY: {
                value: -0.81,
                min: -1.5,
                max: 1.5,
                step: 0.01,
                label: "Vertical Y",
              },
              "Line fade (top)": folder(
                {
                  funnelFadeAtTop: {
                    value: 1,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    label: "Fade at top (0=off)",
                  },
                  funnelFullOpacityY: {
                    value: -1.24,
                    min: -1.5,
                    max: 0.5,
                    step: 0.01,
                    label: "Full opacity Y",
                  },
                  funnelFadeBlendRange: {
                    value: 0.53,
                    min: 0.01,
                    max: 1.2,
                    step: 0.01,
                    label: "Blend range (smooth=larger)",
                  },
                },
                { collapsed: false }
              ),
            },
            { collapsed: false }
          ),
          "Atmosphere (fade only)": folder(
            {
              atmosphereFadeStart: {
                value: 0.0,
                min: 0,
                max: 1,
                step: 0.01,
                label: "Fade start",
              },
              atmosphereFadeEnd: {
                value: 0.5,
                min: 0,
                max: 1,
                step: 0.01,
                label: "Fade end",
              },
            },
            { collapsed: true }
          ),
        },
        { collapsed: false }
      ),
      "Language Spread": folder(
        {
          languageColor: { value: "#ffbf00", label: "Color" },
          specularViewElevMix: {
            value: 0.43,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Height map in specular view",
          },
          elevContrast: {
            value: 1.13,
            min: 0.2,
            max: 3.0,
            step: 0.01,
            label: "Elevation contrast",
          },
          Cities: folder(
            {
              citiesMode: {
                value: "overlay",
                options: { "Overlay on specular": "overlay", "Day/night style": "daynight" },
                label: "Mode",
              },
              citiesOpacity: {
                value: 0.9,
                min: 0,
                max: 1,
                step: 0.01,
                label: "Opacity",
              },
              citiesColor: { value: "#ffbf00", label: "Color" },
            },
            { collapsed: true }
          ),
          languageCoverOpacity: {
            value: 0.34,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Language cover opacity",
          },
          "Point ripples": folder(
            {
              pointRipplesLive: { value: false, label: "Live continuously" },
              pointRippleScale: {
                value: 0.028,
                min: 0.003,
                max: 0.08,
                step: 0.001,
                label: "Scale",
              },
              pointRippleOpacity: {
                value: 0.45,
                min: 0,
                max: 1,
                step: 0.01,
                label: "Opacity",
              },
              pointRippleColor: { value: "#ffbf00", label: "Color" },
            },
            { collapsed: true }
          ),
          "Enable specular view": button(() => {
            interactionState.current.specularViewEnabled = true;
            languageTargets.current.specularViewMix = 1;
            setEarthControls({
              atmosphereDayColor: "#5f5f5f",
              atmosphereTwilightColor: "#5f5f5f",
            });
          }),
          "Return to day/night": button(() => {
            interactionState.current.specularViewEnabled = false;
            languageTargets.current.specularViewMix = 0;
            languageTargets.current.scandinavianMix = 0;
            languageTargets.current.arabicMix = 0;
            languageTargets.current.turkishMix = 0;
            languageTargets.current.blueMix = 0;
          }),
          "Show Scandinavian": button(() => {
            languageTargets.current.scandinavianMix = 1;
            languageTargets.current.arabicMix = 0;
            languageTargets.current.turkishMix = 0;
            languageTargets.current.blueMix = 0;
            rippleProgress.current.scandinavian = 0;
          }),
          "Show Arabic": button(() => {
            languageTargets.current.scandinavianMix = 0;
            languageTargets.current.arabicMix = 1;
            languageTargets.current.turkishMix = 0;
            languageTargets.current.blueMix = 0;
            rippleProgress.current.arabic = 0;
          }),
          "Show Turkish": button(() => {
            languageTargets.current.scandinavianMix = 0;
            languageTargets.current.arabicMix = 0;
            languageTargets.current.turkishMix = 1;
            languageTargets.current.blueMix = 0;
            rippleProgress.current.turkish = 0;
          }),
          "Show Blue": button(() => {
            languageTargets.current.scandinavianMix = 0;
            languageTargets.current.arabicMix = 0;
            languageTargets.current.turkishMix = 0;
            languageTargets.current.blueMix = 1;
            rippleProgress.current.english = 0;
          }),
          "Show all languages": button(() => {
            languageTargets.current.scandinavianMix = 1;
            languageTargets.current.arabicMix = 1;
            languageTargets.current.turkishMix = 1;
            languageTargets.current.blueMix = 1;
            rippleProgress.current.scandinavian = 0;
            rippleProgress.current.arabic = 0;
            rippleProgress.current.turkish = 0;
            rippleProgress.current.english = 0;
          }),
          "Hide languages": button(() => {
            languageTargets.current.scandinavianMix = 0;
            languageTargets.current.arabicMix = 0;
            languageTargets.current.turkishMix = 0;
            languageTargets.current.blueMix = 0;
          }),
        },
        { collapsed: false }
      ),
    }),
    { collapsed: false }
  );

  useEffect(() => {
    dayMap.colorSpace = SRGBColorSpace;
    nightMap.colorSpace = SRGBColorSpace;
    cloudsMap.colorSpace = NoColorSpace;
    normalMap.colorSpace = NoColorSpace;
    specularMap.colorSpace = NoColorSpace;
    elevBumpMap.colorSpace = NoColorSpace;
    citiesMaskMap.colorSpace = NoColorSpace;

    const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
    const anisotropy = Math.min(8, maxAnisotropy || 1);
    [
      dayMap,
      nightMap,
      cloudsMap,
      normalMap,
      specularMap,
      elevBumpMap,
      citiesMaskMap,
    ].forEach((texture) => {
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    });
  }, [
    dayMap,
    gl,
    nightMap,
    cloudsMap,
    normalMap,
    specularMap,
    elevBumpMap,
    citiesMaskMap,
  ]);

  useEffect(() => {
    const group = funnelGroupRef.current;
    if (!group) return undefined;

    group.clear();

    const guideCount = Math.max(1, Math.floor(earthControls.funnelLineCount));

    for (let i = 0; i < guideCount; i += 1) {
      const geometry = new BufferGeometry();
      const positions = new Float32Array(FUNNEL_SEGMENT_COUNT * 3);
      geometry.setAttribute("position", new BufferAttribute(positions, 3));

      const line = new Line(geometry, funnelLineMaterial);
      line.frustumCulled = false;
      line.renderOrder = 1;
      line.userData = {
        type: "guide",
        laneAngle: (i / guideCount) * TAU,
        seed: i / guideCount,
      };
      group.add(line);
    }

    const exitGeometry = new BufferGeometry();
    exitGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(FUNNEL_SEGMENT_COUNT * 3), 3)
    );

    const exitLine = new Line(exitGeometry, funnelLineMaterial);
    exitLine.frustumCulled = false;
    exitLine.renderOrder = 1;
    exitLine.userData = { type: "exit" };
    group.add(exitLine);

    return () => {
      group.children.forEach((child) => {
        child.geometry?.dispose?.();
      });
      group.clear();
    };
  }, [earthControls.funnelLineCount, funnelLineMaterial]);

  useFrame((_, delta) => {
    sunSpherical.phi = earthControls.phi;
    sunSpherical.theta = earthControls.theta;
    sunDirection.setFromSpherical(sunSpherical);

    earthMaterial.uniforms.uSunDirection.value.copy(sunDirection);
    atmosphereMaterial.uniforms.uSunDirection.value.copy(sunDirection);

    earthMaterial.uniforms.uAtmosphereDayColor.value.set(
      earthControls.atmosphereDayColor
    );
    earthMaterial.uniforms.uAtmosphereTwilightColor.value.set(
      earthControls.atmosphereTwilightColor
    );
    atmosphereMaterial.uniforms.uAtmosphereDayColor.value.set(
      earthControls.atmosphereDayColor
    );
    atmosphereMaterial.uniforms.uAtmosphereTwilightColor.value.set(
      earthControls.atmosphereTwilightColor
    );

    earthMaterial.uniforms.uDayTintColor.value.set(earthControls.dayTintColor);
    earthMaterial.uniforms.uDayTintIntensity.value =
      earthControls.dayTintIntensity;
    earthMaterial.uniforms.uDaySaturation.value = earthControls.daySaturation;
    earthMaterial.uniforms.uLanguageColor.value.set(earthControls.languageColor);
    earthMaterial.uniforms.uLanguageOverlayOpacity.value =
      earthControls.languageCoverOpacity;
    earthMaterial.uniforms.uSpecularViewElevMix.value =
      earthControls.specularViewElevMix;
    earthMaterial.uniforms.uElevContrast.value = earthControls.elevContrast;
    earthMaterial.uniforms.uCitiesMode.value =
      earthControls.citiesMode === "daynight" ? 1.0 : 0.0;
    earthMaterial.uniforms.uCitiesOpacity.value = earthControls.citiesOpacity;
    earthMaterial.uniforms.uCitiesColor.value.set(earthControls.citiesColor);
    earthMaterial.uniforms.uPointRippleScale.value =
      earthControls.pointRippleScale;
    earthMaterial.uniforms.uPointRippleOpacity.value =
      earthControls.pointRippleOpacity;
    earthMaterial.uniforms.uPointRippleColor.value.set(
      earthControls.pointRippleColor
    );
    earthMaterial.uniforms.uTime.value += delta;
    earthMaterial.uniforms.uPointRippleVisibility.value = MathUtils.damp(
      earthMaterial.uniforms.uPointRippleVisibility.value,
      earthControls.pointRipplesLive ? 1.0 : 0.0,
      4.0,
      delta
    );

    particleTransition.current.progress = MathUtils.damp(
      particleTransition.current.progress,
      particleTransition.current.target,
      earthControls.particleTransitionSpeed,
      delta
    );

    const particleProgress = particleTransition.current.progress;
    const particleTime = earthMaterial.uniforms.uTime.value;

    // Single crossfade: globe fades out as particles fade in (same range = smooth handoff)
    const crossfadeEnd = Math.max(
      earthControls.crossfadeStart + 0.02,
      earthControls.crossfadeEnd
    );
    const particleVisibility = MathUtils.smoothstep(
      particleProgress,
      earthControls.crossfadeStart,
      crossfadeEnd
    );
    const globeVisibility =
      1.0 -
      MathUtils.smoothstep(
        particleProgress,
        earthControls.crossfadeStart,
        crossfadeEnd
      );

    // Atmosphere only fades out (no particles)
    const atmosphereFadeEnd = Math.max(
      earthControls.atmosphereFadeStart + 0.02,
      earthControls.atmosphereFadeEnd
    );
    const atmosphereVisibility =
      1.0 -
      MathUtils.smoothstep(
        particleProgress,
        earthControls.atmosphereFadeStart,
        atmosphereFadeEnd
      );

    particleMaterial.uniforms.uColor.value.set(earthControls.particleColor);
    particleMaterial.uniforms.uSize.value = earthControls.particleSize;
    particleMaterial.uniforms.uOpacity.value =
      earthControls.particleOpacity * particleVisibility;
    particleMaterial.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2);
    particleMaterial.uniforms.uViewportHeight.value = size.height;
    particleMaterial.uniforms.uMinPointSize.value = 2.25;
    particleMaterial.uniforms.uTime.value = earthMaterial.uniforms.uTime.value;
    particleMaterial.uniforms.uSolidRatio.value = earthControls.solidRatio;
    particleMaterial.uniforms.uSolidAlpha.value = earthControls.solidAlpha;
    particleMaterial.uniforms.uGlowSpread.value = earthControls.glowSpread;
    particleMaterial.uniforms.uSparklingAlpha.value =
      earthControls.sparklingAlpha;
    particleMaterial.uniforms.uSparklingFrequency.value =
      earthControls.sparklingFrequency;
    particleMaterial.uniforms.uSparklingDuration.value =
      earthControls.sparklingDuration;
    earthMaterial.uniforms.uDissolveOpacity.value = globeVisibility;
    atmosphereMaterial.uniforms.uDissolveOpacity.value = atmosphereVisibility;

    // Keep globe occlusion stable so background effects (e.g. northern lights) don't bleed through.
    if (!earthMaterial.depthWrite) earthMaterial.depthWrite = true;
    if (!earthMaterial.depthTest) earthMaterial.depthTest = true;

    // Show the full particle shell from frame one by bypassing depth test only for points.
    const showParticles = particleVisibility > 0.001;
    const particleBloomEnabled =
      particleTransition.current.target > 0.5 && showParticles;
    if (particleBloomEnabledRef.current !== particleBloomEnabled) {
      particleBloomEnabledRef.current = particleBloomEnabled;
      onParticleBloomChange(particleBloomEnabled);
    }
    const particleDepthTest = !showParticles;
    if (particleMaterial.depthTest !== particleDepthTest) {
      particleMaterial.depthTest = particleDepthTest;
    }

    if (particlePointsRef.current) {
      particlePointsRef.current.visible = showParticles;
    }
    if (earthRef.current) {
      earthRef.current.visible = globeVisibility > 0.001;
    }
    if (atmosphereRef.current) {
      atmosphereRef.current.visible = atmosphereVisibility > 0.001;
    }

    const funnelVisible =
      earthControls.funnelEnabled && particleVisibility > 0.001;
    if (funnelGroupRef.current) {
      funnelGroupRef.current.visible = funnelVisible;
    }
    funnelLineMaterial.uniforms.uColor.value.set(earthControls.particleColor);
    funnelLineMaterial.uniforms.uOpacity.value =
      earthControls.funnelOpacity * particleVisibility;
    funnelLineMaterial.uniforms.uFullOpacityY.value =
      earthControls.funnelFullOpacityY;
    funnelLineMaterial.uniforms.uFadeBlendRange.value =
      earthControls.funnelFadeBlendRange;
    funnelLineMaterial.uniforms.uFadeAtTop.value =
      earthControls.funnelFadeAtTop;

    if (funnelVisible && funnelGroupRef.current) {
      funnelGroupRef.current.children.forEach((line) => {
        const positionAttr = line.geometry.getAttribute("position");
        const positions = positionAttr.array;

        if (line.userData.type === "guide") {
          for (let i = 0; i < FUNNEL_SEGMENT_COUNT; i += 1) {
            const t = i / (FUNNEL_SEGMENT_COUNT - 1);
            writeFunnelGuidePoint(
              sunDirection,
              t,
              line.userData.laneAngle,
              particleTime,
              earthControls.funnelGravity,
              earthControls.funnelMouthRadius,
              line.userData.seed,
              0,
              0
            );
            const i3 = i * 3;
            positions[i3] = sunDirection.x;
            positions[i3 + 1] = sunDirection.y;
            positions[i3 + 2] = sunDirection.z;
          }
        } else {
          for (let i = 0; i < FUNNEL_SEGMENT_COUNT; i += 1) {
            const t = i / (FUNNEL_SEGMENT_COUNT - 1);
            writeFunnelExitPoint(
              sunDirection,
              t,
              earthControls.funnelGravity,
              earthControls.funnelMouthRadius,
              0,
              0
            );
            const i3 = i * 3;
            positions[i3] = sunDirection.x;
            positions[i3 + 1] = sunDirection.y;
            positions[i3 + 2] = sunDirection.z;
          }
        }

        positionAttr.needsUpdate = true;
      });
    }

    const particlePositions = particleSystem.geometry.getAttribute("position");
    const positionArray = particlePositions.array;
    const funnelShape = getFunnelShape(
      earthControls.funnelGravity,
      earthControls.funnelMouthRadius
    );
    const funnelParticleOffsetX = earthControls.funnelOffsetX * 0.5;
    const funnelParticleOffsetZ = earthControls.funnelOffsetZ * 0.5;
    const funnelParticleOffsetY = earthControls.funnelOffsetY * 0.5;
    const funnelParticleCount = Math.min(
      particlePositions.count,
      Math.max(0, Math.floor(earthControls.funnelParticleCount))
    );
    const funnelSpeed = earthControls.funnelSpeed * 0.18;

    for (let i = 0; i < particlePositions.count; i += 1) {
      const i3 = i * 3;
      const scatterStrength = particleSystem.scatterStrengths[i];
      const phase = particleSystem.phases[i];
      const surfaceLift =
        earthControls.particleSurfaceLift * scatterStrength * particleVisibility;
      const driftOffset =
        earthControls.particleDrift *
        scatterStrength *
        Math.sin(particleTime * 0.8 + phase * 1.37) *
        particleVisibility;
      const shimmerOffset =
        Math.sin(particleTime * earthControls.particleShimmerSpeed + phase) *
        earthControls.particleShimmer *
        particleVisibility;
      const shellX =
        particleSystem.basePositions[i3] +
        particleSystem.baseNormals[i3] * (surfaceLift + shimmerOffset) +
        particleSystem.scatterDirections[i3] * driftOffset;
      const shellY =
        particleSystem.basePositions[i3 + 1] +
        particleSystem.baseNormals[i3 + 1] * (surfaceLift + shimmerOffset) +
        particleSystem.scatterDirections[i3 + 1] * driftOffset;
      const shellZ =
        particleSystem.basePositions[i3 + 2] +
        particleSystem.baseNormals[i3 + 2] * (surfaceLift + shimmerOffset) +
        particleSystem.scatterDirections[i3 + 2] * driftOffset;
      const funnelActive =
        funnelVisible && particleSystem.funnelRanks[i] < funnelParticleCount;

      if (funnelActive) {
        const funnelProgress =
          (particleTime *
            funnelSpeed *
            particleSystem.funnelSpeedFactors[i] +
            particleSystem.funnelOffsets[i]) %
          1;

        if (funnelProgress < funnelShape.captureRatio) {
          const captureMix = Math.pow(
            MathUtils.smootherstep(
              funnelProgress / Math.max(funnelShape.captureRatio, 0.0001),
              0,
              1
            ),
            MathUtils.lerp(1.7, 0.65, earthControls.funnelGravity / 5)
          );

          writeFunnelGuidePoint(
            sunDirection,
            0,
            particleSystem.funnelLaneAngles[i],
            particleTime,
            earthControls.funnelGravity,
            earthControls.funnelMouthRadius,
            particleSystem.funnelOffsets[i],
            funnelParticleOffsetX,
            funnelParticleOffsetZ
          );

          positionArray[i3] = MathUtils.lerp(shellX, sunDirection.x, captureMix);
          positionArray[i3 + 1] = MathUtils.lerp(
            shellY,
            sunDirection.y + funnelParticleOffsetY,
            captureMix
          );
          positionArray[i3 + 2] = MathUtils.lerp(
            shellZ,
            sunDirection.z,
            captureMix
          );
        } else {
          writeFunnelParticlePoint(
            sunDirection,
            (funnelProgress - funnelShape.captureRatio) /
              Math.max(1 - funnelShape.captureRatio, 0.0001),
            particleSystem.funnelLaneAngles[i],
            particleTime,
            earthControls.funnelGravity,
            earthControls.funnelMouthRadius,
            particleSystem.funnelOffsets[i],
            funnelParticleOffsetX,
            funnelParticleOffsetZ
          );

          positionArray[i3] = sunDirection.x;
          positionArray[i3 + 1] = sunDirection.y + funnelParticleOffsetY;
          positionArray[i3 + 2] = sunDirection.z;
        }
        continue;
      }

      positionArray[i3] = shellX;
      positionArray[i3 + 1] = shellY;
      positionArray[i3 + 2] = shellZ;
    }

    particlePositions.needsUpdate = true;

    // Animate per-language ripple progress toward 1 when that language is shown
    const r = rippleProgress.current;
    const t = languageTargets.current;
    if (t.scandinavianMix > 0 && r.scandinavian < 1)
      r.scandinavian = Math.min(1, r.scandinavian + delta / RIPPLE_DURATION_SEC);
    if (t.arabicMix > 0 && r.arabic < 1)
      r.arabic = Math.min(1, r.arabic + delta / RIPPLE_DURATION_SEC);
    if (t.turkishMix > 0 && r.turkish < 1)
      r.turkish = Math.min(1, r.turkish + delta / RIPPLE_DURATION_SEC);
    if (t.blueMix > 0 && r.english < 1)
      r.english = Math.min(1, r.english + delta / RIPPLE_DURATION_SEC);
    earthMaterial.uniforms.uScandinavianRippleProgress.value = r.scandinavian;
    earthMaterial.uniforms.uArabicRippleProgress.value = r.arabic;
    earthMaterial.uniforms.uTurkishRippleProgress.value = r.turkish;
    earthMaterial.uniforms.uEnglishRippleProgress.value = r.english;

    earthMaterial.uniforms.uNormalScale.value = earthControls.normalScale;
    earthMaterial.uniforms.uCloudOpacity.value = earthControls.cloudOpacity;
    earthMaterial.uniforms.uSpecularStrength.value =
      earthControls.specularStrength;
    earthMaterial.uniforms.uNightLightIntensity.value =
      earthControls.nightLightIntensity;
    atmosphereMaterial.uniforms.uCloudOpacity.value =
      earthControls.cloudOpacity;
    earthMaterial.uniforms.uSpecularViewMix.value = MathUtils.damp(
      earthMaterial.uniforms.uSpecularViewMix.value,
      languageTargets.current.specularViewMix,
      4.0,
      delta
    );
    // Northern lights: on for day/night view, off for specular view (same curve as globe)
    northernLightsOpacityRef.current =
      1.0 - earthMaterial.uniforms.uSpecularViewMix.value;
    earthMaterial.uniforms.uScandinavianMix.value = MathUtils.damp(
      earthMaterial.uniforms.uScandinavianMix.value,
      languageTargets.current.scandinavianMix,
      5.0,
      delta
    );
    earthMaterial.uniforms.uArabicMix.value = MathUtils.damp(
      earthMaterial.uniforms.uArabicMix.value,
      languageTargets.current.arabicMix,
      5.0,
      delta
    );
    earthMaterial.uniforms.uTurkishMix.value = MathUtils.damp(
      earthMaterial.uniforms.uTurkishMix.value,
      languageTargets.current.turkishMix,
      5.0,
      delta
    );
    earthMaterial.uniforms.uBlueMix.value = MathUtils.damp(
      earthMaterial.uniforms.uBlueMix.value,
      languageTargets.current.blueMix,
      5.0,
      delta
    );

    if (earthSurfaceRef.current && earthControls.rotate) {
      earthSurfaceRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <group ref={earthSurfaceRef}>
        <mesh
          ref={earthRef}
          geometry={geometry}
          scale={2}
          frustumCulled
          material={earthMaterial}
          onPointerDown={handleSpherePointerDown}
        />
        <group
          ref={funnelGroupRef}
          position={[
            earthControls.funnelOffsetX,
            earthControls.funnelOffsetY,
            earthControls.funnelOffsetZ,
          ]}
          scale={2}
        />
        <points
          ref={particlePointsRef}
          geometry={particleSystem.geometry}
          material={particleMaterial}
          scale={2}
          frustumCulled
          renderOrder={2}
        />
      </group>

      <NorthernLights2 opacityRef={northernLightsOpacityRef} />

      <mesh
        ref={atmosphereRef}
        geometry={geometry}
        scale={2.08}
        frustumCulled
        material={atmosphereMaterial}
        renderOrder={0}
      />
    </group>
  );
}
