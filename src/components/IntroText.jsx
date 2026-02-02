import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useCameraStore } from "../state/useCameraStore";

// Reusable Vector3 to avoid per-frame allocations
const _displacement = new Vector3();

const TITLE_TEXT = "Habib Khalaf";
const SUBTITLE_TEXT = "AI & Full Stack 3D Web Developer";

export default function IntroText() {
  const { camera } = useThree();
  const cameraMode = useCameraStore((state) => state.mode);
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [fadeInOpacity, setFadeInOpacity] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [shouldUnmount, setShouldUnmount] = useState(false);

  // Total characters for both lines
  const totalChars = TITLE_TEXT.length + SUBTITLE_TEXT.length;

  // Listen for Explore button click event
  useEffect(() => {
    const handleExploreClick = () => {
      setShouldRender(true);
    };

    window.addEventListener("explore-button-clicked", handleExploreClick);

    // Check if event was already fired (for page refresh scenarios)
    if (typeof window !== "undefined" && window.__exploreButtonClicked) {
      setShouldRender(true);
    }

    return () => {
      window.removeEventListener("explore-button-clicked", handleExploreClick);
    };
  }, []);

  // Handle fade-out when entering freeFly mode
  useEffect(() => {
    if (cameraMode === "freeFly" && (shouldRender || isVisible)) {
      setIsFadingOut(true);
      setFadeInOpacity(0);
      // Unmount after fade-out animation completes
      const unmountTimeout = setTimeout(() => {
        setShouldUnmount(true);
      }, 800); // Match the fade-out transition duration
      return () => clearTimeout(unmountTimeout);
    }
  }, [cameraMode, shouldRender, isVisible]);

  // Handle 1 second delay and fade-in animation
  useEffect(() => {
    if (!shouldRender || isFadingOut) return;

    let delayTimeout;
    let fadeTimeout;

    // Wait 1 second before showing the text
    delayTimeout = setTimeout(() => {
      setIsVisible(true);
      // Start with opacity 0, then trigger fade-in after a tiny delay to ensure transition works
      setFadeInOpacity(0);
      fadeTimeout = setTimeout(() => {
        setFadeInOpacity(1);
      }, 10); // Small delay to ensure CSS transition is triggered
    }, 1000);

    return () => {
      if (delayTimeout) clearTimeout(delayTimeout);
      if (fadeTimeout) clearTimeout(fadeTimeout);
    };
  }, [shouldRender, isFadingOut]);

  // Mutable per-character state (never triggers React re-renders)
  const charStatesRef = useRef(
    Array(totalChars)
      .fill(null)
      .map(() => ({ offset: 0, opacity: 1, scale: 1, blur: 0 }))
  );

  // DOM refs for direct manipulation — one ref per character span
  const spanRefsRef = useRef([]);

  // Callback ref collector for span elements
  const setSpanRef = useCallback((el, idx) => {
    if (el) spanRefsRef.current[idx] = el;
  }, []);

  // Store initial camera position and direction
  const initialCamPos = useRef(null);
  const initialCamDir = useRef(null);

  // Track last progress to avoid unnecessary updates
  const lastProgressRef = useRef(-1);

  // Staggered delays for each character (like the CSS animation-delay)
  const CHAR_DELAY = 0.028; // ~28ms converted to distance units
  const charDelays = useRef(
    Array(totalChars)
      .fill(null)
      .map((_, i) => i * CHAR_DELAY)
  );

  // Calculate the position once at mount (static, not sticky)
  const position = useMemo(() => {
    if (!camera) return null;
    try {
      const direction = new Vector3();
      camera.getWorldDirection(direction).normalize();
      initialCamDir.current = direction.clone();
      initialCamPos.current = camera.position.clone();
      return camera.position.clone().add(direction.clone().multiplyScalar(2));
    } catch (error) {
      return null;
    }
  }, [camera]);

  useFrame(() => {
    if (!camera || !initialCamPos.current || !initialCamDir.current) return;

    try {
      // Calculate forward movement using reusable Vector3
      _displacement.subVectors(camera.position, initialCamPos.current);
      const forwardDistance = _displacement.dot(initialCamDir.current);

      // Only trigger on forward movement (positive distance)
      const progress = Math.max(0, forwardDistance);

      // Skip update if progress hasn't changed significantly
      if (Math.abs(progress - lastProgressRef.current) < 0.001) return;
      lastProgressRef.current = progress;

      const animationDistance = 0.5; // Distance over which the animation plays
      const states = charStatesRef.current;

      for (let i = 0; i < charDelays.current.length; i++) {
        const delay = charDelays.current[i];
        // Adjust progress based on staggered delay
        const adjustedProgress = Math.max(0, progress - delay);
        const t = Math.min(1, adjustedProgress / animationDistance);

        // Match the CSS keyframes easing (ease-out curve)
        const eased = 1 - Math.pow(1 - t, 2);

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

        // Check if values changed before mutating
        const state = states[i];
        if (
          Math.abs(state.offset - offset) > 0.01 ||
          Math.abs(state.opacity - opacity) > 0.01
        ) {
          state.offset = offset;
          state.opacity = opacity;
          state.scale = scale;
          state.blur = blur;

          // Apply directly to DOM element — no React re-render needed
          const el = spanRefsRef.current[i];
          if (el) {
            el.style.transform = `translateY(-${offset}px) scale(${scale})`;
            el.style.opacity = opacity;
            el.style.filter = `blur(${blur}px)`;
          }
        }
      }
    } catch (error) {
      // Silently handle WebGL context loss during animation
    }
  });

  const baseStyle = {
    display: "inline-block",
    color: "#f9f9f9",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };

  // Don't render if unmounting or if Explore button hasn't been clicked and delay hasn't passed
  if (shouldUnmount || !shouldRender || !isVisible || !camera || !position) {
    return null;
  }

  return (
    <group position={position} quaternion={camera.quaternion.clone()}>
      <Html
        center
        transform={false}
        zIndexRange={[100, 0]}
        style={{
          pointerEvents: "none",
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5rem",
          position: "relative",
          opacity: fadeInOpacity,
          transition: "opacity 800ms ease-in",
        }}
      >
        {/* Title line */}
        <div style={{ whiteSpace: "nowrap" }}>
          {TITLE_TEXT.split("").map((char, i) => (
            <span
              key={`title-${i}`}
              ref={(el) => setSpanRef(el, i)}
              style={{
                ...baseStyle,
                fontSize: "clamp(2rem, 4vw, 3.5rem)",
                fontWeight: "bold",
                textShadow: "0 0 10px rgba(0,0,0,0.5)",
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
              ref={(el) => setSpanRef(el, TITLE_TEXT.length + i)}
              style={{
                ...baseStyle,
                fontSize: "1rem",
                letterSpacing: "0.3em",
                color: "rgba(249, 249, 249, 0.85)",
                textShadow: "0 0 10px rgba(0,0,0,0.5)",
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
