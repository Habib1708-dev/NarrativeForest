// src/pages/CameraDebug.jsx
// Standalone debug page for editing the spline camera path.
// Renders the full scene + the spline geometry overlay + a custom sidebar.

import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useSplineCameraStore } from "../state/useSplineCameraStore";
import { useDebugStore } from "../state/useDebugStore";
import Experience from "../Experience";
import SplineCameraDebugView from "../components/camera/SplineCameraDebugView";
import CameraDebugSidebar from "../components/camera/CameraDebugSidebar";

// ------------------------------------------------------------------
// CameraBridge — lives inside Canvas, pushes the R3F camera into store
// so the "Capture Pose" button in the sidebar can read it.
// ------------------------------------------------------------------
function CameraBridge() {
  const { camera } = useThree();
  const setCameraRef = useSplineCameraStore((s) => s.setCameraRef);
  useEffect(() => {
    setCameraRef(camera);
    return () => setCameraRef(null);
  }, [camera, setCameraRef]);
  return null;
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------
export default function CameraDebug() {
  useEffect(() => {
    // Force debug mode on — enables OrbitControls inside Experience
    // and shows the Leva panel from SplineCameraController.
    useDebugStore.getState().setDebugMode(true);
    document.body.classList.add("debug-mode");
    document.body.classList.remove("user-mode");

    return () => {
      // Restore to user mode when leaving this page
      useDebugStore.getState().setDebugMode(false);
      document.body.classList.remove("debug-mode");
      document.body.classList.add("user-mode");
    };
  }, []);

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* ---- 3D Canvas (left, fills remaining width) ---- */}
      <Canvas
        style={{ flex: 1, height: "100%" }}
        camera={{ position: [-1.8, -4.8, -5], fov: 50, near: 0.05, far: 2000 }}
        gl={{ preserveDrawingBuffer: false, powerPreference: "high-performance" }}
        dpr={[1, 1.5]}
      >
        {/* Full scene — same as Home page */}
        <Experience />

        {/* Spline path overlay — colored segments, waypoint spheres, handles */}
        <SplineCameraDebugView />

        {/* Bridge: keeps store._cameraRef in sync for Capture Pose */}
        <CameraBridge />
      </Canvas>

      {/* ---- Custom sidebar (right, fixed 340px) ---- */}
      <CameraDebugSidebar />
    </div>
  );
}
