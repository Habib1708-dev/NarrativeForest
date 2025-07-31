import { Canvas } from "@react-three/fiber";
import Experience from "./Experience";

export default function App() {
  return (
    <Canvas camera={{ position: [3, 2, 5], fov: 50 }} shadows>
      <color attach="background" args={["#202025"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow />

      <Experience />
    </Canvas>
  );
}
