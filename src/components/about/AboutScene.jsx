import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import Earth2 from "./Earth2";
import Motherboard from "../entities/Motherboard";

export default function AboutScene() {
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
      <Earth2 />

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
