import { useEffect, useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useControls, folder } from "leva";
import { useCameraStore } from "../../state/useCameraStore";
import { useDebugStore } from "../../state/useDebugStore";

// Debug-only Leva panel — only mounts when isDebugMode is true
// to eliminate ~40+ reactive property subscriptions when not debugging
function CameraDebugPanel({ waypoints }) {
  const waypointNames = useMemo(
    () => waypoints.map((w, i) => w.name ?? `wp-${i}`),
    [waypoints]
  );
  useControls(
    "Narrative/Camera",
    {
      enabled: {
        value: useCameraStore.getState().enabled,
        onChange: (v) => useCameraStore.getState().setEnabled(v),
      },
      GlobalSS: {
        value: useCameraStore.getState().globalSS,
        min: 0,
        max: 5,
        step: 0.01,
        onChange: (v) => useCameraStore.getState().setGlobalSS(v),
      },
      t: {
        value: useCameraStore.getState().t ?? 0,
        min: 0,
        max: 1,
        step: 0.001,
        onChange: (v) => useCameraStore.getState().setT(v),
      },
      jump: {
        options: Object.fromEntries(waypointNames.map((n, i) => [n, i])),
        value: 0,
        onChange: (i) => useCameraStore.getState().jumpToWaypoint(Number(i)),
      },
      locked: {
        value: false,
        onChange: (v) => useCameraStore.getState().setLocked(v),
      },
      paused: {
        value: false,
        onChange: (v) => useCameraStore.getState().setPaused(v),
      },
      Gizmos: folder(
        Object.fromEntries(
          waypointNames.map((n) => [
            n,
            {
              value: useCameraStore.getState().gizmos[n] ?? false,
              onChange: (v) => useCameraStore.getState().setGizmo(n, v),
            },
          ])
        )
      ),
      "LocalSS (percent)": folder(
        Object.fromEntries(
          waypoints.slice(0, Math.max(0, waypoints.length - 1)).map((w, i) => [
            `${w.name ?? `seg-${i}`}_${i}->${i + 1}`,
            {
              value: useCameraStore.getState().localSSPercent?.[i] ?? 0,
              min: -100,
              max: 300,
              step: 1,
              onChange: (v) =>
                useCameraStore.getState().setLocalSSPercent(i, v),
            },
          ])
        )
      ),
      "Step Model": folder({
        baseStep: {
          value: useCameraStore.getState().magnitudeMap.baseStep,
          min: 10,
          max: 400,
          step: 10,
          onChange: (v) =>
            useCameraStore.getState().setMagnitudeMap({ baseStep: v }),
        },
        scaleFactor: {
          value: useCameraStore.getState().magnitudeMap.scaleFactor,
          min: 0.0001,
          max: 0.005,
          step: 0.0001,
          onChange: (v) =>
            useCameraStore.getState().setMagnitudeMap({ scaleFactor: v }),
        },
        power: {
          value: useCameraStore.getState().magnitudeMap.power,
          min: 0.2,
          max: 2.0,
          step: 0.05,
          onChange: (v) =>
            useCameraStore.getState().setMagnitudeMap({ power: v }),
        },
        maxStep: {
          value: useCameraStore.getState().magnitudeMap.maxStep,
          min: 0.001,
          max: 0.05,
          step: 0.001,
          onChange: (v) =>
            useCameraStore.getState().setMagnitudeMap({ maxStep: v }),
        },
      }),
      Scenic: folder({
        dwellMs: {
          value: useCameraStore.getState().scenicDwellMs,
          min: 0,
          max: 2000,
          step: 50,
          onChange: (v) => useCameraStore.getState().setScenicDwellMs(v),
        },
        snapRadius: {
          value: useCameraStore.getState().scenicSnapRadius,
          min: 0,
          max: 0.05,
          step: 0.001,
          onChange: (v) => useCameraStore.getState().setScenicSnapRadius(v),
        },
        resist: {
          value: useCameraStore.getState().scenicResist,
          min: 0,
          max: 1,
          step: 0.01,
          onChange: (v) => useCameraStore.getState().setScenicResist(v),
        },
      }),
    },
    { collapsed: false }
  );
  return null;
}

// Minimal gizmos: spheres at waypoint positions and optional lines to lookAt targets
function CameraWaypointGizmos() {
  const waypoints = useCameraStore((s) => s.waypoints);
  const gizmos = useCameraStore((s) => s.gizmos);

  // Memoize Float32Arrays to avoid per-render allocations
  const lineArrays = useMemo(() => {
    return waypoints.map((w) => {
      if (!("lookAt" in w.orientation)) return null;
      return new Float32Array([
        w.position[0],
        w.position[1],
        w.position[2],
        w.orientation.lookAt[0],
        w.orientation.lookAt[1],
        w.orientation.lookAt[2],
      ]);
    });
  }, [waypoints]);

  return (
    <group>
      {waypoints.map((w, idx) => {
        const key = w.name ?? `wp-${idx}`;
        const show = gizmos[key] ?? false;
        if (!show) return null;
        const lineArray = lineArrays[idx];
        return (
          <group key={key}>
            <mesh position={w.position}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color={"#6cf"} />
            </mesh>
            {lineArray && (
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={lineArray}
                    count={2}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#6cf" linewidth={1} />
              </line>
            )}
          </group>
        );
      })}
    </group>
  );
}

export default function CameraControllerR3F() {
  // Keep current camera behavior unless enabled is true
  const { camera } = useThree();
  const isDebugMode = useDebugStore((state) => state.isDebugMode);
  const setT = useCameraStore((s) => s.setT);
  const getPose = useCameraStore((s) => s.getPose);
  const enabled = useCameraStore((s) => s.enabled);
  const setEnabled = useCameraStore((s) => s.setEnabled);
  const locked = useCameraStore((s) => s.locked);
  const paused = useCameraStore((s) => s.paused);
  const mode = useCameraStore((s) => s.mode);
  const waypoints = useCameraStore((s) => s.waypoints);
  const globalSS = useCameraStore((s) => s.globalSS);
  const getSegmentIndex = useCameraStore((s) => s.getSegmentIndex);
  const getEffectiveSensitivity = useCameraStore(
    (s) => s.getEffectiveSensitivity
  );
  const scenic = useCameraStore((s) => s.scenic);
  const scenicDwellMs = useCameraStore((s) => s.scenicDwellMs);
  const scenicSnapRadius = useCameraStore((s) => s.scenicSnapRadius);
  const scenicResist = useCameraStore((s) => s.scenicResist);
  const applyWheel = useCameraStore((s) => s.applyWheel);
  const startFreeFlyDrag = useCameraStore((s) => s.startFreeFlyDrag);
  const dragFreeFly = useCameraStore((s) => s.dragFreeFly);
  const endFreeFlyDrag = useCameraStore((s) => s.endFreeFlyDrag);
  const tRef = useRef(useCameraStore.getState().t ?? 0);
  const lastSegRef = useRef(-1);

  useFrame(() => {
    // Track current segment
    const tNow = useCameraStore.getState().t ?? 0;
    tRef.current = tNow;
    const seg = getSegmentIndex(tNow);
    if (seg !== lastSegRef.current) {
      lastSegRef.current = seg;
    }
    // Apply pose always (enabled only controls scrolling, not camera positioning)
    // Lock/pause still prevents updates during those states
    if (!(locked || paused)) {
      const { position, quaternion, fov } = getPose();
      camera.position.copy(position);
      camera.quaternion.copy(quaternion);
      if (camera.isPerspectiveCamera && fov != null) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  });

  // Scroll coupling: inertia model
  useEffect(() => {
    const onWheel = (e) => {
      const store = useCameraStore.getState();
      if (!store.enabled) return;
      if (store.locked || store.paused) return;
      // Allow wheel while in freeFly too (store handles scroll-back → exit freeFly).
      applyWheel(-e.deltaY);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [applyWheel]);

  useEffect(() => {
    if (mode !== "freeFly") return;
    let pointerActive = false;
    const ignoreSelector =
      "button, input, textarea, select, a, [role='button'], [role='link'], [role='textbox'], [data-freefly-ignore]";

    const isIgnoredTarget = (target) => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest(ignoreSelector));
    };

    const onPointerDown = (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      if (isIgnoredTarget(e.target)) return;
      pointerActive = true;
      e.preventDefault();
      startFreeFlyDrag(e.clientX, e.clientY);
    };
    const onPointerMove = (e) => {
      if (!pointerActive || !e.isPrimary) return;
      e.preventDefault();
      dragFreeFly(e.clientX, e.clientY);
    };
    const onPointerEnd = () => {
      if (!pointerActive) return;
      pointerActive = false;
      endFreeFlyDrag();
    };

    window.addEventListener("pointerdown", onPointerDown, {
      passive: false,
    });
    window.addEventListener("pointermove", onPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      endFreeFlyDrag();
    };
  }, [mode, startFreeFlyDrag, dragFreeFly, endFreeFlyDrag]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.PointerEvent) {
      return undefined;
    }

    const TOUCH_DELTA_MULTIPLIER = 36;
    const MIN_TOUCH_DELTA = 0.5;
    const interactiveSelector =
      "button, input, textarea, select, a, [role='button'], [role='link'], [role='textbox'], [data-touch-scroll='ignore']";

    const shouldProcess = () => {
      const {
        enabled: storeEnabled,
        locked: storeLocked,
        paused: storePaused,
        mode: storeMode,
      } = useCameraStore.getState();
      return (
        storeEnabled && !storeLocked && !storePaused && storeMode === "path"
      );
    };

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
      if (!shouldProcess()) {
        onPointerUp(event);
        return;
      }

      const dy = event.clientY - lastY;
      if (Math.abs(dy) < MIN_TOUCH_DELTA) return;

      lastY = event.clientY;
      const deltaY = -dy * TOUCH_DELTA_MULTIPLIER;
      applyWheel(-deltaY);
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
      {/* Debug panel only mounts when debug mode is active — eliminates Leva overhead */}
      {isDebugMode && <CameraDebugPanel waypoints={waypoints} />}
      {/* Only render gizmos when enabled to avoid clutter */}
      {enabled && <CameraWaypointGizmos />}
    </>
  );
}
