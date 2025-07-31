import { Perf } from "r3f-perf";
import { OrbitControls } from "@react-three/drei";
import Terrain from "./components/Terrain";

export default function Experience() {
  return (
    <>
      <Perf position="top-left" />

      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI * 0.45}
        minDistance={5}
        maxDistance={50}
      />

      {/* Lights */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />

      <Terrain />
    </>
  );
}
