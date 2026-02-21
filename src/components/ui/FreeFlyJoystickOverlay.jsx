import { useEffect, useMemo, useRef, useState } from "react";
import { useCameraStore } from "../../state/useCameraStore";
import { useSplineCameraStore } from "../../state/useSplineCameraStore";
import { USE_SPLINE_CAMERA } from "../../config";

export default function FreeFlyJoystickOverlay() {
  const cameraMode = useCameraStore((s) => s.mode);
  const cameraFreeFly = useCameraStore((s) => s.freeFly);
  const cameraRadius = useCameraStore((s) => s.freeFlyJoystickRadius ?? 80);
  const cameraInnerScale = useCameraStore((s) => s.freeFlyJoystickInnerScale ?? 0.35);

  const splineMode = useSplineCameraStore((s) => s.mode);
  const splineFreeFly = useSplineCameraStore((s) => s.freeFly);
  const splineRadius = useSplineCameraStore((s) => s.freeFlyJoystickRadius ?? 80);
  const splineInnerScale = useSplineCameraStore((s) => s.freeFlyJoystickInnerScale ?? 0.35);

  const mode = USE_SPLINE_CAMERA ? splineMode : cameraMode;
  const freeFly = USE_SPLINE_CAMERA ? splineFreeFly : cameraFreeFly;
  const baseRadius = USE_SPLINE_CAMERA ? splineRadius : cameraRadius;
  const innerScale = USE_SPLINE_CAMERA ? splineInnerScale : cameraInnerScale;

  // Calculate responsive radius based on screen size
  const [radius, setRadius] = useState(baseRadius);

  useEffect(() => {
    const updateRadius = () => {
      const width = window.innerWidth;
      // Scale down on smaller screens
      if (width < 480) {
        setRadius(baseRadius * 0.65); // 65% on small phones
      } else if (width < 768) {
        setRadius(baseRadius * 0.8); // 80% on tablets/large phones
      } else {
        setRadius(baseRadius); // Full size on desktop
      }
    };

    updateRadius();
    window.addEventListener("resize", updateRadius);
    return () => window.removeEventListener("resize", updateRadius);
  }, [baseRadius]);

  const styles = useMemo(() => {
    if (!freeFly?.joystick?.origin) return null;
    const origin = freeFly.joystick.origin;
    const input = freeFly.joystick.input ?? { x: 0, y: 0 };
    const outerSize = radius * 2;
    const innerRadius = Math.max(6, innerScale * radius);
    return {
      origin,
      input,
      outer: {
        position: "fixed",
        left: origin.x - radius,
        top: origin.y - radius,
        width: outerSize,
        height: outerSize,
        borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.65)",
        background: "rgba(20, 24, 32, 0.35)",
        backdropFilter: "blur(6px)",
        pointerEvents: "none",
        zIndex: 1000,
      },
      inner: {
        position: "absolute",
        left: radius + input.x - innerRadius,
        top: radius + input.y - innerRadius,
        width: innerRadius * 2,
        height: innerRadius * 2,
        borderRadius: "50%",
        background: "rgba(95, 189, 255, 0.6)",
        boxShadow: "0 0 12px rgba(95,189,255,0.7)",
        transform: "translateZ(0)",
      },
    };
  }, [freeFly?.joystick?.origin, freeFly?.joystick?.input, radius, innerScale]);

  const FADE_MS = 220;
  const dragging = !!freeFly?.dragging;
  const [activeStyles, setActiveStyles] = useState(null);
  const [visible, setVisible] = useState(false);
  const fadeTimeoutRef = useRef(null);

  useEffect(() => {
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }

    const shouldShow = mode === "freeFly" && dragging && styles;
    if (shouldShow) {
      if (!activeStyles) {
        setVisible(false);
      }
      setActiveStyles(styles);
    } else if (activeStyles) {
      setVisible(false);
      fadeTimeoutRef.current = setTimeout(() => {
        setActiveStyles(null);
        fadeTimeoutRef.current = null;
      }, FADE_MS);
    } else {
      setVisible(false);
    }

    return () => {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
    };
  }, [mode, dragging, styles, activeStyles]);

  useEffect(() => {
    if (!activeStyles) return undefined;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [activeStyles]);

  if (!activeStyles) return null;

  const outerStyle = {
    ...activeStyles.outer,
    border: "1px solid rgba(255, 255, 255, 0.18)",
    background:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))",
    boxShadow:
      "0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    opacity: visible ? 1 : 0,
    transform: visible ? "scale(1)" : "scale(0.9)",
    transition: `opacity ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
  };

  const baseInnerTransform = activeStyles.inner.transform ?? "translateZ(0)";
  const innerStyle = {
    ...activeStyles.inner,
    background:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.45))",
    border: "1px solid rgba(255, 255, 255, 0.3)",
    boxShadow:
      "0 4px 16px rgba(255, 255, 255, 0.2), 0 8px 24px rgba(0, 0, 0, 0.15)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    opacity: visible ? 1 : 0,
    transform: `${baseInnerTransform} ${visible ? "scale(1)" : "scale(0.82)"}`,
    transition: `opacity ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
  };

  return (
    <div style={outerStyle}>
      <div style={innerStyle} />
    </div>
  );
}
