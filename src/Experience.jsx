import { Perf } from "r3f-perf";
import { OrbitControls } from "@react-three/drei";
import Terrain from "./components/Terrain";

export default function Experience() {
  return (
    <>
      <Perf position="top-left" />

      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI * 0.4} // Allow more vertical viewing angle
        minDistance={3}
        maxDistance={80} // Increased for better overview of the terrain
        target={[0, 0, 0]} // Center the camera on the terrain
        enableDamping={true}
        dampingFactor={0.05}
        enablePan={true}
        panSpeed={0.5}
      />

      {/* Lights */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      <Terrain />
    </>
  );
}
