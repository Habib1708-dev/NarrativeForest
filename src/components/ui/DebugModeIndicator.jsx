import { useDebugStore } from "../../state/useDebugStore";

/**
 * Debug Mode Indicator Badge
 * Shows a small badge in the top-right corner when debug mode is active
 */
export default function DebugModeIndicator() {
  const isDebugMode = useDebugStore((state) => state.isDebugMode);

  if (!isDebugMode) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: 9999,
        backgroundColor: "rgba(255, 87, 34, 0.9)",
        color: "white",
        padding: "8px 16px",
        borderRadius: "6px",
        fontSize: "14px",
        fontWeight: "600",
        fontFamily: "system-ui, -apple-system, sans-serif",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        animation: "fadeIn 0.3s ease-in-out",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: "white",
          animation: "pulse 2s ease-in-out infinite",
        }}
      />
      <span>DEBUG MODE</span>
      <span
        style={{
          marginLeft: "4px",
          fontSize: "11px",
          opacity: 0.8,
          fontWeight: "400",
        }}
      >
        (Ctrl+D to exit)
      </span>
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.3;
            }
          }
        `}
      </style>
    </div>
  );
}
