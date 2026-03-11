import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { folder, useControls } from "leva";
import { useRef, useState } from "react";
import { KernelSize } from "postprocessing";
import * as THREE from "three";
import Earth2 from "./Earth2";
import Motherboard from "../entities/Motherboard";

export default function AboutScene() {
  const [particleBloomEnabled, setParticleBloomEnabled] = useState(false);
  const [bloomMix, setBloomMix] = useState(0);
  const bloomMixRef = useRef(0);
  const bloomControls = useControls(
    "About/Bloom",
    {
      Bloom: folder(
        {
          bloomFadeDuration: {
            value: 0.6,
            min: 0,
            max: 5,
            step: 0.01,
            label: "Fade duration",
          },
        },
        { collapsed: false }
      ),
    },
    { collapsed: false }
  );

  useFrame((_, delta) => {
    const target = particleBloomEnabled ? 1 : 0;
    const duration = Math.max(0, bloomControls.bloomFadeDuration);
    const fadeStep = duration === 0 ? 1 : delta / duration;
    const next =
      target > bloomMixRef.current
        ? Math.min(target, bloomMixRef.current + fadeStep)
        : Math.max(target, bloomMixRef.current - fadeStep);

    if (Math.abs(next - bloomMixRef.current) > 0.0005) {
      bloomMixRef.current = next;
      setBloomMix(next);
      return;
    }

    if (bloomMixRef.current !== target) {
      bloomMixRef.current = target;
      setBloomMix(target);
    }
  });

  return (
    <>
      <color attach="background" args={["#1a1a1a"]} />
      <PerspectiveCamera
        makeDefault
        position={[0, 1.5, 6]}
        fov={50}
        near={0.1}
        far={100}
      />

      <Motherboard />
      <Earth2 onParticleBloomChange={setParticleBloomEnabled} />

      {(particleBloomEnabled || bloomMix > 0.001) && (
        <EffectComposer
          multisampling={0}
          frameBufferType={THREE.HalfFloatType}
          depthBuffer={true}
        >
          <Bloom
            intensity={1.35 * bloomMix}
            luminanceThreshold={0.7}
            luminanceSmoothing={0.08}
            kernelSize={KernelSize.VERY_SMALL}
            resolutionScale={0.5}
          />
        </EffectComposer>
      )}

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        minDistance={0.1}
        maxDistance={Infinity}
        enableDamping
        dampingFactor={0.05}
        enablePan
        panSpeed={1}
        enableZoom
        zoomSpeed={1.2}
        screenSpacePanning
        enableRotate
        rotateSpeed={0.6}
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
      />
    </>
  );
}
