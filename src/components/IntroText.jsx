import { useMemo, useState, useRef } from "react";
import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

const TITLE_TEXT = "Habib Khalaf";
const SUBTITLE_TEXT = "AI & Full Stack 3D Web Developer";

export default function IntroText() {
  const { camera } = useThree();

  // Total characters for both lines
  const totalChars = TITLE_TEXT.length + SUBTITLE_TEXT.length;

  const [charStates, setCharStates] = useState(
    // Each char: { offset, opacity, scale, blur }
    Array(totalChars)
      .fill(null)
      .map(() => ({ offset: 0, opacity: 1, scale: 1, blur: 0 }))
  );

  // Store initial camera position and direction
  const initialCamPos = useRef(null);
  const initialCamDir = useRef(null);

  // Staggered delays for each character (like the CSS animation-delay)
  const CHAR_DELAY = 0.028; // ~28ms converted to distance units
  const charDelays = useRef(
    Array(totalChars)
      .fill(null)
      .map((_, i) => i * CHAR_DELAY)
  );

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

  // Split states for title and subtitle
  const titleStates = charStates.slice(0, TITLE_TEXT.length);
  const subtitleStates = charStates.slice(TITLE_TEXT.length);

  const baseStyle = {
    display: "inline-block",
    color: "#f9f9f9",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };

  return (
    <group position={position} quaternion={camera.quaternion.clone()}>
      <Html
        center
        transform={false}
        style={{
          pointerEvents: "none",
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5rem",
          position: "relative",
        }}
      >
        {/* Title line */}
        <div style={{ whiteSpace: "nowrap" }}>
          {TITLE_TEXT.split("").map((char, i) => (
            <span
              key={`title-${i}`}
              style={{
                ...baseStyle,
                fontSize: "clamp(2rem, 4vw, 3.5rem)",
                fontWeight: "bold",
                textShadow: "0 0 10px rgba(0,0,0,0.5)",
                transform: `translateY(-${
                  titleStates[i]?.offset || 0
                }px) scale(${titleStates[i]?.scale || 1})`,
                opacity: titleStates[i]?.opacity ?? 1,
                filter: `blur(${titleStates[i]?.blur || 0}px)`,
              }}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          ))}
        </div>
        {/* Subtitle line */}
        <div style={{ whiteSpace: "nowrap", marginTop: "-0.5rem" }}>
          {SUBTITLE_TEXT.split("").map((char, i) => (
            <span
              key={`subtitle-${i}`}
              style={{
                ...baseStyle,
                fontSize: "1rem",
                letterSpacing: "0.3em",
                color: "rgba(249, 249, 249, 0.85)",
                textShadow: "0 0 10px rgba(0,0,0,0.5)",
                transform: `translateY(-${
                  subtitleStates[i]?.offset || 0
                }px) scale(${subtitleStates[i]?.scale || 1})`,
                opacity: subtitleStates[i]?.opacity ?? 1,
                filter: `blur(${subtitleStates[i]?.blur || 0}px)`,
              }}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          ))}
        </div>
      </Html>
    </group>
  );
}
