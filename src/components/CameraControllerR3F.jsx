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
  const waypoints = useCameraStore((s) => s.waypoints);

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
    },
    { collapsed: false }
  );

  const lastLogRef = useRef({ pos: new THREE.Vector3(), yaw: 0, pitch: 0 });
  const stillTimerRef = useRef(0);
  const stillLoggedRef = useRef(false);

  useFrame((_, dt) => {
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

  return (
    <>
      {/* Only render gizmos when enabled to avoid clutter */}
      {enabled && <CameraWaypointGizmos />}
    </>
  );
}
