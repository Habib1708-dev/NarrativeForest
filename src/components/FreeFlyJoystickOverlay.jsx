import { useMemo } from "react";
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

  if (mode !== "freeFly" || !freeFly?.dragging || !styles) return null;

  return (
    <div style={styles.outer}>
      <div style={styles.inner} />
    </div>
  );
}
