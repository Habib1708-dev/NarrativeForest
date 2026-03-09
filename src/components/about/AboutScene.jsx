import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import Earth2 from "./Earth2";

export default function AboutScene() {
  return (
    <>
      <color attach="background" args={["#02040a"]} />
      <PerspectiveCamera
        makeDefault
        position={[0, 1.5, 6]}
        fov={50}
        near={0.1}
        far={100}
      />

      <Earth2 />

      <OrbitControls enablePan={false} enableZoom enableRotate />
    </>
  );
}
