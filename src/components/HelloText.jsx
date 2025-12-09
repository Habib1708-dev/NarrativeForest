import { useMemo, useState, useRef } from "react";
import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

export default function HelloText() {
  const { camera } = useThree();
  const [charStates, setCharStates] = useState(
    // Each char: { offset, opacity, scale, blur }
    [0, 1, 2, 3, 4].map(() => ({ offset: 0, opacity: 1, scale: 1, blur: 0 }))
  );

  // Store initial camera position and direction
  const initialCamPos = useRef(null);
  const initialCamDir = useRef(null);

  // Staggered delays for each character (like the CSS animation-delay)
  const CHAR_DELAY = 0.028; // ~28ms converted to distance units
  const charDelays = useRef([0, 1, 2, 3, 4].map((i) => i * CHAR_DELAY));

  // Calculate the position once at mount (static, not sticky)
  const position = useMemo(() => {
    const direction = new Vector3();
    camera.getWorldDirection(direction).normalize();
    initialCamDir.current = direction.clone();
    initialCamPos.current = camera.position.clone();
    return camera.position.clone().add(direction.clone().multiplyScalar(2));
  }, []);

  useFrame(() => {
    if (!initialCamPos.current || !initialCamDir.current) return;

    // Calculate forward movement (dot product with initial direction)
    const displacement = new Vector3().subVectors(
      camera.position,
      initialCamPos.current
    );
    const forwardDistance = displacement.dot(initialCamDir.current);

    // Only trigger on forward movement (positive distance)
    const progress = Math.max(0, forwardDistance);
    const animationDistance = 0.5; // Distance over which the animation plays

    // Calculate per-character states matching sticky-evaporate keyframes
    const newStates = charDelays.current.map((delay) => {
      // Adjust progress based on staggered delay
      const adjustedProgress = Math.max(0, progress - delay);
      const t = Math.min(1, adjustedProgress / animationDistance);

      // Match the CSS keyframes easing (ease-out curve)
      const eased = 1 - Math.pow(1 - t, 2);

      // At 0%: opacity 1, translateY 0, scale 1, blur 0
      // At 60%: opacity 0.4, translateY -8px, scale 0.98, blur 1px
      // At 100%: opacity 0, translateY -16px, scale 0.96, blur 2px

      let opacity, offset, scale, blur;

      if (eased <= 0.6) {
        // 0% to 60%
        const subT = eased / 0.6;
        opacity = 1 - 0.6 * subT;
        offset = 8 * subT;
        scale = 1 - 0.02 * subT;
        blur = 1 * subT;
      } else {
        // 60% to 100%
        const subT = (eased - 0.6) / 0.4;
        opacity = 0.4 - 0.4 * subT;
        offset = 8 + 8 * subT;
        scale = 0.98 - 0.02 * subT;
        blur = 1 + 1 * subT;
      }

      return { offset, opacity, scale, blur };
    });

    setCharStates(newStates);
  });

  const text = "Hello";

  return (
    <group position={position} quaternion={camera.quaternion.clone()}>
      <Html
        center
        transform={false}
        style={{
          pointerEvents: "none",
          userSelect: "none",
          display: "flex",
        }}
      >
        {text.split("").map((char, i) => (
          <span
            key={i}
            style={{
              color: "#ffffff",
              fontSize: "3rem",
              fontWeight: "bold",
              fontFamily: "sans-serif",
              textShadow: "0 0 10px rgba(0,0,0,0.5)",
              transform: `translateY(-${charStates[i].offset}px) scale(${charStates[i].scale})`,
              opacity: charStates[i].opacity,
              filter: `blur(${charStates[i].blur}px)`,
            }}
          >
            {char}
          </span>
        ))}
      </Html>
    </group>
  );
}
