// src/components/camera/SplineCameraDebugPanel.jsx
// Leva debug panel for spline camera authoring.

import { useMemo } from "react";
import { useControls, folder, button } from "leva";
import { useSplineCameraStore } from "../../state/useSplineCameraStore";
import { useDebugStore } from "../../state/useDebugStore";
import { WEIGHT_FN_LABELS, WEIGHT_FN_NAMES } from "../../utils/splineCameraPath";

export default function SplineCameraDebugPanel() {
  const isDebugMode = useDebugStore((s) => s.isDebugMode);
  const waypoints = useSplineCameraStore((s) => s.waypoints);
  const sampler = useSplineCameraStore((s) => s.sampler);
  const selectedSegments = useSplineCameraStore((s) => s.selectedSegments);
  const activeAxis = useSplineCameraStore((s) => s.activeAxis);
  const segmentOffsets = useSplineCameraStore((s) => s.segmentOffsets);
  const curveParams = useSplineCameraStore((s) => s.curveParams);

  const primarySelectedSegment = selectedSegments[selectedSegments.length - 1] ?? -1;
  const selectedRangeStart = selectedSegments.length ? Math.min(...selectedSegments) : -1;
  const selectedRangeEnd = selectedSegments.length ? Math.max(...selectedSegments) : -1;
  const axisIdx = activeAxis === "x" ? 0 : activeAxis === "y" ? 1 : 2;
  const segmentGroups = useSplineCameraStore((s) => s.segmentGroups);
  const activeGroup =
    selectedSegments.length > 1
      ? segmentGroups.find((g) => g.start === selectedRangeStart && g.end === selectedRangeEnd)
      : null;
  const segmentAxisOffset = selectedSegments.length > 1
    ? activeGroup?.offset?.[axisIdx] ?? 0
    : primarySelectedSegment >= 0
      ? segmentOffsets[primarySelectedSegment]?.[axisIdx] ?? 0
      : 0;
  const waypointU = sampler.uAtAuthored ?? sampler.uAtWaypoint;

  const segmentOptions = useMemo(
    () => ({
      None: -1,
      ...Object.fromEntries(
        waypoints.slice(0, -1).map((w, i) => [
          `${i}: ${w.name} -> ${waypoints[i + 1]?.name ?? "end"}`,
          i,
        ])
      ),
    }),
    [waypoints]
  );
  const waypointOptions = useMemo(
    () => ({
      None: -1,
      ...Object.fromEntries(
        waypoints.map((w, i) => [`${i}: ${w.name}`, i])
      ),
    }),
    [waypoints]
  );

  const segmentGroupOptions = useMemo(() => {
    const single = waypoints.slice(0, -1).map((w, i) => [
      `${i}: ${w.name} -> ${waypoints[i + 1]?.name ?? "end"}`,
      `${i}-${i}`,
    ]);
    const ranges = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      for (let j = i + 1; j < waypoints.length - 1; j++) {
        ranges.push([
          `${i}-${j}: ${waypoints[i]?.name} -> ${waypoints[j + 1]?.name}`,
          `${i}-${j}`,
        ]);
      }
    }
    return { None: "none", ...Object.fromEntries([...single, ...ranges]) };
  }, [waypoints]);

  const weightOptions = useMemo(
    () => Object.fromEntries(WEIGHT_FN_NAMES.map((k) => [WEIGHT_FN_LABELS[k], k])),
    []
  );

  useControls(
    "Spline Camera",
    {
      enabled: {
        value: useSplineCameraStore.getState().enabled,
        onChange: (v) => useSplineCameraStore.getState().setEnabled(v),
      },
      showSplineViz: {
        value: useSplineCameraStore.getState().showSplineViz,
        label: "Show debug spline",
        onChange: (v) => useSplineCameraStore.getState().setShowSplineViz(v),
      },
      showSplineGeometry: {
        value: useSplineCameraStore.getState().showSplineGeometry,
        label: "Render spline geometry",
        onChange: (v) => useSplineCameraStore.getState().setShowSplineGeometry(v),
      },
      scrollSensitivity: {
        value: useSplineCameraStore.getState().scrollSensitivity,
        min: 0.1,
        max: 5,
        step: 0.05,
        onChange: (v) => useSplineCameraStore.getState().setScrollSensitivity(v),
      },
      t: {
        value: 0,
        min: 0,
        max: 1,
        step: 0.001,
        onChange: (v) => useSplineCameraStore.getState().setT(v),
      },
      fov: {
        value: 50,
        min: 20,
        max: 120,
        step: 1,
        onChange: (v) => useSplineCameraStore.setState({ fov: v }),
      },
      jump: {
        options: Object.fromEntries(waypoints.map((w, i) => [w.name, waypointU[i]])),
        onChange: (u) => useSplineCameraStore.getState().setT(u),
      },
      "Copy Waypoints JSON": button(() =>
        useSplineCameraStore.getState().copyWaypointsToClipboard()
      ),
      "Reset Waypoints": button(() =>
        useSplineCameraStore.getState().resetWaypoints()
      ),
    },
    { collapsed: false, hidden: !isDebugMode }
  );

  useControls(
    "Global Curve",
    {
      curveType: {
        options: { Centripetal: "centripetal", Chordal: "chordal", CatmullRom: "catmullrom" },
        value: curveParams.curveType,
        onChange: (v) => useSplineCameraStore.getState().setCurveParams({ curveType: v }),
      },
      tension: {
        value: curveParams.tension,
        min: 0,
        max: 1,
        step: 0.01,
        onChange: (v) => useSplineCameraStore.getState().setCurveParams({ tension: v }),
      },
      closed: {
        value: curveParams.closed,
        onChange: (v) => useSplineCameraStore.getState().setCurveParams({ closed: v }),
      },
      lengthInfo: {
        value: `${sampler.totalLength?.toFixed?.(2) ?? "0.00"} units`,
        editable: false,
        label: "Length",
      },
    },
    { collapsed: true, hidden: !isDebugMode }
  );

  useControls(
    "Segment Editing",
    {
      selectedSegment: {
        options: segmentOptions,
        value: primarySelectedSegment,
        onChange: (v) => useSplineCameraStore.getState().setSelectedSegment(Number(v)),
      },
      selectedAsOne: {
        options: segmentGroupOptions,
        value:
          selectedSegments.length > 0
            ? `${selectedRangeStart}-${selectedRangeEnd}`
            : "none",
        label: "Select one/multi",
        onChange: (v) => {
          if (v === "none") {
            useSplineCameraStore.getState().setSelectedSegments([]);
            return;
          }
          const [start, end] = String(v).split("-").map(Number);
          useSplineCameraStore.getState().setSelectedSegmentRange(start, end);
        },
      },
      weightFn: {
        options: weightOptions,
        value:
          selectedSegments.length > 1
            ? activeGroup?.weightFn ?? "bell"
            : primarySelectedSegment >= 0
            ? useSplineCameraStore.getState().segmentWeightFns[primarySelectedSegment] ?? "bell"
            : "bell",
        label: "Curve function",
        onChange: (v) => useSplineCameraStore.getState().setSelectedSegmentsWeightFn(v),
      },
      activeAxis: {
        options: { X: "x", Y: "y", Z: "z" },
        value: activeAxis,
        onChange: (v) => useSplineCameraStore.getState().setActiveAxis(v),
      },
      nudgeStep: {
        value: useSplineCameraStore.getState().nudgeStep,
        min: 0.001,
        max: 1,
        step: 0.005,
        label: "Step size",
        onChange: (v) => useSplineCameraStore.getState().setNudgeStep(v),
      },
      segmentAxisOffset: {
        value: segmentAxisOffset,
        min: -5,
        max: 5,
        step: 0.01,
        label: "Loosen/Tighten",
        onChange: (v) => {
          const idx = useSplineCameraStore.getState().selectedSegments.slice(-1)[0];
          if (idx < 0) return;
          const axis = useSplineCameraStore.getState().activeAxis;
          const segs = useSplineCameraStore.getState().selectedSegments;
          if (segs.length > 1) {
            useSplineCameraStore.getState().updateSelectedSegmentRangeOffsetAxis(axis, v);
          } else {
            useSplineCameraStore.getState().updateSegmentOffsetAxis(idx, axis, v);
          }
        },
      },
      "Nudge +": button(() => useSplineCameraStore.getState().nudgeSegmentsByAxis(+1)),
      "Nudge -": button(() => useSplineCameraStore.getState().nudgeSegmentsByAxis(-1)),
      hint: {
        value: "Pick segment + function, then drag handle or offset slider.",
        editable: false,
      },
    },
    { collapsed: true, hidden: !isDebugMode }
  );

  useControls(
    "Point Editing",
    {
      selectedWaypoint: {
        options: waypointOptions,
        value: useSplineCameraStore.getState().selectedWaypoint ?? -1,
        label: "Point",
        onChange: (v) => useSplineCameraStore.getState().setSelectedWaypoint(Number(v)),
      },
      pointAxis: {
        options: { X: "x", Y: "y", Z: "z" },
        value: activeAxis,
        label: "Axis",
        onChange: (v) => useSplineCameraStore.getState().setActiveAxis(v),
      },
      currentAxisValue: {
        value:
          useSplineCameraStore.getState().selectedWaypoint >= 0
            ? (
                waypoints[useSplineCameraStore.getState().selectedWaypoint]?.pos?.[axisIdx] ?? 0
              ).toFixed(4)
            : "select point",
        editable: false,
        label: "Current",
      },
      "Axis +": button(() => useSplineCameraStore.getState().nudgeSelected(+1)),
      "Axis -": button(() => useSplineCameraStore.getState().nudgeSelected(-1)),
      hint: {
        value: "Pick point + axis, then Axis +/- to increase/decrease value.",
        editable: false,
      },
    },
    { collapsed: true, hidden: !isDebugMode }
  );

  return null;
}
