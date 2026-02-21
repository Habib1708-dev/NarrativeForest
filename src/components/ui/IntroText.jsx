import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useCameraStore } from "../../state/useCameraStore";
import { useSplineCameraStore } from "../../state/useSplineCameraStore";
import { USE_SPLINE_CAMERA } from "../../config";

// Reusable Vector3 to avoid per-frame allocations
const _displacement = new Vector3();

// Pre-computed constants (moved outside component to avoid re-computation)
const TITLE_TEXT = "Habib Khalaf";
const SUBTITLE_TEXT = "AI & Full Stack 3D Web Developer";
const TITLE_CHARS = TITLE_TEXT.split("");
const SUBTITLE_CHARS = SUBTITLE_TEXT.split("");
const TOTAL_CHARS = TITLE_TEXT.length + SUBTITLE_TEXT.length;
const CHAR_DELAY = 0.028;
const CHAR_DELAYS = Array.from({ length: TOTAL_CHARS }, (_, i) => i * CHAR_DELAY);
const ANIMATION_DISTANCE = 0.5;

// Pre-computed initial char states
const createInitialCharStates = () =>
  Array.from({ length: TOTAL_CHARS }, () => ({
    offset: 0,
    opacity: 1,
    scale: 1,
    blur: 0,
  }));

export default function IntroText() {
  const { camera } = useThree();
  const cameraModeRaw = useCameraStore((state) => state.mode);
  const splineModeRaw = useSplineCameraStore((state) => state.mode);
  const cameraMode = USE_SPLINE_CAMERA ? splineModeRaw : cameraModeRaw;
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [fadeInOpacity, setFadeInOpacity] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [shouldUnmount, setShouldUnmount] = useState(false);

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
      }, 800);
      return () => clearTimeout(unmountTimeout);
    }
  }, [cameraMode, shouldRender, isVisible]);

  // Handle 1 second delay and fade-in animation
  useEffect(() => {
    if (!shouldRender || isFadingOut) return;

    let delayTimeout;
    let fadeTimeout;

    delayTimeout = setTimeout(() => {
      setIsVisible(true);
      setFadeInOpacity(0);
      fadeTimeout = setTimeout(() => {
        setFadeInOpacity(1);
      }, 10);
    }, 1000);

    return () => {
      if (delayTimeout) clearTimeout(delayTimeout);
      if (fadeTimeout) clearTimeout(fadeTimeout);
    };
  }, [shouldRender, isFadingOut]);

  // Mutable per-character state (never triggers React re-renders)
  const charStatesRef = useRef(createInitialCharStates());

  // DOM refs for direct manipulation
  const spanRefsRef = useRef([]);

  // Track if animation has completed (all chars at opacity 0)
  const animationCompleteRef = useRef(false);

  // Callback ref collector for span elements
  const setSpanRef = useCallback((el, idx) => {
    if (el) spanRefsRef.current[idx] = el;
  }, []);

  // Store initial camera position and direction
  const initialCamPos = useRef(null);
  const initialCamDir = useRef(null);

  // Track last progress to avoid unnecessary updates
  const lastProgressRef = useRef(-1);

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

  // Memoize styles to avoid recreation on each render
  const baseStyle = useMemo(
    () => ({
      display: "inline-block",
      color: "#f9f9f9",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      willChange: "transform, opacity, filter",
    }),
    []
  );

  const titleCharStyle = useMemo(
    () => ({
      ...baseStyle,
      fontSize: "clamp(2rem, 4vw, 3.5rem)",
      fontWeight: "bold",
      textShadow: "0 0 10px rgba(0,0,0,0.5)",
    }),
    [baseStyle]
  );

  const subtitleCharStyle = useMemo(
    () => ({
      ...baseStyle,
      fontSize: "1rem",
      letterSpacing: "0.3em",
      color: "rgba(249, 249, 249, 0.85)",
      textShadow: "0 0 10px rgba(0,0,0,0.5)",
    }),
    [baseStyle]
  );

  useFrame(() => {
    // Early exit if animation is complete
    if (animationCompleteRef.current) return;
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

      const states = charStatesRef.current;
      let allComplete = true;

      for (let i = 0; i < TOTAL_CHARS; i++) {
        const delay = CHAR_DELAYS[i];
        const adjustedProgress = Math.max(0, progress - delay);
        const t = Math.min(1, adjustedProgress / ANIMATION_DISTANCE);

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

        // Track if any character hasn't completed
        if (opacity > 0.001) {
          allComplete = false;
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

          // Apply directly to DOM element
          const el = spanRefsRef.current[i];
          if (el) {
            el.style.transform = `translateY(-${offset}px) scale(${scale})`;
            el.style.opacity = opacity;
            el.style.filter = `blur(${blur}px)`;
          }
        }
      }

      // Mark animation as complete to stop useFrame calls
      if (allComplete) {
        animationCompleteRef.current = true;
      }
    } catch (error) {
      // Silently handle WebGL context loss during animation
    }
  });

  // Don't render if unmounting or conditions not met
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
          contain: "layout style paint",
        }}
      >
        {/* Title line */}
        <div style={{ whiteSpace: "nowrap" }}>
          {TITLE_CHARS.map((char, i) => (
            <span
              key={`title-${i}`}
              ref={(el) => setSpanRef(el, i)}
              style={titleCharStyle}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          ))}
        </div>
        {/* Subtitle line */}
        <div style={{ whiteSpace: "nowrap", marginTop: "-0.5rem" }}>
          {SUBTITLE_CHARS.map((char, i) => (
            <span
              key={`subtitle-${i}`}
              ref={(el) => setSpanRef(el, TITLE_TEXT.length + i)}
              style={subtitleCharStyle}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          ))}
        </div>
      </Html>
    </group>
  );
}
