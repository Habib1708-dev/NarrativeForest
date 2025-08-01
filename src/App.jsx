import { Canvas } from "@react-three/fiber";
import Experience from "./Experience";

export default function App() {
  return (
    <Canvas camera={{ position: [5, 30, 25], fov: 50 }} shadows>
      <color attach="background" args={["#87CEEB"]} />{" "}
      {/* Sky blue background */}
      <fog attach="fog" args={["#87CEEB", 100, 500]} />{" "}
      {/* Add fog for distance fading */}
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={500}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
      />
      <Experience />
    </Canvas>
  );
}
