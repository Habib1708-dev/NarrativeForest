// App.jsx
import { Canvas } from "@react-three/fiber";
import Experience from "./Experience";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

export default function App() {
  return (
    <Canvas
      // World camera (OrbitControls drives this)
      camera={{ position: [-1.8, -4.8, -5], fov: 50, near: 0.1, far: 2000 }}
      shadows
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      <Experience />
    </Canvas>
  );
}
