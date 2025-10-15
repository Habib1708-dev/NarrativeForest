import { useEffect, useMemo, useRef, useState } from "react";
import { useCameraStore } from "../state/useCameraStore";

export default function FreeFlyJoystickOverlay() {
  const mode = useCameraStore((s) => s.mode);
  const freeFly = useCameraStore((s) => s.freeFly);
  const radius = useCameraStore((s) => s.freeFlyJoystickRadius ?? 120);
  const innerScale = useCameraStore((s) => s.freeFlyJoystickInnerScale ?? 0.35);

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
    border: "1px solid rgba(255,255,255,0.22)",
    background:
      "linear-gradient(140deg, rgba(28,32,44,0.62), rgba(16,20,30,0.4))",
    boxShadow: "0 18px 44px rgba(14,18,32,0.38)",
    backdropFilter: "blur(14px)",
    opacity: visible ? 1 : 0,
    transform: visible ? "scale(1)" : "scale(0.9)",
    transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
  };

  const baseInnerTransform = activeStyles.inner.transform ?? "translateZ(0)";
  const innerStyle = {
    ...activeStyles.inner,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(255,255,255,0.55)",
    boxShadow: "0 12px 32px rgba(18,24,46,0.35)",
    opacity: visible ? 1 : 0,
    transform: `${baseInnerTransform} ${visible ? "scale(1)" : "scale(0.82)"}`,
    transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
  };

  return (
    <div style={outerStyle}>
      <div style={innerStyle} />
    </div>
  );
}
