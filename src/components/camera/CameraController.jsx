import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { useNarrativeStore } from "../../state/useNarrativeStore";

export default function CameraController() {
  const controlsRef = useRef();
  const { camera } = useThree();
  const { step, isExplorationMode, waypoints } = useNarrativeStore();

  // Handle camera transitions when step changes
  useEffect(() => {
    if (!controlsRef.current || isExplorationMode) return;

    const waypoint = waypoints[step];
    if (!waypoint) return;

    controlsRef.current.setLookAt(
      ...waypoint.position,
      ...waypoint.lookAt,
      true // Enable smooth transition
    );
  }, [step, isExplorationMode, waypoints]);

  // Lock camera height in exploration mode
  useFrame(() => {
    if (isExplorationMode && camera.position.y !== 3) {
      camera.position.y = 3; // Slightly higher for better terrain view
    }
  });

  return (
    <CameraControls
      ref={controlsRef}
      enabled={isExplorationMode}
      maxPolarAngle={Math.PI * 0.4} // Allow more vertical viewing angle
      minDistance={2}
      maxDistance={60} // Adjusted for terrain viewing
      target={[0, 0, 0]} // Center on terrain
      enableDamping={true}
      dampingFactor={0.05}
      enablePan={true}
      panSpeed={0.5}
    />
  );
}
