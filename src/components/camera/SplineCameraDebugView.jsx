// src/components/camera/SplineCameraDebugView.jsx
// 3D debug overlay for the spline camera path.
// Renders: curve line, waypoint spheres + labels, direction arrows,
// current-t marker, TransformControls, arc-length tick marks,
// segment-colored curve, and keyboard-driven nudge.

import { useRef, useMemo, useCallback, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line, Html, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useSplineCameraStore } from "../../state/useSplineCameraStore";

/* reusable temp vectors */
const _markerPos = new THREE.Vector3();

/* segment colours — cycle through a distinguishable palette */
const SEG_COLORS = [
  "#00e5ff", "#ff4081", "#76ff03", "#ffea00",
  "#d500f9", "#ff6e40", "#00e676", "#40c4ff",
  "#ff1744",
];

export default function SplineCameraDebugView() {
  const showSplineViz = useSplineCameraStore((s) => s.showSplineViz);
  const showSplineGeometry = useSplineCameraStore((s) => s.showSplineGeometry);
  const sampler = useSplineCameraStore((s) => s.sampler);
  const waypoints = useSplineCameraStore((s) => s.waypoints);
  const segmentOffsets = useSplineCameraStore((s) => s.segmentOffsets);
  const selectedWaypoint = useSplineCameraStore((s) => s.selectedWaypoint);
  const selectedSegments = useSplineCameraStore((s) => s.selectedSegments);
  const selectedSegment = selectedSegments[selectedSegments.length - 1] ?? -1;
  const activeAxis = useSplineCameraStore((s) => s.activeAxis);
  const { curve, uAtWaypoint, uAtAuthored } = sampler;
  const waypointU = uAtAuthored ?? uAtWaypoint;
  const { camera } = useThree();

  // ---- per-segment curve lines (different color each) ----

  const segmentLines = useMemo(() => {
    const N = waypoints.length;
    const segments = [];
    const samplesPerSeg = 30;
    for (let i = 0; i < N - 1; i++) {
      const uStart = waypointU[i];
      const uEnd = waypointU[i + 1];
      const pts = [];
      for (let s = 0; s <= samplesPerSeg; s++) {
        const u = uStart + (uEnd - uStart) * (s / samplesPerSeg);
        // Use sampler.sample() so segment offsets (midpoint bends) are reflected
        // in the visualised curve. Must clone — sample() reuses a single Vector3.
        const { position } = sampler.sample(Math.min(1, u));
        pts.push(position.clone());
      }
      segments.push({ points: pts, color: SEG_COLORS[i % SEG_COLORS.length] });
    }
    return segments;
  }, [sampler, waypointU, waypoints.length]);

  // ---- optional rendered spline geometry ----
  const splineTubeGeometry = useMemo(() => {
    if (!showSplineGeometry) return null;
    const samples = Math.max(120, waypoints.length * 36);
    const points = [];
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const { position } = sampler.sample(u);
      points.push(position.clone());
    }
    if (points.length < 2) return null;
    const path = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
    return new THREE.TubeGeometry(path, Math.max(24, points.length - 1), 0.045, 12, false);
  }, [showSplineGeometry, sampler, waypoints.length]);

  // ---- arc-length tick marks (every 10% of total length) ----

  const arcTickPositions = useMemo(() => {
    const ticks = [];
    for (let pct = 0; pct <= 100; pct += 10) {
      const u = pct / 100;
      ticks.push({ pos: curve.getPointAt(u).clone(), label: `${pct}%` });
    }
    return ticks;
  }, [curve]);

  // ---- waypoint positions ----

  const waypointPositions = useMemo(
    () => waypoints.map((_, i) => curve.getPointAt(waypointU[i]).clone()),
    [curve, waypointU, waypoints]
  );

  // ---- segment handle positions (midpoint + authored offset) ----
  const segmentBaseMidpoints = useMemo(
    () =>
      waypoints.slice(0, -1).map((a, i) => {
        const b = waypoints[i + 1];
        return new THREE.Vector3(
          (a.pos[0] + b.pos[0]) * 0.5,
          (a.pos[1] + b.pos[1]) * 0.5,
          (a.pos[2] + b.pos[2]) * 0.5
        );
      }),
    [waypoints]
  );

  const segmentHandlePositions = useMemo(
    () =>
      segmentBaseMidpoints.map((base, i) => {
        const off = segmentOffsets[i] ?? [0, 0, 0];
        return base.clone().add(new THREE.Vector3(off[0], off[1], off[2]));
      }),
    [segmentBaseMidpoints, segmentOffsets]
  );

  // ---- direction arrows ----

  const directionLines = useMemo(
    () =>
      waypoints.map((w, i) => {
        const start = waypointPositions[i];
        const dir = new THREE.Vector3(...w.dir).normalize().multiplyScalar(0.4);
        const end = start.clone().add(dir);
        return [start, end];
      }),
    [waypoints, waypointPositions]
  );

  // ---- current-t marker (per-frame via ref) ----

  const markerRef = useRef();

  useFrame(() => {
    if (!markerRef.current || !showSplineViz) return;
    const t = useSplineCameraStore.getState().t;
    curve.getPointAt(Math.max(0, Math.min(1, t)), _markerPos);
    markerRef.current.position.copy(_markerPos);
  });

  // ---- TransformControls ----

  const transformRef = useRef();
  const segmentTransformRef = useRef();
  const selectedMeshRef = useRef();
  const selectedSegmentMeshRef = useRef();

  const onTransformChange = useCallback(() => {
    if (!transformRef.current || selectedWaypoint < 0) return;
    const obj = transformRef.current.object;
    if (!obj) return;
    const { x, y, z } = obj.position;
    useSplineCameraStore.getState().updateWaypoint(selectedWaypoint, {
      pos: [x, y, z],
    });
  }, [selectedWaypoint]);

  const onSphereClick = useCallback((e, i) => {
    e.stopPropagation();
    const current = useSplineCameraStore.getState().selectedWaypoint;
    useSplineCameraStore.getState().setSelectedWaypoint(current === i ? -1 : i);
    useSplineCameraStore.getState().setSelectedSegment(-1);
  }, []);

  const onSegmentHandleClick = useCallback((e, i) => {
    e.stopPropagation();
    const store = useSplineCameraStore.getState();
    const segs = store.selectedSegments;
    const next = segs.includes(i) ? segs.filter((s) => s !== i) : [...segs, i];
    store.setSelectedSegments(next);
    store.setSelectedWaypoint(-1);
  }, []);

  const onSegmentTransformChange = useCallback(() => {
    if (!segmentTransformRef.current || selectedSegment < 0) return;
    const obj = segmentTransformRef.current.object;
    if (!obj) return;

    const store = useSplineCameraStore.getState();
    const axis = store.activeAxis;
    const axisMap = { x: 0, y: 1, z: 2 };
    const ai = axisMap[axis] ?? 1;
    const keys = ["x", "y", "z"];

    const base = segmentBaseMidpoints[selectedSegment];
    if (!base) return;
    const off = store.segmentOffsets[selectedSegment] ?? [0, 0, 0];

    // Hard-lock non-selected axes to avoid drift while dragging.
    for (let c = 0; c < 3; c++) {
      if (c === ai) continue;
      const key = keys[c];
      obj.position[key] = base[key] + off[c];
    }

    const axisKey = keys[ai];
    const nextAxisOffset = obj.position[axisKey] - base[axisKey];
    if ((store.selectedSegments?.length ?? 0) > 1) {
      store.updateSelectedSegmentRangeOffsetAxis(axis, nextAxisOffset);
    } else {
      store.updateSegmentOffsetAxis(selectedSegment, axis, nextAxisOffset);
    }
  }, [selectedSegment, segmentBaseMidpoints]);

  // ---- keyboard nudge: X/Y/Z to pick axis, Arrow Up/Down to nudge ----

  useEffect(() => {
    if (!showSplineViz) return;

    const onKeyDown = (e) => {
      const store = useSplineCameraStore.getState();

      // Axis selection keys
      if (e.code === "KeyX" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        useSplineCameraStore.getState().setActiveAxis("x");
        return;
      }
      if (e.code === "KeyY" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        useSplineCameraStore.getState().setActiveAxis("y");
        return;
      }
      if (e.code === "KeyZ" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        useSplineCameraStore.getState().setActiveAxis("z");
        return;
      }

      if (e.code === "Escape") {
        useSplineCameraStore.getState().setSelectedWaypoint(-1);
        useSplineCameraStore.getState().setSelectedSegment(-1);
        return;
      }

      // Arrow nudge (only when a waypoint is selected)
      if (store.selectedWaypoint < 0) return;

      // Shift held = nudge direction, no shift = nudge position
      const isDir = e.shiftKey || store._nudgeMode === "dir";

      if (e.code === "ArrowUp") {
        e.preventDefault();
        if (isDir) store.nudgeSelectedDir(+1);
        else store.nudgeSelected(+1);
        return;
      }
      if (e.code === "ArrowDown") {
        e.preventDefault();
        if (isDir) store.nudgeSelectedDir(-1);
        else store.nudgeSelected(-1);
        return;
      }

      // Tab to cycle through waypoints
      if (e.code === "Tab" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const n = store.waypoints.length;
        const next = e.shiftKey
          ? (store.selectedWaypoint - 1 + n) % n
          : (store.selectedWaypoint + 1) % n;
        useSplineCameraStore.getState().setSelectedWaypoint(next);
        return;
      }

      // C to capture current camera pose into selected waypoint
      if (e.code === "KeyC" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        useSplineCameraStore.getState().captureCurrentPose(camera);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSplineViz, camera]);

  if (!showSplineViz && !showSplineGeometry) return null;

  // Axis indicator color
  const axisColor = activeAxis === "x" ? "#ff4444" : activeAxis === "y" ? "#44ff44" : "#4444ff";

  return (
    <group>
      {showSplineGeometry && splineTubeGeometry && (
        <mesh geometry={splineTubeGeometry}>
          <meshStandardMaterial
            color="#66d9ff"
            roughness={0.4}
            metalness={0.05}
            transparent
            opacity={0.35}
          />
        </mesh>
      )}

      {/* Per-segment colored curve lines */}
      {showSplineViz && segmentLines.map((seg, i) => (
        <Line
          key={`seg-${i}`}
          points={seg.points}
          color={selectedSegments.includes(i) ? "#ffffff" : seg.color}
          lineWidth={selectedSegments.includes(i) ? 4 : 2.5}
        />
      ))}

      {/* Arc-length tick marks every 10% */}
      {showSplineViz && arcTickPositions.map((tick, i) => (
        <group key={`tick-${i}`}>
          <mesh position={tick.pos}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial color="#aaaaaa" />
          </mesh>
          <Html
            center
            distanceFactor={5}
            position={[tick.pos.x, tick.pos.y - 0.12, tick.pos.z]}
            style={{
              color: "#aaa",
              fontSize: "9px",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {tick.label}
          </Html>
        </group>
      ))}

      {/* Waypoint spheres + labels */}
      {showSplineViz && waypointPositions.map((pos, i) => {
        const isSelected = selectedWaypoint === i;
        return (
          <group key={i}>
            <mesh
              position={pos}
              ref={isSelected ? selectedMeshRef : undefined}
              onClick={(e) => onSphereClick(e, i)}
            >
              <sphereGeometry args={[isSelected ? 0.09 : 0.06, 12, 12]} />
              <meshBasicMaterial color={isSelected ? "yellow" : "white"} />
            </mesh>

            <Html
              center
              distanceFactor={4}
              position={[pos.x, pos.y + 0.15, pos.z]}
              style={{
                color: isSelected ? "#ffe066" : "white",
                fontSize: "11px",
                background: isSelected ? "rgba(80,60,0,0.8)" : "rgba(0,0,0,0.6)",
                padding: "2px 6px",
                borderRadius: "3px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                userSelect: "none",
                border: isSelected ? "1px solid #ffe066" : "none",
              }}
            >
              {i}: {waypoints[i].name}
              {isSelected && (
                <span style={{ color: axisColor, marginLeft: 6, fontWeight: "bold" }}>
                  [{activeAxis.toUpperCase()}]
                </span>
              )}
            </Html>
          </group>
        );
      })}

      {/* Direction arrows */}
      {showSplineViz && directionLines.map((pair, i) => (
        <Line key={`dir-${i}`} points={pair} color="orange" lineWidth={1.5} />
      ))}

      {/* Segment handles (click to select segment between two waypoints) */}
      {showSplineViz && segmentHandlePositions.map((pos, i) => {
        const isAnySelected = selectedSegments.includes(i);
        const isPrimary = selectedSegment === i;
        return (
          <group key={`segment-handle-${i}`}>
            <mesh
              position={pos}
              ref={isPrimary ? selectedSegmentMeshRef : undefined}
              onClick={(e) => onSegmentHandleClick(e, i)}
            >
              <sphereGeometry args={[isAnySelected ? 0.085 : 0.055, 12, 12]} />
              <meshBasicMaterial color={isAnySelected ? "#00e5ff" : "#5ec8ff"} />
            </mesh>
            <Html
              center
              distanceFactor={4.5}
              position={[pos.x, pos.y + 0.12, pos.z]}
              style={{
                color: isAnySelected ? "#9be7ff" : "#a5dfff",
                fontSize: "10px",
                background: "rgba(0,20,30,0.65)",
                padding: "2px 5px",
                borderRadius: "3px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              seg {i}
            </Html>
          </group>
        );
      })}

      {/* TransformControls for the selected waypoint */}
      {showSplineViz && selectedWaypoint >= 0 && selectedSegment < 0 && selectedMeshRef.current && (
        <TransformControls
          ref={transformRef}
          object={selectedMeshRef.current}
          mode="translate"
          size={0.6}
          onObjectChange={onTransformChange}
        />
      )}

      {/* TransformControls for the selected segment (strictly axis-constrained) */}
      {showSplineViz && selectedSegment >= 0 && selectedSegmentMeshRef.current && (
        <TransformControls
          ref={segmentTransformRef}
          object={selectedSegmentMeshRef.current}
          mode="translate"
          size={0.65}
          showX={activeAxis === "x"}
          showY={activeAxis === "y"}
          showZ={activeAxis === "z"}
          onObjectChange={onSegmentTransformChange}
        />
      )}

      {/* Current position marker (red) */}
      {showSplineViz && (
      <mesh ref={markerRef}>
        <sphereGeometry args={[0.08, 14, 14]} />
        <meshBasicMaterial color="red" />
      </mesh>
      )}

      {/* HUD: active axis + selected waypoint / segment info */}
      {showSplineViz && (selectedWaypoint >= 0 || selectedSegment >= 0) && (
        <Html
          center
          distanceFactor={0}
          position={[0, 0, 0]}
          style={{
            position: "fixed",
            bottom: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            color: "white",
            fontSize: "13px",
            background: "rgba(0,0,0,0.7)",
            padding: "6px 14px",
            borderRadius: "6px",
            pointerEvents: "none",
            userSelect: "none",
            whiteSpace: "nowrap",
            fontFamily: "monospace",
            zIndex: 9999,
          }}
        >
          <span style={{ color: axisColor, fontWeight: "bold" }}>
            Axis: {activeAxis.toUpperCase()}
          </span>
          {" | "}
          {selectedSegment >= 0 ? (
            <>
              Segment {selectedSegment}: {waypoints[selectedSegment]?.name} ->{" "}
              {waypoints[selectedSegment + 1]?.name}
            </>
          ) : (
            <>Point {selectedWaypoint}: {waypoints[selectedWaypoint]?.name}</>
          )}
          {" | "}
          <span style={{ color: "#888" }}>
            X/Y/Z=axis  Segment drag=axis locked  ↑↓=nudge point  Shift+↑↓=nudge dir  Tab=next  Esc=deselect  C=capture
          </span>
        </Html>
      )}
    </group>
  );
}
