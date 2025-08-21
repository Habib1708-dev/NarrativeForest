// App.jsx
import { Canvas } from "@react-three/fiber";
import Experience from "./Experience";

export default function App() {
  return (
    <Canvas
      // World camera (OrbitControls drives this)
      camera={{ position: [-1.8, -4.8, -5], fov: 50, near: 0.1, far: 8 }}
      shadows
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      {/* Keep if you need; otherwise remove to avoid double lights */}
      <ambientLight intensity={0} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={3}
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
