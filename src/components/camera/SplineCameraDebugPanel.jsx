// src/components/camera/SplineCameraDebugPanel.jsx
// Leva debug panel for the spline camera — only mounts when isDebugMode is true.

import { useControls } from "leva";
import { useSplineCameraStore } from "../../state/useSplineCameraStore";
import { SPLINE_WAYPOINTS } from "../../utils/splineCameraPath";

export default function SplineCameraDebugPanel() {
  const uAtWaypoint = useSplineCameraStore((s) => s.sampler.uAtWaypoint);

  useControls("Spline Camera", {
    enabled: {
      value: useSplineCameraStore.getState().enabled,
      onChange: (v) => useSplineCameraStore.getState().setEnabled(v),
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
      options: Object.fromEntries(
        SPLINE_WAYPOINTS.map((w, i) => [w.name, uAtWaypoint[i]])
      ),
      onChange: (u) => useSplineCameraStore.getState().setT(u),
    },
  }, { collapsed: true });

  return null;
}
