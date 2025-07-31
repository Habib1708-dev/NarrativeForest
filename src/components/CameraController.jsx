import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { useNarrativeStore } from "../state/useNarrativeStore";

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
    if (isExplorationMode && camera.position.y !== 2) {
      camera.position.y = 2;
    }
  });

  return (
    <CameraControls
      ref={controlsRef}
      enabled={isExplorationMode}
      maxPolarAngle={Math.PI / 2} // Prevent looking below ground
      minDistance={1}
      maxDistance={20}
    />
  );
}
