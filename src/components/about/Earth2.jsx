import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { button, folder, useControls } from "leva";
import {
  BackSide,
  Color,
  MathUtils,
  NoColorSpace,
  ShaderMaterial,
  Spherical,
  SphereGeometry,
  SRGBColorSpace,
  Uniform,
  Vector3,
} from "three";
import earthVertexShader from "../../shaders/earth2/earthVertex.glsl";
import earthFragmentShader from "../../shaders/earth2/earthFragment.glsl";
import atmosphereVertexShader from "../../shaders/aboutEarth/atmosphereVertex.glsl";
import atmosphereFragmentShader from "../../shaders/aboutEarth/atmosphereFragment.glsl";
import NorthernLights2 from "./NorthernLights2";

const SEGMENTS = 128;

export default function Earth2() {
  const earthRef = useRef(null);
  const { gl } = useThree();
  const languageTargets = useRef({
    specularViewMix: 0,
    scandinavianMix: 0,
    arabicMix: 0,
    turkishMix: 0,
    blueMix: 0,
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

  const sunDirection = useMemo(() => new Vector3(), []);
  const sunSpherical = useMemo(
    () => new Spherical(1, Math.PI * 0.5, 0.5),
    []
  );

  const earthMaterial = useMemo(
    () =>
      new ShaderMaterial({
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
      earthMaterial.dispose();
      atmosphereMaterial.dispose();
    };
  }, [atmosphereMaterial, earthMaterial]);

  const earthControls = useControls(
    "Earth2",
    {
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
          normalScale: { value: 1.0, min: 0, max: 3.0, step: 0.01 },
          cloudOpacity: { value: 0.8, min: 0, max: 1.0, step: 0.01 },
          specularStrength: { value: 0.6, min: 0, max: 2.0, step: 0.01 },
          nightLightIntensity: { value: 1.4, min: 0, max: 2.0, step: 0.01 },
        },
        { collapsed: false }
      ),
      "Language Spread": folder(
        {
          languageColor: { value: "#ffffff", label: "Color" },
          specularViewElevMix: {
            value: 0.0,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Height map in specular view",
          },
          elevContrast: {
            value: 1.0,
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
              citiesColor: { value: "#ffffff", label: "Color" },
            },
            { collapsed: true }
          ),
          languageCoverOpacity: {
            value: 0.8,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Language cover opacity",
          },
          "Enable specular view": button(() => {
            interactionState.current.specularViewEnabled = true;
            languageTargets.current.specularViewMix = 1;
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
          }),
          "Show Arabic": button(() => {
            languageTargets.current.scandinavianMix = 0;
            languageTargets.current.arabicMix = 1;
            languageTargets.current.turkishMix = 0;
            languageTargets.current.blueMix = 0;
          }),
          "Show Turkish": button(() => {
            languageTargets.current.scandinavianMix = 0;
            languageTargets.current.arabicMix = 0;
            languageTargets.current.turkishMix = 1;
            languageTargets.current.blueMix = 0;
          }),
          "Show Blue": button(() => {
            languageTargets.current.scandinavianMix = 0;
            languageTargets.current.arabicMix = 0;
            languageTargets.current.turkishMix = 0;
            languageTargets.current.blueMix = 1;
          }),
          "Show all languages": button(() => {
            languageTargets.current.scandinavianMix = 1;
            languageTargets.current.arabicMix = 1;
            languageTargets.current.turkishMix = 1;
            languageTargets.current.blueMix = 1;
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
    },
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

    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh
        ref={earthRef}
        geometry={geometry}
        scale={2}
        frustumCulled
        material={earthMaterial}
      />

      <NorthernLights2 />

      <mesh
        geometry={geometry}
        scale={2.08}
        frustumCulled
        material={atmosphereMaterial}
        renderOrder={0}
      />
    </group>
  );
}
