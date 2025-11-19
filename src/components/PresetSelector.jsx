import { useState, useEffect, useRef } from "react";
import { useCameraStore } from "../state/useCameraStore";

/**
 * Preset Selector Component
 * A glassmorphic floating chip that expands into a preset selection panel
 * Appears only in free-fly mode
 */
export default function PresetSelector({
  presets,
  currentPreset,
  onPresetChange,
}) {
  const mode = useCameraStore((state) => state.mode);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const panelRef = useRef(null);

  // Show/hide based on free-fly mode
  useEffect(() => {
    if (mode === "freeFly") {
      setIsVisible(true);
    } else {
      setIsOpen(false);
      setIsVisible(false);
    }
  }, [mode]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close panel on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handlePresetSelect = (presetName) => {
    onPresetChange(presetName);
    // Close panel with slight delay for visual feedback
    setTimeout(() => setIsOpen(false), 200);
  };

  if (!isVisible) return null;

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: "clamp(16px, 3vh, 24px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9997,
        fontFamily:
          "'Inter', 'SF Pro Display', system-ui, -apple-system, sans-serif",
        pointerEvents: "auto", // Enable pointer events to capture clicks
      }}
    >
      {/* Chip Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        onPointerDown={(e) => e.stopPropagation()} // Prevent joystick activation
        onTouchStart={(e) => e.stopPropagation()} // Prevent joystick activation on touch
        style={{
          display: "flex",
          alignItems: "center",
          gap: "clamp(8px, 1.5vw, 12px)",
          padding: "clamp(10px, 2vh, 14px) clamp(16px, 3vw, 24px)",
          background:
            "linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06))",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: "100px",
          boxShadow:
            "0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)",
          color: "rgba(255, 255, 255, 0.9)",
          fontSize: "clamp(13px, 2vw, 15px)",
          fontWeight: "500",
          letterSpacing: "0.3px",
          cursor: "pointer",
          transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          outline: "none",
          position: "relative",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background =
            "linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.1))";
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow =
            "0 12px 40px 0 rgba(0, 0, 0, 0.42), inset 0 1px 0 0 rgba(255, 255, 255, 0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            "linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06))";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow =
            "0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)";
        }}
      >
        <span>Atmosphere</span>

        {/* Chevron */}
        <svg
          width="clamp(14px, 2vw, 16px)"
          height="clamp(14px, 2vw, 16px)"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            opacity: 0.7,
          }}
        >
          <path
            d="M6 9L12 15L18 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Expanded Panel */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + clamp(8px, 1.5vh, 12px))",
            left: "50%",
            transform: "translateX(-50%)",
            minWidth: "clamp(240px, 40vw, 320px)",
            maxWidth: "90vw",
            maxHeight: "70vh",
            overflowY: "auto",
            background:
              "linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            borderRadius: "16px",
            boxShadow:
              "0 16px 48px 0 rgba(0, 0, 0, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
            padding: "clamp(8px, 1.5vh, 12px)",
            animation: "dropdownSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Preset Options */}
          {presets.map((preset) => {
            const isSelected = preset === currentPreset;
            return (
              <button
                key={preset}
                onClick={() => handlePresetSelect(preset)}
                onPointerDown={(e) => e.stopPropagation()} // Prevent joystick activation
                onTouchStart={(e) => e.stopPropagation()} // Prevent joystick activation on touch
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "clamp(10px, 2vw, 14px)",
                  padding: "clamp(12px, 2vh, 16px) clamp(14px, 2.5vw, 18px)",
                  background: isSelected
                    ? "linear-gradient(135deg, rgba(100, 200, 255, 0.2), rgba(100, 200, 255, 0.1))"
                    : "transparent",
                  border: "none",
                  borderRadius: "12px",
                  color: "rgba(255, 255, 255, 0.9)",
                  fontSize: "clamp(13px, 2vw, 15px)",
                  fontWeight: isSelected ? "600" : "400",
                  letterSpacing: "0.2px",
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  textAlign: "left",
                  outline: "none",
                  marginBottom: "clamp(4px, 0.8vh, 6px)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                {/* Radio indicator */}
                <div
                  style={{
                    width: "clamp(16px, 2.5vw, 20px)",
                    height: "clamp(16px, 2.5vw, 20px)",
                    borderRadius: "50%",
                    border: "2px solid rgba(255, 255, 255, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(100, 200, 255, 0.3), rgba(100, 200, 255, 0.2))"
                      : "transparent",
                    transition: "all 0.2s ease",
                  }}
                >
                  {isSelected && (
                    <div
                      style={{
                        width: "clamp(8px, 1.2vw, 10px)",
                        height: "clamp(8px, 1.2vw, 10px)",
                        borderRadius: "50%",
                        background: "rgba(100, 200, 255, 0.9)",
                        boxShadow: "0 0 8px rgba(100, 200, 255, 0.6)",
                      }}
                    />
                  )}
                </div>

                <span style={{ flex: 1 }}>{preset}</span>

                {/* Check icon for selected */}
                {isSelected && (
                  <svg
                    width="clamp(16px, 2.5vw, 18px)"
                    height="clamp(16px, 2.5vw, 18px)"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{
                      animation: "checkFade 0.3s ease",
                    }}
                  >
                    <path
                      d="M20 6L9 17L4 12"
                      stroke="rgba(100, 200, 255, 0.9)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* CSS Animations */}
      <style>
        {`
          @keyframes dropdownSlide {
            from {
              opacity: 0;
              transform: translateX(-50%) translateY(-8px);
            }
            to {
              opacity: 1;
              transform: translateX(-50%) translateY(0);
            }
          }

          @keyframes checkFade {
            from {
              opacity: 0;
              transform: scale(0.8);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          /* Custom scrollbar for preset panel */
          div::-webkit-scrollbar {
            width: 6px;
          }

          div::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 3px;
          }

          div::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
          }

          div::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
          }
        `}
      </style>
    </div>
  );
}
