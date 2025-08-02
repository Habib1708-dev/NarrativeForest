import { Perf } from "r3f-perf";
import { OrbitControls, Sky } from "@react-three/drei";
import Terrain from "./components/Terrain";
import Tree from "./components/Tree";
import { useControls, folder } from "leva";
import { useRef } from "react";
import * as THREE from "three";

export default function Experience() {
  const skyRef = useRef();

  // Add controls for fog and sky
  const { sunPosition } = useControls({
    Atmosphere: folder({
      sunPosition: { value: [1, 0.3, 2], step: 0.1 },
    }),
  });

  return (
    <>
      <Perf position="top-left" />

      {/* Add Sky with sunset preset */}
      <Sky
        ref={skyRef}
        sunPosition={sunPosition}
        inclination={0.1} // Low sun for sunset effect
        azimuth={0.25}
        distance={450000}
        rayleigh={2}
        turbidity={10}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      <OrbitControls
        makeDefault
        // Remove restrictions on polar angle to allow complete freedom
        // maxPolarAngle={Math.PI * 0.4} - removed this restriction
        minDistance={1} // Allow getting closer
        maxDistance={200} // Allow getting farther
        target={[0, 0, 0]}
        enableDamping={true}
        dampingFactor={0.05}
        enablePan={true}
        panSpeed={0.5}
        // Additional settings for more freedom
        screenSpacePanning={true}
        rotateSpeed={0.5}
      />

      {/* Adjust lights to match sunset atmosphere */}
      <ambientLight intensity={0.4} color="#ffe0cc" />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.2}
        color="#ff9966"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      <Terrain />
      <Tree position={[0, 1, 0]} rotation={[0, Math.PI / 4, 0]} scale={1.5} />
    </>
  );
}
