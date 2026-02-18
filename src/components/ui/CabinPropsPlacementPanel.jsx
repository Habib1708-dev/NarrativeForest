import { useEffect, useMemo, useState } from "react";
import { useDebugStore } from "../../state/useDebugStore";
import { useCabinPropsPlacementStore } from "../../state/useCabinPropsPlacementStore";

const STEP_OPTIONS = [0.01, 0.05, 0.1];
const ROTATION_STEP_OPTIONS_DEG = [2, 5, 15];
const SCALE_STEP_OPTIONS = [0.005, 0.01, 0.05];
const DEG_TO_RAD = Math.PI / 180;

function formatObjectLabel(entry) {
  const prefix = entry.type === "rock" ? "Rock" : "Tree";
  const suffix = entry.id.split("-")[1];
  return `${prefix} ${suffix}`;
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

export default function CabinPropsPlacementPanel() {
  const isDebugMode = useDebugStore((state) => state.isDebugMode);
  const initialize = useCabinPropsPlacementStore((state) => state.initialize);
  const objects = useCabinPropsPlacementStore((state) => state.objects);
  const activeObjectId = useCabinPropsPlacementStore((state) => state.activeObjectId);
  const step = useCabinPropsPlacementStore((state) => state.step);
  const setStep = useCabinPropsPlacementStore((state) => state.setStep);
  const rotationStepDeg = useCabinPropsPlacementStore((state) => state.rotationStepDeg);
  const setRotationStepDeg = useCabinPropsPlacementStore((state) => state.setRotationStepDeg);
  const scaleStep = useCabinPropsPlacementStore((state) => state.scaleStep);
  const setScaleStep = useCabinPropsPlacementStore((state) => state.setScaleStep);
  const setActiveObject = useCabinPropsPlacementStore((state) => state.setActiveObject);
  const nudgeActiveObject = useCabinPropsPlacementStore((state) => state.nudgeActiveObject);
  const nudgeActiveScale = useCabinPropsPlacementStore((state) => state.nudgeActiveScale);
  const nudgeActiveRotation = useCabinPropsPlacementStore((state) => state.nudgeActiveRotation);

  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    initialize();
  }, [initialize]);

  const orderedObjects = useMemo(() => {
    const rocks = objects.filter((entry) => entry.type === "rock");
    const trees = objects.filter((entry) => entry.type === "tree");
    return [...rocks, ...trees];
  }, [objects]);

  const activeObject = useMemo(
    () => objects.find((entry) => entry.id === activeObjectId) ?? null,
    [objects, activeObjectId]
  );

  const editedObjects = useMemo(
    () => orderedObjects.filter((entry) => entry.edited),
    [orderedObjects]
  );

  const stopInteraction = (event) => {
    event.stopPropagation();
  };

  const onCopyEditedValues = async () => {
    const payload = editedObjects.map((entry) => ({
      id: entry.id,
      type: entry.type,
      position: entry.position,
      rotationX: entry.rotationX ?? 0,
      rotationY: entry.rotationY ?? 0,
      rotationZ: entry.rotationZ ?? 0,
      scale: entry.scale,
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
        right: "clamp(8px, 1.8vw, 20px)",
        top: "clamp(78px, 10vh, 112px)",
        width: "clamp(290px, 28vw, 370px)",
        maxHeight: "calc(100vh - 132px)",
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
        <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>
          Cabin Props Placement
        </div>
        <div style={{ fontSize: "12px", opacity: 0.8, marginBottom: "8px" }}>
          24 rocks + 11 trees, single active checkpoint.
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
                    ? "linear-gradient(135deg, rgba(100, 200, 255, 0.25), rgba(100, 200, 255, 0.16))"
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
          <button
            onClick={() => nudgeActiveObject("y", step)}
            style={axisButtonStyle}
          >
            Y Up
          </button>
          <button
            onClick={() => nudgeActiveObject("y", -step)}
            style={axisButtonStyle}
          >
            Y Down
          </button>
          <button
            onClick={() => nudgeActiveObject("x", -step)}
            style={axisButtonStyle}
          >
            X Left
          </button>
          <button
            onClick={() => nudgeActiveObject("x", step)}
            style={axisButtonStyle}
          >
            X Right
          </button>
          <button
            onClick={() => nudgeActiveObject("z", -step)}
            style={axisButtonStyle}
          >
            Z Left
          </button>
          <button
            onClick={() => nudgeActiveObject("z", step)}
            style={axisButtonStyle}
          >
            Z Right
          </button>
        </div>

        <div style={{ marginTop: "10px", fontSize: "11px", fontWeight: 600, opacity: 0.9 }}>
          Scale
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {SCALE_STEP_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setScaleStep(option)}
              style={{
                ...axisButtonStyle,
                padding: "4px 8px",
                background: scaleStep === option ? "rgba(100, 200, 255, 0.2)" : undefined,
              }}
            >
              {option}
            </button>
          ))}
          <button onClick={() => nudgeActiveScale(1)} style={axisButtonStyle}>+</button>
          <button onClick={() => nudgeActiveScale(-1)} style={axisButtonStyle}>−</button>
        </div>

        <div style={{ marginTop: "10px", fontSize: "11px", fontWeight: 600, opacity: 0.9 }}>
          Rotation (deg)
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
          {ROTATION_STEP_OPTIONS_DEG.map((option) => (
            <button
              key={option}
              onClick={() => setRotationStepDeg(option)}
              style={{
                ...axisButtonStyle,
                padding: "4px 8px",
                background: rotationStepDeg === option ? "rgba(100, 200, 255, 0.2)" : undefined,
              }}
            >
              {option}°
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px" }}>
          <button onClick={() => nudgeActiveRotation("x", rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle}>X Rot +</button>
          <button onClick={() => nudgeActiveRotation("x", -rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle}>X Rot −</button>
          <button onClick={() => nudgeActiveRotation("y", rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle}>Y Rot +</button>
          <button onClick={() => nudgeActiveRotation("y", -rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle}>Y Rot −</button>
          <button onClick={() => nudgeActiveRotation("z", rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle}>Z Rot +</button>
          <button onClick={() => nudgeActiveRotation("z", -rotationStepDeg * DEG_TO_RAD)} style={axisButtonStyle}>Z Rot −</button>
        </div>

        <div style={{ marginTop: "10px", fontSize: "12px", opacity: 0.9 }}>
          Active: {activeObject ? formatObjectLabel(activeObject) : "None"}
        </div>
        <div style={{ marginTop: "4px", fontSize: "11px", opacity: 0.8 }}>
          {activeObject
            ? `pos ${activeObject.position[0].toFixed(2)}, ${activeObject.position[1].toFixed(2)}, ${activeObject.position[2].toFixed(2)} · scale ${activeObject.scale.toFixed(3)} · rot ${((activeObject.rotationX ?? 0) * (180 / Math.PI)).toFixed(1)}°, ${((activeObject.rotationY ?? 0) * (180 / Math.PI)).toFixed(1)}°, ${((activeObject.rotationZ ?? 0) * (180 / Math.PI)).toFixed(1)}°`
            : "Select an object from checkpoints below."}
        </div>

        <button
          onClick={onCopyEditedValues}
          style={{
            ...axisButtonStyle,
            marginTop: "10px",
            width: "100%",
            justifyContent: "center",
          }}
        >
          Copy Edited Values ({editedObjects.length})
        </button>
        {copyStatus && (
          <div style={{ marginTop: "6px", fontSize: "11px", opacity: 0.82 }}>
            {copyStatus}
          </div>
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
          minHeight: "220px",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>
          Checkpoints
        </div>
        {orderedObjects.map((entry) => {
          const checked = entry.id === activeObjectId;
          return (
            <button
              key={entry.id}
              onClick={() => setActiveObject(entry.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "4px",
                border: "none",
                borderRadius: "9px",
                background: checked ? "rgba(100, 200, 255, 0.2)" : "transparent",
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
                  background: checked ? "rgba(100, 200, 255, 0.25)" : "transparent",
                }}
              >
                {checked ? "x" : ""}
              </span>
              <span style={{ flex: 1 }}>{formatObjectLabel(entry)}</span>
              {entry.edited && (
                <span style={{ opacity: 0.86, fontSize: "10px" }}>edited</span>
              )}
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

