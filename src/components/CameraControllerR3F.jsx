import { useEffect, useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useControls, folder } from "leva";
import { useCameraStore } from "../state/useCameraStore";
import { yawPitchFromQuaternion } from "../utils/cameraInterp";

// Minimal gizmos: spheres at waypoint positions and optional lines to lookAt targets
function CameraWaypointGizmos() {
  const waypoints = useCameraStore((s) => s.waypoints);
  const gizmos = useCameraStore((s) => s.gizmos);
  return (
    <group>
      {waypoints.map((w, idx) => {
        const key = w.name ?? `wp-${idx}`;
        const show = gizmos[key] ?? false;
        if (!show) return null;
        const hasLookAt = "lookAt" in w.orientation;
        return (
          <group key={key}>
            <mesh position={w.position}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color={"#6cf"} />
            </mesh>
            {hasLookAt && (
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    array={
                      new Float32Array([
                        w.position[0],
                        w.position[1],
                        w.position[2],
                        w.orientation.lookAt[0],
                        w.orientation.lookAt[1],
                        w.orientation.lookAt[2],
                      ])
                    }
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
  const setT = useCameraStore((s) => s.setT);
  const getPose = useCameraStore((s) => s.getPose);
  const enabled = useCameraStore((s) => s.enabled);
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

  // Leva controls
  const waypointNames = useMemo(
    () => waypoints.map((w, i) => w.name ?? `wp-${i}`),
    [waypoints]
  );
  const values = useControls(
    "Narrative/Camera",
    {
      enabled: {
        value: useCameraStore.getState().enabled,
        onChange: (v) => useCameraStore.getState().setEnabled(v),
      },
      GlobalSS: {
        value: globalSS,
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
        onChange: (v) => setT(v),
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

  const lastLogRef = useRef({ pos: new THREE.Vector3(), yaw: 0, pitch: 0 });
  const stillTimerRef = useRef(0);
  const stillLoggedRef = useRef(false);

  useFrame((_, dt) => {
    // Track current segment for logging
    const tNow = useCameraStore.getState().t ?? 0;
    tRef.current = tNow;
    const seg = getSegmentIndex(tNow);
    if (seg !== lastSegRef.current) {
      const wps = useCameraStore.getState().waypoints;
      const a = wps[seg];
      const b = wps[seg + 1];
      if (a && b) {
        console.log(
          `[Camera segment] ${seg}: ${a.name ?? `wp-${seg}`} -> ${
            b.name ?? `wp-${seg + 1}`
          }`
        );
      }
      lastSegRef.current = seg;
    }
    // Apply pose only when enabled and not locked/paused
    if (enabled && !(locked || paused)) {
      const { position, quaternion, fov } = getPose();
      camera.position.copy(position);
      camera.quaternion.copy(quaternion);
      if (camera.isPerspectiveCamera && fov != null) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }

    // Detect stillness on the current camera regardless of enabled
    const lp = lastLogRef.current.pos;
    const dyawpitch = yawPitchFromQuaternion(camera.quaternion);
    const curPos = camera.position;
    const dPos = lp.distanceTo(curPos);
    const dyaw = Math.abs(dyawpitch.yaw - lastLogRef.current.yaw);
    const dpitch = Math.abs(dyawpitch.pitch - lastLogRef.current.pitch);
    const MOV_EPS = 1e-4;
    const ROT_EPS = 1e-4;
    if (dPos < MOV_EPS && dyaw < ROT_EPS && dpitch < ROT_EPS) {
      stillTimerRef.current += dt;
      if (stillTimerRef.current > 0.3 && !stillLoggedRef.current) {
        const yawDeg = (dyawpitch.yaw * 180) / Math.PI;
        const pitchDeg = (dyawpitch.pitch * 180) / Math.PI;
        console.log(
          `[Camera still] pos=(${curPos.x.toFixed(3)}, ${curPos.y.toFixed(
            3
          )}, ${curPos.z.toFixed(3)}), yawDeg=${yawDeg.toFixed(
            1
          )}, pitchDeg=${pitchDeg.toFixed(1)}`
        );
        stillLoggedRef.current = true;
      }
    } else {
      stillTimerRef.current = 0;
      stillLoggedRef.current = false;
      lp.copy(curPos);
      lastLogRef.current.yaw = dyawpitch.yaw;
      lastLogRef.current.pitch = dyawpitch.pitch;
    }
  });

  // Scroll coupling: inertia model
  useEffect(() => {
    const onWheel = (e) => {
      const store = useCameraStore.getState();
      if (!store.enabled) return;
      if (store.locked || store.paused) return;
      if (store.mode !== "path") return;
      applyWheel(e.deltaY);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [applyWheel]);

  useEffect(() => {
    if (mode !== "freeFly") return;
    let pointerActive = false;
    const onPointerDown = (e) => {
      if (!e.isPrimary || e.button !== 0) return;
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

  return (
    <>
      {/* Only render gizmos when enabled to avoid clutter */}
      {enabled && <CameraWaypointGizmos />}
    </>
  );
}
