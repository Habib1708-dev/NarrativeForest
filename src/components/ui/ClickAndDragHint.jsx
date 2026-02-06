import { useEffect, useState, useRef } from "react";
import { useCameraStore } from "../../state/useCameraStore";

/**
 * Click and Drag Hint Overlay
 * Shows when entering free-fly mode to instruct users how to navigate.
 * Uses store flag to track if user has dragged, allowing proper scroll-back behavior.
 */
export default function ClickAndDragHint() {
  const mode = useCameraStore((state) => state.mode);
  const t = useCameraStore((state) => state.t);
  const freeFlyUserHasDragged = useCameraStore(
    (state) => state.freeFlyUserHasDragged
  );
  const [isVisible, setIsVisible] = useState(false);
  const autoHideTimeoutRef = useRef(null);

  useEffect(() => {
    // Show hint only when entering free-fly at the end of scroll path,
    // and only until the user actually drag-interacts.
    const isAtEnd = typeof t === "number" ? t >= 0.999 : false;
    if (mode === "freeFly" && isAtEnd && !freeFlyUserHasDragged) {
      setIsVisible(true);
    } else if (mode !== "freeFly" || freeFlyUserHasDragged || !isAtEnd) {
      // Hide when leaving freeflight or when user has dragged
      setIsVisible(false);
    }
  }, [mode, t, freeFlyUserHasDragged]);

  useEffect(() => {
    if (!isVisible) {
      // Clear any pending timeout when not visible
      if (autoHideTimeoutRef.current) {
        clearTimeout(autoHideTimeoutRef.current);
        autoHideTimeoutRef.current = null;
      }
      return;
    }

    // Auto-hide after 5 seconds
    autoHideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 5000);

    return () => {
      if (autoHideTimeoutRef.current) {
        clearTimeout(autoHideTimeoutRef.current);
        autoHideTimeoutRef.current = null;
      }
    };
  }, [isVisible]);

  // Don't show if not in freeflight mode or if user has already interacted
  const isAtEnd = typeof t === "number" ? t >= 0.999 : false;
  if (!isVisible || mode !== "freeFly" || !isAtEnd || freeFlyUserHasDragged)
    return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 9998,
        animation: "fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "clamp(24px, 4vw, 32px)",
          padding: "clamp(32px, 6vw, 48px) clamp(40px, 8vw, 64px)",
          background:
            "linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderRadius: "24px",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          boxShadow:
            "0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
          position: "relative",
          overflow: "hidden",
          maxWidth: "90vw",
        }}
      >
        {/* Subtle gradient overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(circle at 50% 0%, rgba(100, 200, 255, 0.08), transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Modern Animated Icon */}
        <div
          style={{
            position: "relative",
            width: "clamp(80px, 15vw, 120px)",
            height: "clamp(80px, 15vw, 120px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Outer glow ring */}
          <div
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(100, 200, 255, 0.15), transparent 70%)",
              animation: "pulseGlow 3s ease-in-out infinite",
            }}
          />

          {/* Primary circle */}
          <div
            style={{
              position: "absolute",
              width: "clamp(60px, 10vw, 80px)",
              height: "clamp(60px, 10vw, 80px)",
              borderRadius: "50%",
              border: "2px solid rgba(100, 200, 255, 0.4)",
              animation: "breathe 2s ease-in-out infinite",
            }}
          />

          {/* Secondary circle */}
          <div
            style={{
              position: "absolute",
              width: "clamp(48px, 8vw, 64px)",
              height: "clamp(48px, 8vw, 64px)",
              borderRadius: "50%",
              border: "1.5px solid rgba(100, 200, 255, 0.3)",
              animation: "breathe 2s ease-in-out infinite 0.3s",
            }}
          />

          {/* Modern cursor icon */}
          <svg
            width="clamp(28px, 5vw, 40px)"
            height="clamp(28px, 5vw, 40px)"
            viewBox="0 0 24 24"
            style={{
              position: "relative",
              zIndex: 1,
              animation: "cursorMove 2.5s ease-in-out infinite",
              filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))",
            }}
          >
            <path
              d="M7 4L7 20L12 16L14.5 19.5L16.5 18.5L14 15L19 14L7 4Z"
              fill="rgba(255, 255, 255, 0.9)"
              stroke="rgba(100, 200, 255, 0.6)"
              strokeWidth="0.5"
            />
          </svg>

          {/* Drag trail effect */}
          <div
            style={{
              position: "absolute",
              width: "clamp(24px, 4vw, 32px)",
              height: "2px",
              background:
                "linear-gradient(90deg, transparent, rgba(100, 200, 255, 0.6), transparent)",
              animation: "trailSlide 2.5s ease-in-out infinite",
              borderRadius: "1px",
            }}
          />

          {/* Subtle dots */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                width: "clamp(3px, 0.5vw, 4px)",
                height: "clamp(3px, 0.5vw, 4px)",
                borderRadius: "50%",
                background: "rgba(100, 200, 255, 0.5)",
                animation: `dotFloat 2.5s ease-in-out infinite ${i * 0.2}s`,
              }}
            />
          ))}
        </div>

        {/* Text Instructions */}
        <div
          style={{
            textAlign: "center",
            color: "white",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: "clamp(18px, 3vw, 24px)",
              fontWeight: "300",
              fontFamily:
                "'Inter', 'SF Pro Display', system-ui, -apple-system, sans-serif",
              marginBottom: "8px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              background:
                "linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.7))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Click & Drag
          </div>
          <div
            style={{
              fontSize: "clamp(12px, 2vw, 14px)",
              fontWeight: "300",
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              color: "rgba(255, 255, 255, 0.6)",
              letterSpacing: "0.5px",
            }}
          >
            Navigate freely through the scene
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: scale(0.96) translateY(-10px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }

          @keyframes pulseGlow {
            0%, 100% {
              transform: scale(1);
              opacity: 0.3;
            }
            50% {
              transform: scale(1.15);
              opacity: 0.6;
            }
          }

          @keyframes breathe {
            0%, 100% {
              transform: scale(1);
              opacity: 0.4;
            }
            50% {
              transform: scale(1.08);
              opacity: 0.7;
            }
          }

          @keyframes cursorMove {
            0%, 100% {
              transform: translate(0, 0);
            }
            25% {
              transform: translate(0, 0) scale(0.95);
            }
            50% {
              transform: translate(20px, -15px) scale(1);
            }
            75% {
              transform: translate(10px, -7px);
            }
          }

          @keyframes trailSlide {
            0%, 25% {
              transform: translate(-60px, -45px) rotate(35deg) scaleX(0);
              opacity: 0;
            }
            40% {
              opacity: 0.8;
            }
            50% {
              transform: translate(15px, -12px) rotate(35deg) scaleX(1);
              opacity: 1;
            }
            65% {
              opacity: 0.4;
            }
            75%, 100% {
              transform: translate(25px, -18px) rotate(35deg) scaleX(0.5);
              opacity: 0;
            }
          }

          @keyframes dotFloat {
            0%, 25%, 100% {
              transform: translate(-50px, -38px);
              opacity: 0;
            }
            35% {
              opacity: 0.8;
            }
            50% {
              transform: translate(10px, -8px);
              opacity: 1;
            }
            65% {
              transform: translate(18px, -12px);
              opacity: 0.6;
            }
            75% {
              opacity: 0;
            }
          }
        `}
      </style>
    </div>
  );
}
