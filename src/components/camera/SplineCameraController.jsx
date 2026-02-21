// src/components/camera/SplineCameraController.jsx
// R3F component for the spline-based scroll camera.
// Completely independent of CameraControllerR3F and useCameraStore.

import { useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useSplineCameraStore } from "../../state/useSplineCameraStore";
import { useCameraStore } from "../../state/useCameraStore";
import { useDebugStore } from "../../state/useDebugStore";
import SplineCameraDebugPanel from "./SplineCameraDebugPanel";
import SplineCameraDebugView from "./SplineCameraDebugView";

export default function SplineCameraController() {
  const { camera } = useThree();
  const isDebugMode = useDebugStore((s) => s.isDebugMode);
  const showSplineGeometry = useSplineCameraStore((s) => s.showSplineGeometry);
  const splineEnabled = useSplineCameraStore((s) => s.enabled);
  const mode = useSplineCameraStore((s) => s.mode);
  const t = useSplineCameraStore((s) => s.t ?? 0);
  const getPose = useSplineCameraStore((s) => s.getPose);
  const applyWheel = useSplineCameraStore((s) => s.applyWheel);
  const updateFreeFly = useSplineCameraStore((s) => s.updateFreeFly);
  const enterFreeFlyAtEnd = useSplineCameraStore((s) => s.enterFreeFlyAtEnd);
  const startFreeFlyDrag = useSplineCameraStore((s) => s.startFreeFlyDrag);
  const dragFreeFly = useSplineCameraStore((s) => s.dragFreeFly);
  const endFreeFlyDrag = useSplineCameraStore((s) => s.endFreeFlyDrag);

  const isAtEnd = t >= 0.999;
  const showJoystick = splineEnabled && (mode === "freeFly" || (mode === "path" && isAtEnd));

  // Sync spline enabled state to global camera store so Experience.jsx can show
  // OrbitControls when spline is disabled (free roam for debugging).
  useEffect(() => {
    useCameraStore.getState().setEnabled(splineEnabled);
    return () => useCameraStore.getState().setEnabled(false);
  }, [splineEnabled]);

  // Apply camera pose every frame; when in freefly, run physics then apply pose
  useFrame((_, dt) => {
    if (!useSplineCameraStore.getState().enabled) return;
    const store = useSplineCameraStore.getState();
    if (store.mode === "freeFly") {
      updateFreeFly(dt);
    }
    const { position, quaternion, fov } = getPose();
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    if (camera.isPerspectiveCamera && fov != null) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  // Mouse wheel scroll
  useEffect(() => {
    const onWheel = (e) => {
      const splineEnabled = useSplineCameraStore.getState().enabled;
      if (!splineEnabled) {
        // Free roam: prevent document scroll so OrbitControls can zoom continuously
        e.preventDefault();
        return;
      }
      // Pass native wheel delta directly; sign normalization happens in the store.
      applyWheel(e.deltaY);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [applyWheel]);

  // Joystick: when at end of path, pointer-down enters freeflight then starts drag; when already freefly, just drag
  useEffect(() => {
    if (!showJoystick) return;
    const ignoreSelector =
      "button, input, textarea, select, a, [role='button'], [role='link'], [role='textbox'], [data-freefly-ignore]";
    const isIgnoredTarget = (target) =>
      target instanceof Element && Boolean(target.closest(ignoreSelector));

    const onPointerDown = (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      if (isIgnoredTarget(e.target)) return;
      e.preventDefault();
      const store = useSplineCameraStore.getState();
      if (store.mode === "path" && store.t >= 0.999) {
        enterFreeFlyAtEnd();
      }
      startFreeFlyDrag(e.clientX, e.clientY);
    };
    const onPointerMove = (e) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      dragFreeFly(e.clientX, e.clientY);
    };
    const onPointerEnd = () => endFreeFlyDrag();

    window.addEventListener("pointerdown", onPointerDown, { passive: false });
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      endFreeFlyDrag();
    };
  }, [showJoystick, enterFreeFlyAtEnd, startFreeFlyDrag, dragFreeFly, endFreeFlyDrag]);

  // Touch / pointer drag scroll (same pattern as CameraControllerR3F)
  useEffect(() => {
    if (typeof window === "undefined" || !window.PointerEvent) return undefined;

    const TOUCH_DELTA_MULTIPLIER = 36;
    const MIN_TOUCH_DELTA = 0.5;
    const interactiveSelector =
      "button, input, textarea, select, a, [role='button'], [role='link'], [role='textbox'], [data-touch-scroll='ignore']";

    const shouldProcess = () => useSplineCameraStore.getState().enabled;

    const isInteractiveTarget = (target) => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest(interactiveSelector));
    };

    let activePointerId = null;
    let lastY = 0;

    const detachPointerListeners = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    const onPointerMove = (event) => {
      if (event.pointerId !== activePointerId) return;
      if (!shouldProcess()) { onPointerUp(event); return; }

      const dy = event.clientY - lastY;
      if (Math.abs(dy) < MIN_TOUCH_DELTA) return;

      lastY = event.clientY;
      // Positive dy (finger moving down) maps to positive deltaY.
      const deltaY = dy * TOUCH_DELTA_MULTIPLIER;
      applyWheel(deltaY);
      event.preventDefault();
    };

    const onPointerUp = (event) => {
      if (event.pointerId !== activePointerId) return;
      activePointerId = null;
      detachPointerListeners();
    };

    const onPointerDown = (event) => {
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      if (activePointerId !== null) return;
      if (!shouldProcess()) return;
      if (isInteractiveTarget(event.target)) return;

      activePointerId = event.pointerId;
      lastY = event.clientY;
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      event.preventDefault();
    };

    window.addEventListener("pointerdown", onPointerDown, { passive: false });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      detachPointerListeners();
    };
  }, [applyWheel]);

  return (
    <>
      {isDebugMode && <SplineCameraDebugPanel />}
      {(isDebugMode || showSplineGeometry) && <SplineCameraDebugView />}
    </>
  );
}
