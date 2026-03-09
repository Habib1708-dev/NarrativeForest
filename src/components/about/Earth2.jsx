import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { folder, useControls } from "leva";
import {
  BackSide,
  Color,
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

const SEGMENTS = 128;

export default function Earth2() {
  const earthRef = useRef(null);
  const { gl } = useThree();

  const [dayMap, nightMap, cloudsMap, normalMap, specularMap] = useTexture([
    "/textures/earth/earth2/8k_earth_daymap.jpg",
    "/textures/earth/earth2/8k_earth_nightmap.jpg",
    "/textures/earth/earth2/2k_earth_clouds.jpg",
    "/textures/earth/earth2/2k_earth_normal_map (1).jpg",
    "/textures/earth/earth2/2k_earth_specular_map.jpg",
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
          uSunDirection: new Uniform(new Vector3(0, 0, 1)),
          uAtmosphereDayColor: new Uniform(new Color("#00aaff")),
          uAtmosphereTwilightColor: new Uniform(new Color("#6f6f6f")),
          uNightLightIntensity: new Uniform(0.4),
          uCloudOpacity: new Uniform(0.8),
          uSpecularStrength: new Uniform(0.6),
          uNormalScale: new Uniform(1.0),
        },
      }),
    [dayMap, nightMap, cloudsMap, normalMap, specularMap]
  );

  const atmosphereMaterial = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        transparent: true,
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
      Surface: folder(
        {
          normalScale: { value: 1.0, min: 0, max: 3.0, step: 0.01 },
          cloudOpacity: { value: 0.8, min: 0, max: 1.0, step: 0.01 },
          specularStrength: { value: 0.6, min: 0, max: 2.0, step: 0.01 },
          nightLightIntensity: { value: 0.4, min: 0, max: 2.0, step: 0.01 },
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

    const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
    const anisotropy = Math.min(8, maxAnisotropy || 1);
    [dayMap, nightMap, cloudsMap, normalMap, specularMap].forEach((texture) => {
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    });
  }, [dayMap, gl, nightMap, cloudsMap, normalMap, specularMap]);

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

    earthMaterial.uniforms.uNormalScale.value = earthControls.normalScale;
    earthMaterial.uniforms.uCloudOpacity.value = earthControls.cloudOpacity;
    earthMaterial.uniforms.uSpecularStrength.value =
      earthControls.specularStrength;
    earthMaterial.uniforms.uNightLightIntensity.value =
      earthControls.nightLightIntensity;
    atmosphereMaterial.uniforms.uCloudOpacity.value =
      earthControls.cloudOpacity;

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

      <mesh
        geometry={geometry}
        scale={2.08}
        frustumCulled
        material={atmosphereMaterial}
      />
    </group>
  );
}
