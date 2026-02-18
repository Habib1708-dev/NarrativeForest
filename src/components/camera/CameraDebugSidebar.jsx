// src/components/camera/CameraDebugSidebar.jsx
// Custom HTML debug sidebar for the /camera-debug page.
// Provides: camera mode toggle, segment multi-select, axis checkboxes,
// step nudge buttons, insert-point tool, capture pose, and export/copy.

import { useMemo, useState } from "react";
import * as THREE from "three";
import { useSplineCameraStore } from "../../state/useSplineCameraStore";
import { formatWaypointsForExport, WEIGHT_FN_NAMES, WEIGHT_FN_LABELS } from "../../utils/splineCameraPath";

/* ------------------------------------------------------------------ */
/*  Shared styles                                                       */
/* ------------------------------------------------------------------ */

const S = {
  sidebar: {
    width: 340,
    minWidth: 340,
    height: "100vh",
    overflowY: "auto",
    background: "#111",
    color: "#e0e0e0",
    fontFamily: "monospace",
    fontSize: 12,
    boxSizing: "border-box",
    padding: "12px 0",
    borderLeft: "1px solid #222",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    userSelect: "none",
  },
  section: {
    padding: "10px 14px",
    borderBottom: "1px solid #222",
  },
  sectionTitle: {
    color: "#888",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  btn: (active, color) => ({
    flex: 1,
    padding: "5px 8px",
    background: active ? (color || "#2563eb") : "#1e1e1e",
    color: active ? "#fff" : "#aaa",
    border: `1px solid ${active ? (color || "#3b82f6") : "#333"}`,
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    fontFamily: "monospace",
    textAlign: "center",
    transition: "background 0.15s",
  }),
  nudgeBtn: (disabled) => ({
    flex: 1,
    padding: "7px 0",
    background: disabled ? "#181818" : "#1e2a3a",
    color: disabled ? "#444" : "#7dc8ff",
    border: `1px solid ${disabled ? "#222" : "#2a4a6a"}`,
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    fontFamily: "monospace",
    fontWeight: "bold",
    textAlign: "center",
  }),
  checkbox: {
    accentColor: "#3b82f6",
    marginRight: 6,
    cursor: "pointer",
  },
  label: {
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: "2px 0",
    flex: 1,
  },
  input: {
    background: "#1a1a1a",
    border: "1px solid #333",
    color: "#e0e0e0",
    borderRadius: 3,
    padding: "3px 6px",
    fontFamily: "monospace",
    fontSize: 12,
    width: 70,
  },
  stepBtn: {
    background: "#1e1e1e",
    border: "1px solid #333",
    color: "#aaa",
    borderRadius: 3,
    padding: "2px 8px",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "monospace",
  },
  codeBlock: {
    background: "#0a0a0a",
    border: "1px solid #333",
    borderRadius: 4,
    padding: "8px 10px",
    fontSize: 10.5,
    color: "#7dd3a8",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    maxHeight: 260,
    overflowY: "auto",
    marginTop: 6,
    lineHeight: 1.5,
  },
  copyBtn: (copied) => ({
    width: "100%",
    padding: "7px 0",
    background: copied ? "#065f46" : "#1e1e1e",
    color: copied ? "#6ee7b7" : "#aaa",
    border: `1px solid ${copied ? "#059669" : "#333"}`,
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    fontFamily: "monospace",
    marginBottom: 4,
  }),
  dimText: {
    color: "#555",
    fontSize: 10,
  },
  valueText: {
    color: "#94a3b8",
    fontSize: 10,
    marginLeft: 4,
  },
  axisX: { color: "#ff6b6b" },
  axisY: { color: "#6bff8a" },
  axisZ: { color: "#6bb5ff" },
};

const AXIS_COLORS = { x: "#ff6b6b", y: "#6bff8a", z: "#6bb5ff" };

/* ------------------------------------------------------------------ */
/*  Pure helper: preview the position/direction of an inserted point   */
/* ------------------------------------------------------------------ */
function computeInsertPreview(waypoints, segIdx, t) {
  if (segIdx < 0 || segIdx >= waypoints.length - 1) return null;
  const A = waypoints[segIdx];
  const B = waypoints[segIdx + 1];
  const newPos = A.pos.map((v, k) => v + (B.pos[k] - v) * t);
  const ref = new THREE.Vector3(0, 0, -1);
  const dirA = new THREE.Vector3(...A.dir).normalize();
  const dirB = new THREE.Vector3(...B.dir).normalize();
  const qA = new THREE.Quaternion().setFromUnitVectors(ref, dirA);
  const qB = new THREE.Quaternion().setFromUnitVectors(ref, dirB);
  const qNew = qA.clone().slerp(qB, t);
  const newDir = ref.clone().applyQuaternion(qNew);
  return {
    pos: newPos.map((v) => v.toFixed(4)),
    dir: [newDir.x, newDir.y, newDir.z].map((v) => v.toFixed(4)),
  };
}

/* ------------------------------------------------------------------ */
/*  Sidebar component                                                   */
/* ------------------------------------------------------------------ */
export default function CameraDebugSidebar() {
  const enabled = useSplineCameraStore((s) => s.enabled);
  const t = useSplineCameraStore((s) => s.t);
  const waypoints = useSplineCameraStore((s) => s.waypoints);
  const sampler = useSplineCameraStore((s) => s.sampler);
  const selectedSegments = useSplineCameraStore((s) => s.selectedSegments);
  const activeAxes = useSplineCameraStore((s) => s.activeAxes);
  const nudgeStep = useSplineCameraStore((s) => s.nudgeStep);
  const insertSegment = useSplineCameraStore((s) => s.insertSegment);
  const insertT = useSplineCameraStore((s) => s.insertT);
  const selectedWaypoint = useSplineCameraStore((s) => s.selectedWaypoint);
  const segmentWeightFns = useSplineCameraStore((s) => s.segmentWeightFns);
  const affectedWaypoints = useSplineCameraStore((s) => s.affectedWaypoints);

  const {
    setEnabled, setT, setSelectedSegments, setActiveAxes, setNudgeStep,
    setInsertSegment, setInsertT, insertPointInSegment,
    nudgeSegmentsByAxis, captureCurrentPose,
    setSelectedWaypoint, setAffectedWaypoints, setSelectedSegmentsWeightFn,
  } = useSplineCameraStore.getState();

  const [copiedWp, setCopiedWp] = useState(false);
  const [nudgeStepInput, setNudgeStepInput] = useState(String(nudgeStep));

  const noSegments = selectedSegments.length === 0;
  const noAffected = affectedWaypoints.length === 0;

  // Unique sorted waypoint indices that belong to any selected segment
  const uniqueWpIndices = useMemo(() => {
    if (selectedSegments.length === 0) return [];
    const s = new Set(selectedSegments.flatMap((seg) => [seg, seg + 1]));
    return [...s].sort((a, b) => a - b);
  }, [selectedSegments]);

  // Current weight function for selected segments (or "(mixed)" if they differ)
  const currentWeightFn = useMemo(() => {
    if (selectedSegments.length === 0) return "bell";
    const fns = selectedSegments.map((i) => segmentWeightFns[i] ?? "bell");
    return fns.every((f) => f === fns[0]) ? fns[0] : "(mixed)";
  }, [selectedSegments, segmentWeightFns]);

  // Live export string
  const exportString = useMemo(
    () => formatWaypointsForExport(waypoints),
    [waypoints]
  );

  // Insert preview
  const insertPreview = useMemo(
    () => computeInsertPreview(waypoints, insertSegment, insertT),
    [waypoints, insertSegment, insertT]
  );

  function handleCopyWaypoints() {
    navigator.clipboard.writeText(exportString).then(() => {
      setCopiedWp(true);
      setTimeout(() => setCopiedWp(false), 2000);
    });
  }

  function toggleSegment(i) {
    const next = selectedSegments.includes(i)
      ? selectedSegments.filter((s) => s !== i)
      : [...selectedSegments, i];
    setSelectedSegments(next);
  }

  function toggleAffectedWaypoint(i) {
    const next = affectedWaypoints.includes(i)
      ? affectedWaypoints.filter((x) => x !== i)
      : [...affectedWaypoints, i];
    setAffectedWaypoints(next);
  }

  function toggleAxis(axis) {
    const next = activeAxes.includes(axis)
      ? activeAxes.filter((a) => a !== axis)
      : [...activeAxes, axis];
    setActiveAxes(next);
  }

  function handleNudgeStepBlur(raw) {
    const v = parseFloat(raw);
    if (!isNaN(v) && v > 0) {
      setNudgeStep(v);
      setNudgeStepInput(String(v));
    } else {
      setNudgeStepInput(String(nudgeStep));
    }
  }

  const segCount = waypoints.length - 1;

  return (
    <div style={S.sidebar}>

      {/* ---- 1. Camera Mode ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Camera Mode</div>
        <div style={S.row}>
          <button style={S.btn(enabled)} onClick={() => setEnabled(true)}>
            Spline Camera
          </button>
          <button style={S.btn(!enabled, "#7c3aed")} onClick={() => setEnabled(false)}>
            Free Roam
          </button>
        </div>
        {!enabled && (
          <div style={{ ...S.dimText, marginTop: 4 }}>
            Orbit with mouse. Use "Capture Pose" to apply camera to a waypoint.
          </div>
        )}
      </div>

      {/* ---- 2. Jump to Waypoint ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Jump to Waypoint</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {waypoints.map((wp, i) => {
            const u = sampler.uAtWaypoint[i];
            const isActive = u !== undefined && Math.abs(t - u) < 0.002;
            return (
              <button
                key={i}
                title={`${wp.name}\nt = ${u?.toFixed(4)}`}
                style={{
                  ...S.btn(isActive),
                  flex: "0 0 auto",
                  fontSize: 10,
                  padding: "3px 7px",
                }}
                onClick={() => setT(u)}
              >
                {i}: {wp.name.length > 14 ? wp.name.slice(0, 13) + "…" : wp.name}
              </button>
            );
          })}
        </div>
        <div style={S.row}>
          <span style={S.dimText}>t =</span>
          <input
            type="range"
            min={0} max={1} step={0.001}
            value={t}
            onChange={(e) => setT(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={S.valueText}>{t.toFixed(4)}</span>
        </div>
      </div>

      {/* ---- 3. Segment Picker ---- */}
      <div style={S.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={S.sectionTitle}>Segments ({selectedSegments.length} selected)</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button
              style={{ ...S.stepBtn, fontSize: 10 }}
              onClick={() => setSelectedSegments(Array.from({ length: segCount }, (_, i) => i))}
            >
              All
            </button>
            <button
              style={{ ...S.stepBtn, fontSize: 10 }}
              onClick={() => setSelectedSegments([])}
            >
              Clear
            </button>
          </span>
        </div>
        {Array.from({ length: segCount }, (_, i) => {
          const checked = selectedSegments.includes(i);
          return (
            <label key={i} style={{ ...S.label, background: checked ? "#1a2535" : "transparent", borderRadius: 3, padding: "2px 4px" }}>
              <input
                type="checkbox"
                style={S.checkbox}
                checked={checked}
                onChange={() => toggleSegment(i)}
              />
              <span style={{ color: checked ? "#93c5fd" : "#888" }}>
                Seg {i}:
              </span>
              <span style={{ marginLeft: 4, color: checked ? "#e0e0e0" : "#666", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {waypoints[i]?.name} → {waypoints[i + 1]?.name}
              </span>
            </label>
          );
        })}
      </div>

      {/* ---- 3b. Waypoints in Selection ---- */}
      {selectedSegments.length > 0 && (
        <div style={S.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={S.sectionTitle}>Waypoints in Selection ({affectedWaypoints.length} active)</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button
                style={{ ...S.stepBtn, fontSize: 10 }}
                onClick={() => setAffectedWaypoints([...uniqueWpIndices])}
              >
                All
              </button>
              <button
                style={{ ...S.stepBtn, fontSize: 10 }}
                onClick={() => setAffectedWaypoints([])}
              >
                Clear
              </button>
            </span>
          </div>
          {uniqueWpIndices.map((i) => {
            const checked = affectedWaypoints.includes(i);
            // How many selected segments share this waypoint?
            const sharedIn = selectedSegments.filter((s) => s === i || s + 1 === i);
            const isShared = sharedIn.length > 1;
            return (
              <label
                key={i}
                style={{
                  ...S.label,
                  background: checked ? "#1a2535" : "transparent",
                  borderRadius: 3,
                  padding: "2px 4px",
                }}
              >
                <input
                  type="checkbox"
                  style={S.checkbox}
                  checked={checked}
                  onChange={() => toggleAffectedWaypoint(i)}
                />
                <span style={{ color: checked ? "#93c5fd" : "#888" }}>WP {i}</span>
                {isShared && (
                  <span style={{ ...S.dimText, marginLeft: 4, color: "#f59e0b" }}>⬡</span>
                )}
                <span style={{
                  marginLeft: 4,
                  color: checked ? "#e0e0e0" : "#666",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {waypoints[i]?.name}
                </span>
              </label>
            );
          })}
          <div style={{ ...S.dimText, marginTop: 6 }}>
            ⬡ = shared between segments — enable to move the junction point together.
          </div>
        </div>
      )}

      {/* ---- 3c. Curve Shape (weight function per segment) ---- */}
      {selectedSegments.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Curve Shape — weight function</div>
          <select
            value={currentWeightFn === "(mixed)" ? "" : currentWeightFn}
            style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
            onChange={(e) => setSelectedSegmentsWeightFn(e.target.value)}
          >
            {currentWeightFn === "(mixed)" && (
              <option value="" disabled>(mixed — pick to unify)</option>
            )}
            {WEIGHT_FN_NAMES.map((name) => (
              <option key={name} value={name}>{WEIGHT_FN_LABELS[name]}</option>
            ))}
          </select>
          {selectedSegments.length > 1 && (
            <div style={S.dimText}>
              {selectedSegments.map((i) => (
                <span key={i} style={{ marginRight: 8 }}>
                  Seg {i}: <span style={{ color: "#94a3b8" }}>{segmentWeightFns[i] ?? "bell"}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- 4. Active Axes ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Active Axes</div>
        <div style={S.row}>
          {["x", "y", "z"].map((axis) => {
            const checked = activeAxes.includes(axis);
            return (
              <label key={axis} style={{ ...S.label, flex: "0 0 auto", gap: 4 }}>
                <input
                  type="checkbox"
                  style={{ ...S.checkbox, accentColor: AXIS_COLORS[axis] }}
                  checked={checked}
                  onChange={() => toggleAxis(axis)}
                />
                <span style={{ color: checked ? AXIS_COLORS[axis] : "#555", fontWeight: "bold" }}>
                  {axis.toUpperCase()}
                </span>
              </label>
            );
          })}
          {activeAxes.length === 0 && (
            <span style={{ ...S.dimText, marginLeft: 8 }}>pick at least one axis</span>
          )}
        </div>
      </div>

      {/* ---- 5. Step Size ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Step Size</div>
        <div style={S.row}>
          <button
            style={S.stepBtn}
            onClick={() => {
              const v = Math.max(0.001, nudgeStep / 10);
              setNudgeStep(v);
              setNudgeStepInput(String(v));
            }}
          >
            ÷10
          </button>
          <input
            type="number"
            style={{ ...S.input, flex: 1, width: "auto" }}
            value={nudgeStepInput}
            min={0.001}
            step={0.001}
            onChange={(e) => setNudgeStepInput(e.target.value)}
            onBlur={(e) => handleNudgeStepBlur(e.target.value)}
          />
          <button
            style={S.stepBtn}
            onClick={() => {
              const v = nudgeStep * 10;
              setNudgeStep(v);
              setNudgeStepInput(String(v));
            }}
          >
            ×10
          </button>
        </div>
      </div>

      {/* ---- 6. Position Nudge (segment midpoint bend) ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>
          Segment Midpoint Nudge
          {noSegments && <span style={{ ...S.dimText, marginLeft: 6 }}>— select a segment first</span>}
        </div>
        <div style={S.row}>
          <button
            style={S.nudgeBtn(noSegments)}
            disabled={noSegments}
            onClick={() => nudgeSegmentsByAxis(-1)}
          >
            ↓ −{nudgeStep}
          </button>
          <button
            style={S.nudgeBtn(noSegments)}
            disabled={noSegments}
            onClick={() => nudgeSegmentsByAxis(+1)}
          >
            ↑ +{nudgeStep}
          </button>
        </div>
        {!noSegments && activeAxes.length > 0 && (
          <div style={S.dimText}>
            Bending midpoint of {selectedSegments.length === 1 ? `seg ${selectedSegments[0]}` : `${selectedSegments.length} segs`} along {activeAxes.map((a) => <span key={a} style={{ color: AXIS_COLORS[a], marginRight: 2 }}>{a.toUpperCase()}</span>)} — waypoints stay fixed
          </div>
        )}
      </div>

      {/* ---- 6b. Waypoint Position Nudge (moves actual waypoint anchors) ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>
          Waypoint Position Nudge
          {noAffected && (
            <span style={{ ...S.dimText, marginLeft: 6 }}>— enable waypoints above</span>
          )}
        </div>
        <div style={S.row}>
          <button
            style={S.nudgeBtn(noAffected)}
            disabled={noAffected}
            onClick={() => useSplineCameraStore.getState().nudgeWaypointsByAxis(-1)}
          >
            ↓ −{nudgeStep}
          </button>
          <button
            style={S.nudgeBtn(noAffected)}
            disabled={noAffected}
            onClick={() => useSplineCameraStore.getState().nudgeWaypointsByAxis(+1)}
          >
            ↑ +{nudgeStep}
          </button>
        </div>
        {!noAffected && activeAxes.length > 0 && (
          <div style={S.dimText}>
            Moving WP {affectedWaypoints.join(", ")} along{" "}
            {activeAxes.map((a) => (
              <span key={a} style={{ color: AXIS_COLORS[a], marginRight: 2 }}>{a.toUpperCase()}</span>
            ))}
            — this moves the anchor(s) permanently
          </div>
        )}
      </div>

      {/* ---- 7. Direction Nudge (selected waypoint look direction) ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>
          Waypoint Direction Nudge
          {selectedWaypoint < 0 && <span style={{ ...S.dimText, marginLeft: 6 }}>— select a waypoint first</span>}
        </div>
        <div style={S.row}>
          <button
            style={S.nudgeBtn(selectedWaypoint < 0)}
            disabled={selectedWaypoint < 0}
            onClick={() => useSplineCameraStore.getState().nudgeSelectedDir(-1)}
          >
            ↓ −{nudgeStep}
          </button>
          <button
            style={S.nudgeBtn(selectedWaypoint < 0)}
            disabled={selectedWaypoint < 0}
            onClick={() => useSplineCameraStore.getState().nudgeSelectedDir(+1)}
          >
            ↑ +{nudgeStep}
          </button>
        </div>
        {selectedWaypoint >= 0 && (
          <div style={S.dimText}>
            Adjusting look dir of WP {selectedWaypoint}: {waypoints[selectedWaypoint]?.name}
          </div>
        )}
      </div>

      {/* ---- 8. Insert Point ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Insert Point in Segment</div>
        <div style={S.row}>
          <span style={S.dimText}>Segment:</span>
          <select
            value={insertSegment}
            style={{ ...S.input, flex: 1, width: "auto" }}
            onChange={(e) => setInsertSegment(Number(e.target.value))}
          >
            <option value={-1}>— pick —</option>
            {Array.from({ length: segCount }, (_, i) => (
              <option key={i} value={i}>
                Seg {i}: {waypoints[i]?.name} → {waypoints[i + 1]?.name}
              </option>
            ))}
          </select>
        </div>

        {insertSegment >= 0 && (
          <>
            <div style={S.row}>
              <span style={S.dimText}>t =</span>
              <button style={S.stepBtn} onClick={() => setInsertT(insertT - 0.05)}>↓</button>
              <input
                type="number"
                style={{ ...S.input, width: 56 }}
                min={0} max={1} step={0.01}
                value={insertT.toFixed(3)}
                onChange={(e) => setInsertT(parseFloat(e.target.value))}
              />
              <button style={S.stepBtn} onClick={() => setInsertT(insertT + 0.05)}>↑</button>
              <input
                type="range"
                min={0} max={1} step={0.01}
                value={insertT}
                onChange={(e) => setInsertT(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>

            {insertPreview && (
              <div style={{ ...S.codeBlock, fontSize: 10, marginBottom: 6, color: "#94a3b8" }}>
                pos: [{insertPreview.pos.join(", ")}]{"\n"}
                dir: [{insertPreview.dir.join(", ")}]
              </div>
            )}

            <button
              style={{
                ...S.copyBtn(false),
                background: "#1e3a2a",
                color: "#6ee7b7",
                border: "1px solid #065f46",
                marginBottom: 0,
              }}
              onClick={() => insertPointInSegment(insertSegment, insertT)}
            >
              Insert Point at t = {insertT.toFixed(3)}
            </button>
          </>
        )}
      </div>

      {/* ---- 9. Capture Pose ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Capture Camera Pose → Waypoint</div>
        <div style={S.row}>
          <span style={S.dimText}>Waypoint:</span>
          <select
            value={selectedWaypoint}
            style={{ ...S.input, flex: 1, width: "auto" }}
            onChange={(e) => setSelectedWaypoint(Number(e.target.value))}
          >
            <option value={-1}>— pick —</option>
            {waypoints.map((wp, i) => (
              <option key={i} value={i}>{i}: {wp.name}</option>
            ))}
          </select>
        </div>
        {selectedWaypoint >= 0 && waypoints[selectedWaypoint] && (
          <div style={{ ...S.codeBlock, fontSize: 10, marginBottom: 6, color: "#94a3b8" }}>
            pos: [{waypoints[selectedWaypoint].pos.map(v => v.toFixed(4)).join(", ")}]{"\n"}
            dir: [{waypoints[selectedWaypoint].dir.map(v => v.toFixed(4)).join(", ")}]
          </div>
        )}
        <button
          style={{
            ...S.copyBtn(false),
            background: selectedWaypoint < 0 ? "#181818" : "#2a1e3a",
            color: selectedWaypoint < 0 ? "#444" : "#c4b5fd",
            border: `1px solid ${selectedWaypoint < 0 ? "#222" : "#6d28d9"}`,
            cursor: selectedWaypoint < 0 ? "not-allowed" : "pointer",
            marginBottom: 0,
          }}
          disabled={selectedWaypoint < 0}
          onClick={() => captureCurrentPose()}
        >
          Capture from Camera → WP {selectedWaypoint >= 0 ? selectedWaypoint : "?"}
        </button>
        <div style={{ ...S.dimText, marginTop: 4 }}>
          Switch to Free Roam, navigate camera, then capture. Keyboard: C
        </div>
      </div>

      {/* ---- 10. Export ---- */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Export</div>
        <button style={S.copyBtn(copiedWp)} onClick={handleCopyWaypoints}>
          {copiedWp ? "✓ Copied!" : "Copy SPLINE_WAYPOINTS"}
        </button>
        <div style={S.codeBlock}>{exportString}</div>
      </div>

    </div>
  );
}
