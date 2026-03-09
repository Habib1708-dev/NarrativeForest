import { OrbitControls, PerspectiveCamera } from "@react-three/drei";

export default function AboutScene() {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.5, 8]} fov={50} near={0.1} far={100} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 6]} intensity={1.1} />

      <mesh castShadow receiveShadow>
        <sphereGeometry args={[2, 64, 64]} />
        <meshStandardMaterial color="#5f94ff" roughness={0.55} metalness={0.1} />
      </mesh>

      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
}
