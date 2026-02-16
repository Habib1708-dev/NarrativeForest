import { useEffect, useMemo, useRef, useState } from "react";
import { useDebugStore } from "../../state/useDebugStore";
import { useCrystalPlacementStore } from "../../state/useCrystalPlacementStore";

const STEP_OPTIONS = [0.01, 0.05, 0.1];
const ROTATION_STEP_OPTIONS_DEG = [2, 5, 15];
const SCALE_STEP_OPTIONS = [0.005, 0.01, 0.05];
const DEG_TO_RAD = Math.PI / 180;

function formatObjectLabel(entry) {
  const suffix = entry.id.replace("tallRod-", "");
  return `Rod ${suffix}`;
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.appendChild(fallback);
  fallback.focus();
  fallback.select();
  document.execCommand("copy");
  document.body.removeChild(fallback);
}

export default function CrystalPlacementPanel() {
  const isDebugMode = useDebugStore((state) => state.isDebugMode);
  const initialize = useCrystalPlacementStore((state) => state.initialize);
  const objects = useCrystalPlacementStore((state) => state.objects);
  const step = useCrystalPlacementStore((state) => state.step);
  const setStep = useCrystalPlacementStore((state) => state.setStep);
  const rotationStepDeg = useCrystalPlacementStore((state) => state.rotationStepDeg);
  const setRotationStepDeg = useCrystalPlacementStore((state) => state.setRotationStepDeg);
  const scaleStep = useCrystalPlacementStore((state) => state.scaleStep);
  const setScaleStep = useCrystalPlacementStore((state) => state.setScaleStep);
  const selectedIds = useCrystalPlacementStore((state) => state.selectedIds);
  const toggleSelection = useCrystalPlacementStore((state) => state.toggleSelection);
  const selectAll = useCrystalPlacementStore((state) => state.selectAll);
  const clearSelection = useCrystalPlacementStore((state) => state.clearSelection);
  const nudgeSelected = useCrystalPlacementStore((state) => state.nudgeSelected);
  const nudgeSelectedScale = useCrystalPlacementStore((state) => state.nudgeSelectedScale);
  const nudgeSelectedScaleX = useCrystalPlacementStore((state) => state.nudgeSelectedScaleX);
  const nudgeSelectedScaleY = useCrystalPlacementStore((state) => state.nudgeSelectedScaleY);
  const nudgeSelectedRotation = useCrystalPlacementStore((state) => state.nudgeSelectedRotation);

  const [copyStatus, setCopyStatus] = useState("");
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });

  useEffect(() => {
    initialize();
  }, [initialize]);

  const onDragHandlePointerDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: position.x,
      top: position.y,
    };
    const onMove = (e2) => {
      const dx = e2.clientX - dragStartRef.current.x;
      const dy = e2.clientY - dragStartRef.current.y;
      setPosition({
        x: Math.max(0, dragStartRef.current.left + dx),
        y: Math.max(0, dragStartRef.current.top + dy),
      });
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const orderedRods = useMemo(
    () => objects.filter((e) => e.type === "tallRod"),
    [objects]
  );

  const selectedCount = selectedIds.size;

  const editedObjects = useMemo(
    () => objects.filter((e) => e.edited),
    [objects]
  );

  const stopInteraction = (e) => e.stopPropagation();

  const onCopyEditedValues = async () => {
    const payload = editedObjects.map((entry) => ({
      id: entry.id,
      type: entry.type,
      position: entry.position,
      rotationX: entry.rotationX ?? 0,
      rotationY: entry.rotationY ?? 0,
      rotationZ: entry.rotationZ ?? 0,
      scale: entry.scale,
      scaleX: entry.scaleX ?? entry.scale,
      scaleY: entry.scaleY ?? entry.scale,
    }));
    try {
      await writeClipboard(JSON.stringify(payload, null, 2));
      setCopyStatus(`Copied ${payload.length} edited object values.`);
    } catch {
      setCopyStatus("Copy failed. Try again.");
    }
  };

  if (!isDebugMode) return null;

  return (
    <div
      onPointerDown={stopInteraction}
      onMouseDown={stopInteraction}
      onTouchStart={stopInteraction}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: "clamp(280px, 26vw, 360px)",
        maxHeight: "calc(100vh - 24px)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        zIndex: 9998,
        color: "rgba(255,255,255,0.95)",
        fontFamily: "'Inter', 'SF Pro Display', system-ui, -apple-system, sans-serif",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06))",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          borderRadius: "16px",
          boxShadow:
            "0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
          padding: "12px",
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onPointerDown={onDragHandlePointerDown}
          style={{
            fontSize: "14px",
            fontWeight: 700,
            marginBottom: "8px",
            cursor: isDragging ? "grabbing" : "grab",
            userSelect: "none",
            padding: "4px 0",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.preventDefault();
          }}
        >
          Tall Rod Placement — drag to move
        </div>
        <div style={{ fontSize: "12px", opacity: 0.8, marginBottom: "8px" }}>
          12 Tall Rods. Select one or more, then apply position, scale (uniform / X / Y), and rotation.
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
          {STEP_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setStep(option)}
              style={{
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: "8px",
                background:
                  step === option
                    ? "linear-gradient(135deg, rgba(180, 120, 255, 0.25), rgba(180, 120, 255, 0.16))"
                    : "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                fontSize: "12px",
                padding: "5px 10px",
              }}
            >
              step {option}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px" }}>
          <button onClick={() => nudgeSelected("y", step)} style={axisButtonStyle} disabled={selectedCount === 0}>Y Up</button>
          <button onClick={() => nudgeSelected("y", -step)} style={axisButtonStyle} disabled={selectedCount === 0}>Y Down</button>
          <button onClick={() => nudgeSelected("x", -step)} style={axisButtonStyle} disabled={selectedCount === 0}>X Left</button>
          <button onClick={() => nudgeSelected("x", step)} style={axisButtonStyle} disabled={selectedCount === 0}>X Right</button>
          <button onClick={() => nudgeSelected("z", -step)} style={axisButtonStyle} disabled={selectedCount === 0}>Z Left</button>
          <button onClick={() => nudgeSelected("z", step)} style={axisButtonStyle} disabled={selectedCount === 0}>Z Right</button>
        </div>

        <div style={{ marginTop: "10px", fontSize: "11px", fontWeight: 600, opacity: 0.9 }}>Scale (uniform Z)</div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {SCALE_STEP_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setScaleStep(option)}
              style={{
                ...axisButtonStyle,
                padding: "4px 8px",
                background: scaleStep === option ? "rgba(180, 120, 255, 0.2)" : undefined,
              }}
            >
              {option}
            </button>
          ))}
          <button onClick={() => nudgeSelectedScale(1)} style={axisButtonStyle} disabled={selectedCount === 0}>+</button>
          <button onClick={() => nudgeSelectedScale(-1)} style={axisButtonStyle} disabled={selectedCount === 0}>−</button>
        </div>
        <div style={{ marginTop: "8px", fontSize: "11px", fontWeight: 600, opacity: 0.9 }}>Scale X</div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button onClick={() => nudgeSelectedScaleX(-1)} style={axisButtonStyle} disabled={selectedCount === 0}>−</button>
          <button onClick={() => nudgeSelectedScaleX(1)} style={axisButtonStyle} disabled={selectedCount === 0}>+</button>
        </div>
        <div style={{ marginTop: "6px", fontSize: "11px", fontWeight: 600, opacity: 0.9 }}>Scale Y</div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button onClick={() => nudgeSelectedScaleY(-1)} style={axisButtonStyle} disabled={selectedCount === 0}>−</button>
          <button onClick={() => nudgeSelectedScaleY(1)} style={axisButtonStyle} disabled={selectedCount === 0}>+</button>
        </div>

        <div style={{ marginTop: "10px", fontSize: "11px", fontWeight: 600, opacity: 0.9 }}>Rotation (deg)</div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
          {ROTATION_STEP_OPTIONS_DEG.map((option) => (
            <button
              key={option}
              onClick={() => setRotationStepDeg(option)}
              style={{
                ...axisButtonStyle,
                padding: "4px 8px",
                background: rotationStepDeg === option ? "rgba(180, 120, 255, 0.2)" : undefined,
              }}
            >
              {option}°
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px" }}>
          <button onClick={() => nudgeSelectedRotation("x", rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle} disabled={selectedCount === 0}>X Rot +</button>
          <button onClick={() => nudgeSelectedRotation("x", -rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle} disabled={selectedCount === 0}>X Rot −</button>
          <button onClick={() => nudgeSelectedRotation("y", rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle} disabled={selectedCount === 0}>Y Rot +</button>
          <button onClick={() => nudgeSelectedRotation("y", -rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle} disabled={selectedCount === 0}>Y Rot −</button>
          <button onClick={() => nudgeSelectedRotation("z", rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle} disabled={selectedCount === 0}>Z Rot +</button>
          <button onClick={() => nudgeSelectedRotation("z", -rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle} disabled={selectedCount === 0}>Z Rot −</button>
        </div>

        <div style={{ marginTop: "10px", fontSize: "12px", opacity: 0.9 }}>
          Selected: {selectedCount === 0 ? "None" : `${selectedCount} object${selectedCount !== 1 ? "s" : ""}`}
        </div>
        <div style={{ marginTop: "4px", fontSize: "11px", opacity: 0.8 }}>
          {selectedCount === 0
            ? "Check one or more below; position/scale/rotation apply to all selected."
            : "Transforms below apply to all selected."}
        </div>

        <button
          onClick={onCopyEditedValues}
          style={{ ...axisButtonStyle, marginTop: "10px", width: "100%", justifyContent: "center" }}
        >
          Copy Edited Values ({editedObjects.length})
        </button>
        {copyStatus && (
          <div style={{ marginTop: "6px", fontSize: "11px", opacity: 0.82 }}>{copyStatus}</div>
        )}
      </div>

      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))",
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.16)",
          borderRadius: "14px",
          boxShadow:
            "0 8px 32px 0 rgba(0, 0, 0, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
          padding: "10px",
          overflowY: "auto",
          minHeight: "200px",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>Checkpoints</div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
          <button onClick={selectAll} style={{ ...axisButtonStyle, padding: "4px 8px", fontSize: "11px" }}>Select all</button>
          <button onClick={clearSelection} style={{ ...axisButtonStyle, padding: "4px 8px", fontSize: "11px" }}>Clear</button>
        </div>
        <div style={{ fontSize: "11px", fontWeight: 600, opacity: 0.9, marginBottom: "4px" }}>Tall Rods (12)</div>
        {orderedRods.map((entry) => {
          const checked = selectedIds.has(entry.id);
          return (
            <button
              key={entry.id}
              onClick={() => toggleSelection(entry.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "4px",
                border: "none",
                borderRadius: "9px",
                background: checked ? "rgba(180, 120, 255, 0.2)" : "transparent",
                color: "white",
                textAlign: "left",
                cursor: "pointer",
                padding: "6px 8px",
                fontSize: "12px",
              }}
            >
              <span
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "4px",
                  border: "1px solid rgba(255,255,255,0.5)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "10px",
                  background: checked ? "rgba(180, 120, 255, 0.25)" : "transparent",
                }}
              >
                {checked ? "✓" : ""}
              </span>
              <span style={{ flex: 1 }}>{formatObjectLabel(entry)}</span>
              {entry.edited && <span style={{ opacity: 0.86, fontSize: "10px" }}>edited</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const axisButtonStyle = {
  height: "32px",
  border: "1px solid rgba(255,255,255,0.24)",
  borderRadius: "8px",
  background: "rgba(255,255,255,0.1)",
  color: "white",
  cursor: "pointer",
  fontSize: "12px",
};
