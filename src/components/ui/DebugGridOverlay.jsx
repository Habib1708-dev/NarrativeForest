import { useDebugStore } from "../../state/useDebugStore";

/**
 * Debug Grid Overlay
 * Renders a rule-of-thirds grid over the entire view when debug mode is active.
 * Useful for composition and framing in debug mode.
 *
 * @param {boolean} contained - If true, fills the parent (position: absolute).
 *   Use when the grid should overlay only a specific area (e.g. canvas) rather than the full viewport.
 */
export default function DebugGridOverlay({ contained = false }) {
  const isDebugMode = useDebugStore((state) => state.isDebugMode);

  if (!isDebugMode) return null;

  return (
    <div
      style={{
        position: contained ? "absolute" : "fixed",
        inset: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 9998,
      }}
      aria-hidden="true"
    >
      {/* Vertical lines */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "33.333%",
          width: "1px",
          background: "rgba(255, 255, 255, 0.35)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "66.666%",
          width: "1px",
          background: "rgba(255, 255, 255, 0.35)",
        }}
      />
      {/* Horizontal lines */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "33.333%",
          height: "1px",
          background: "rgba(255, 255, 255, 0.35)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "66.666%",
          height: "1px",
          background: "rgba(255, 255, 255, 0.35)",
        }}
      />
    </div>
  );
}
