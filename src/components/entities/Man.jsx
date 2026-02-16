import React, {
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import * as THREE from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useControls, folder } from "leva";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useCameraStore } from "../../state/useCameraStore";
import { useDebugStore } from "../../state/useDebugStore";

// Static defaults — used when not in debug mode to avoid Leva overhead
const MAN_DEFAULTS = Object.freeze({
  positionX: -1.6,
  positionY: -4.433,
  positionZ: -2.95,
  rotationYDeg: 12.9,
  scale: 0.06,
  playbackSpeed: 1,
  waveOnStop5: true,
  waveDuration: 3.0,
  manualTriggerWave: false,
});

// Debug-only Leva panel — only mounts when isDebugMode is true
function ManDebugPanel({ defaultClip, names, onChange }) {
  const values = useControls({
    Man: folder({
      Transform: folder({
        positionX: { value: MAN_DEFAULTS.positionX, min: -50, max: 50, step: 0.01 },
        positionY: { value: MAN_DEFAULTS.positionY, min: -50, max: 50, step: 0.01 },
        positionZ: { value: MAN_DEFAULTS.positionZ, min: -50, max: 50, step: 0.01 },
        rotationYDeg: {
          value: MAN_DEFAULTS.rotationYDeg,
          min: -180,
          max: 180,
          step: 0.1,
          label: "Rotation Y (deg)",
        },
        scale: {
          value: MAN_DEFAULTS.scale,
          min: 0.001,
          max: 10,
          step: 0.0005,
          label: "Uniform Scale",
        },
      }),
      Animation: folder({
        clipName: {
          value: defaultClip || "None",
          options: ["None", ...(names || [])],
          label: "Clip",
        },
        playbackSpeed: { value: 1, min: 0, max: 3, step: 0.05, label: "Speed" },
      }),
      "Stop-5 Integration": folder({
        waveOnStop5: { value: true, label: "Enable Wave at Stop-5" },
        waveDuration: {
          value: 3.0,
          min: 0.5,
          max: 10,
          step: 0.1,
          label: "Wave Duration (s)",
        },
        manualTriggerWave: {
          value: false,
          label: "Manual Trigger Wave",
        },
      }),
    }, { collapsed: true }),
  });
  useEffect(() => {
    onChange(values);
  }, [
    values.positionX, values.positionY, values.positionZ,
    values.rotationYDeg, values.scale, values.clipName,
    values.playbackSpeed, values.waveOnStop5, values.waveDuration,
    values.manualTriggerWave,
  ]);
  return null;
}

export default forwardRef(function Man(_, ref) {
  // Load the GLB from /public (using Draco-compressed and animation-optimized version)
  const { scene, animations } = useGLTF("/models/man/man_draco_optimized.glb");

  // Clone with SkeletonUtils so skinned animations remain intact
  const cloned = useMemo(() => (scene ? skeletonClone(scene) : null), [scene]);

  // Root group ref for animations AND for fog occluder usage
  const groupRef = useRef();
  useImperativeHandle(ref, () => groupRef.current, []);

  // Animation system
  const { actions, names, clips, mixer } = useAnimations(
    animations || [],
    groupRef
  );

  const isDebugMode = useDebugStore((s) => s.isDebugMode);

  // Prefer this clip by default
  const defaultClip = useMemo(() => {
    if (!names || names.length === 0) return "None";
    return (
      names.find((n) => n === "Gun_Idle") ||
      names.find((n) => /gun.*idle|idle.*gun/i.test(n)) ||
      names[0]
    );
  }, [names]);

  // Debug controls state (null when not debugging)
  const [debugValues, setDebugValues] = useState(null);
  useEffect(() => {
    if (!isDebugMode) setDebugValues(null);
  }, [isDebugMode]);

  // Active values: debug overrides or static defaults
  const activeVals = debugValues ?? MAN_DEFAULTS;
  const {
    positionX,
    positionY,
    positionZ,
    rotationYDeg,
    scale,
    playbackSpeed,
    waveOnStop5,
    waveDuration,
    manualTriggerWave,
  } = activeVals;
  const clipName = debugValues?.clipName ?? defaultClip;

  // Traverse once to enable shadows and collect info
  useEffect(() => {
    if (!cloned) return;

    const meshes = [];
    const materials = new Map();

    cloned.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;

        const mat = Array.isArray(o.material) ? o.material : [o.material];
        mat.forEach((m) => m && materials.set(m.uuid, m));
        meshes.push({
          name: o.name || "(unnamed)",
          uuid: o.uuid,
          geometryUUID: o.geometry?.uuid,
          materialNames: mat.map((m) => (m?.name ? m.name : "")),
        });
      }
    });

    if (process.env.NODE_ENV !== "production") {
      console.groupCollapsed("Man model loaded");
      console.log("Source:", "/models/man/man_draco_optimized.glb");
      console.log("Meshes:", meshes.length, "Unique materials:", materials.size);
      if (meshes.length) {
        console.groupCollapsed("Meshes");
        console.table(
          meshes.map((m, i) => ({
            idx: i,
            name: m.name,
            uuid: m.uuid,
            geometryUUID: m.geometryUUID,
            materials: m.materialNames.join(", "),
          }))
        );
        console.groupEnd();
      }
      if (materials.size) {
        console.groupCollapsed("Unique Materials");
        console.table(
          Array.from(materials.values()).map((m) => ({
            name: m.name || "",
            uuid: m.uuid,
            type: m.type,
            transparent: !!m.transparent,
            opacity: m.opacity,
          }))
        );
        console.groupEnd();
      }
      console.groupEnd();
    }
  }, [cloned]);

  // Log animation clips and tracks once
  useEffect(() => {
    if (!clips || clips.length === 0) return;
    if (process.env.NODE_ENV !== "production") {
      console.groupCollapsed("Man animations loaded");
      console.log(
        "Clip names:",
        clips.map((c) => c.name)
      );
      console.table(
        clips.map((c, i) => ({
          idx: i,
          name: c.name,
          duration: c.duration?.toFixed?.(2),
          tracks: c.tracks?.length ?? 0,
        }))
      );
      clips.slice(0, 3).forEach((c) => {
        console.groupCollapsed(
          `Tracks for "${c.name}" (${c.tracks?.length || 0})`
        );
        (c.tracks || []).slice(0, 10).forEach((t, i) => {
          console.log(
            `${i}. ${t.name} :: ${t.ValueTypeName} (${t.times?.length || 0} keys)`
          );
        });
        console.groupEnd();
      });
      console.groupEnd();
    }
  }, [clips]);

  // Switch animation on control change
  const currentActionRef = useRef(null);
  const waveActionRef = useRef(null);
  const { camera } = useThree();

  // Wave every time camera enters trigger position (3 decimal precision). Resets when camera leaves.
  const wasAtTriggerRef = useRef(false);
  // Target position -1.974, -4.492, -3.486 (3 decimals) as integer thousandths for fast comparison
  const TARGET_X = -1974;
  const TARGET_Y = -4492;
  const TARGET_Z = -3486;
  // Only run position check when path t is near stop-5 (avoids camera read + 3 round() on most frames)
  const stop5T = useCameraStore((s) => {
    const wps = s.waypoints || [];
    const n = wps.length - 1;
    if (n <= 0) return -1;
    const i = wps.findIndex((w) => w?.name === "stop-5");
    return i >= 0 ? i / n : -1;
  });
  const T_NEAR = 0.02; // within 2% of path length of stop-5

  useFrame(() => {
    if (!waveOnStop5 || !actions) return;
    const t = useCameraStore.getState().t ?? 0;
    if (Math.abs(t - stop5T) > T_NEAR) {
      wasAtTriggerRef.current = false;
      return;
    }
    const p = camera.position;
    const atPosition =
      Math.round(p.x * 1000) === TARGET_X &&
      Math.round(p.y * 1000) === TARGET_Y &&
      Math.round(p.z * 1000) === TARGET_Z;
    if (!atPosition) {
      wasAtTriggerRef.current = false;
      return;
    }
    if (wasAtTriggerRef.current) return;
    wasAtTriggerRef.current = true;
    triggerWaveAnimation();
  });

  // Manual trigger for testing
  useEffect(() => {
    if (manualTriggerWave && actions) {
      if (process.env.NODE_ENV !== "production") console.log("Manual wave trigger activated");
      triggerWaveAnimation();
    }
  }, [manualTriggerWave, actions]);

  // Function to play wave animation once
  const triggerWaveAnimation = () => {
    if (!actions) return;

    const waveClipName = "CharacterArmature|Wave";
    const waveAction = actions[waveClipName];

    if (!waveAction) {
      if (process.env.NODE_ENV !== "production") console.warn(`Wave animation "${waveClipName}" not found in actions`);
      return;
    }

    // Stop current looping animation temporarily
    const currentAction = currentActionRef.current;
    if (currentAction && currentAction !== waveAction) {
      currentAction.fadeOut(0.3);
    }

    // Configure wave to play once
    waveAction.reset();
    waveAction.setLoop(THREE.LoopOnce, 1);
    waveAction.clampWhenFinished = true;
    waveAction.timeScale = 1.0;

    // Calculate duration and play
    const clipDuration = waveAction.getClip().duration;
    const effectiveDuration = waveDuration || clipDuration;

    waveAction.fadeIn(0.3).play();
    waveActionRef.current = waveAction;

    if (process.env.NODE_ENV !== "production") console.log(`Playing wave animation (clip: ${clipDuration.toFixed(2)}s, user: ${effectiveDuration.toFixed(2)}s)`);

    // After wave finishes, resume the previous animation
    setTimeout(() => {
      if (waveAction) {
        waveAction.fadeOut(0.3);
      }
      if (currentAction && currentAction !== waveAction) {
        currentAction.reset().fadeIn(0.3).play();
        if (process.env.NODE_ENV !== "production") console.log(`Resumed previous animation: ${currentAction.getClip().name}`);
      }
      waveActionRef.current = null;
    }, effectiveDuration * 1000);
  };

  useEffect(() => {
    if (!mixer) return;
    mixer.timeScale = playbackSpeed ?? 1;
  }, [mixer, playbackSpeed]);

  useEffect(() => {
    if (!actions) return;

    const nextName = clipName && clipName !== "None" ? clipName : null;
    const prev = currentActionRef.current;

    if (!nextName) {
      Object.values(actions).forEach((a) => a?.stop());
      if (prev) currentActionRef.current = null;
      if (process.env.NODE_ENV !== "production") console.log("Man animation stopped");
      return;
    }

    const next = actions[nextName];
    if (!next) return;

    if (prev && prev !== next) {
      prev.fadeOut(0.2);
    }
    next.reset().fadeIn(0.2).play();
    currentActionRef.current = next;
    if (process.env.NODE_ENV !== "production") console.log(`Man playing clip: ${nextName}`);

    return () => {
      // optional cleanup: keep running across remounts if desired
    };
  }, [actions, clipName]);

  // Mixer event logs (dev only — these fire on every animation loop/finish)
  useEffect(() => {
    if (!mixer || process.env.NODE_ENV === "production") return;
    const onLoop = (e) =>
      console.log("Man clip looped:", e?.action?.getClip()?.name);
    const onFinished = (e) =>
      console.log("Man clip finished:", e?.action?.getClip()?.name);
    mixer.addEventListener("loop", onLoop);
    mixer.addEventListener("finished", onFinished);
    return () => {
      mixer.removeEventListener("loop", onLoop);
      mixer.removeEventListener("finished", onFinished);
    };
  }, [mixer]);

  // Confirm that it actually renders at least once (dev only)
  const renderedOnce = useRef(false);
  const onAfterRender = process.env.NODE_ENV !== "production" ? () => {
    if (!renderedOnce.current) {
      renderedOnce.current = true;
      console.log("Man model rendered to the canvas at least once.");
    }
  } : undefined;

  if (!cloned) return null;

  const rotationY = THREE.MathUtils.degToRad(rotationYDeg || 0);

  return (
    <group
      ref={groupRef}
      name="Man"
      dispose={null}
      position={[positionX, positionY, positionZ]}
      rotation={[0, rotationY, 0]}
      scale={scale}
    >
      {isDebugMode && (
        <ManDebugPanel
          defaultClip={defaultClip}
          names={names}
          onChange={setDebugValues}
        />
      )}
      <primitive object={cloned} {...(onAfterRender ? { onAfterRender } : {})} />
    </group>
  );
});

useGLTF.preload("/models/man/man_draco_optimized.glb"); // Using Draco-compressed and animation-optimized version
