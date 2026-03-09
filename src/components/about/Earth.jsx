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
import earthVertexShader from "../../shaders/aboutEarth/earthVertex.glsl";
import earthFragmentShader from "../../shaders/aboutEarth/earthFragment.glsl";
import atmosphereVertexShader from "../../shaders/aboutEarth/atmosphereVertex.glsl";
import atmosphereFragmentShader from "../../shaders/aboutEarth/atmosphereFragment.glsl";

const SEGMENTS = 128;

export default function Earth() {
  const earthRef = useRef(null);
  const { gl } = useThree();

  const [dayMap, nightMap, specularCloudsMap] = useTexture([
    "/textures/earth/tjg_day.jpg",
    "/textures/earth/tjg_night.jpg",
    "/textures/earth/tjg_specularClouds.jpg",
  ]);

  const geometry = useMemo(
    () => new SphereGeometry(1, SEGMENTS, SEGMENTS),
    []
  );
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
          uSpecularCloudsTexture: new Uniform(specularCloudsMap),
          uSunDirection: new Uniform(new Vector3(0, 0, 1)),
          uAtmosphereDayColor: new Uniform(new Color("#00aaff")),
          uAtmosphereTwilightColor: new Uniform(new Color("#ff6600")),
          uNightLightIntensity: new Uniform(0.4),
          uCloudOpacity: new Uniform(0.8),
          uSpecularStrength: new Uniform(0.6),
        },
      }),
    [dayMap, nightMap, specularCloudsMap]
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
          uAtmosphereTwilightColor: new Uniform(new Color("#ff6600")),
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
    "About Earth",
    {
      Atmosphere: folder(
        {
          atmosphereDayColor: { value: "#00aaff" },
          atmosphereTwilightColor: { value: "#ff6600" },
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
    },
    { collapsed: false }
  );

  useEffect(() => {
    dayMap.colorSpace = SRGBColorSpace;
    nightMap.colorSpace = SRGBColorSpace;
    specularCloudsMap.colorSpace = NoColorSpace;

    const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
    const anisotropy = Math.min(8, maxAnisotropy || 1);
    [dayMap, nightMap, specularCloudsMap].forEach((texture) => {
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    });
  }, [dayMap, gl, nightMap, specularCloudsMap]);

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
