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
import { useControls, folder } from "leva";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useCameraStore } from "../state/useCameraStore";

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

  // Prefer this clip by default
  const defaultClip = useMemo(() => {
    if (!names || names.length === 0) return "None";
    return (
      names.find((n) => n === "Gun_Idle") ||
      names.find((n) => /gun.*idle|idle.*gun/i.test(n)) ||
      names[0]
    );
  }, [names]);

  // Controls: transform + animation
  const {
    positionX,
    positionY,
    positionZ,
    rotationYDeg,
    scale,
    clipName,
    playbackSpeed,
    waveOnStop5,
    waveDuration,
    manualTriggerWave,
  } = useControls({
    Man: folder({
      Transform: folder({
        positionX: { value: -1.6, min: -50, max: 50, step: 0.01 },
        positionY: { value: -4.433, min: -50, max: 50, step: 0.01 },
        positionZ: { value: -2.95, min: -50, max: 50, step: 0.01 },
        rotationYDeg: {
          value: 12.9,
          min: -180,
          max: 180,
          step: 0.1,
          label: "Rotation Y (deg)",
        },
        scale: {
          value: 0.06,
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
    }),
  });

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

    console.groupCollapsed("👨 Man model loaded");
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
  }, [cloned]);

  // Log animation clips and tracks once
  useEffect(() => {
    if (!clips || clips.length === 0) {
      console.info("👨 Man: no animations found in GLB.");
      return;
    }
    console.groupCollapsed("👨 Man animations loaded");
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
  }, [clips]);

  // Switch animation on control change
  const currentActionRef = useRef(null);
  const [lastWaypointIndex, setLastWaypointIndex] = useState(-1);
  const waveActionRef = useRef(null);

  // Subscribe to camera store to detect stop-5
  const currentWaypointIndex = useCameraStore((state) => {
    const waypoints = state.waypoints || [];
    const t = state.t ?? 0;
    const nSeg = waypoints.length - 1;
    if (nSeg <= 0) return -1;
    // Find nearest waypoint
    const nearestIdx = Math.round(t * nSeg);
    const WAYPOINT_EPS = 1e-4;
    const atWaypoint = Math.abs(t - nearestIdx / nSeg) <= WAYPOINT_EPS;
    return atWaypoint ? nearestIdx : -1;
  });

  // Detect arrival at stop-5 and trigger wave animation
  useEffect(() => {
    if (!waveOnStop5 || !actions) return;

    const stop5Index = 5; // stop-5 is at index 5 in the waypoints array

    // Check if we just arrived at stop-5
    if (
      currentWaypointIndex === stop5Index &&
      lastWaypointIndex !== stop5Index
    ) {
      console.log("🎬 Camera reached stop-5! Triggering wave animation...");
      triggerWaveAnimation();
    }

    setLastWaypointIndex(currentWaypointIndex);
  }, [currentWaypointIndex, waveOnStop5, actions, lastWaypointIndex]);

  // Manual trigger for testing
  useEffect(() => {
    if (manualTriggerWave && actions) {
      console.log("🎬 Manual wave trigger activated");
      triggerWaveAnimation();
    }
  }, [manualTriggerWave, actions]);

  // Function to play wave animation once
  const triggerWaveAnimation = () => {
    if (!actions) return;

    const waveClipName = "CharacterArmature|Wave";
    const waveAction = actions[waveClipName];

    if (!waveAction) {
      console.warn(`⚠️ Wave animation "${waveClipName}" not found in actions`);
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

    console.log(
      `👋 Playing wave animation (clip duration: ${clipDuration.toFixed(
        2
      )}s, user duration: ${effectiveDuration.toFixed(2)}s)`
    );

    // After wave finishes, resume the previous animation
    setTimeout(() => {
      if (waveAction) {
        waveAction.fadeOut(0.3);
      }
      if (currentAction && currentAction !== waveAction) {
        currentAction.reset().fadeIn(0.3).play();
        console.log(
          `↩️ Resumed previous animation: ${currentAction.getClip().name}`
        );
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
      console.log("⏹️ Man animation stopped");
      return;
    }

    const next = actions[nextName];
    if (!next) return;

    if (prev && prev !== next) {
      prev.fadeOut(0.2);
    }
    next.reset().fadeIn(0.2).play();
    currentActionRef.current = next;
    console.log(`▶️ Man playing clip: ${nextName}`);

    return () => {
      // optional cleanup: keep running across remounts if desired
    };
  }, [actions, clipName]);

  // Mixer event logs
  useEffect(() => {
    if (!mixer) return;
    const onLoop = (e) =>
      console.log("🔁 Man clip looped:", e?.action?.getClip()?.name);
    const onFinished = (e) =>
      console.log("🏁 Man clip finished:", e?.action?.getClip()?.name);
    mixer.addEventListener("loop", onLoop);
    mixer.addEventListener("finished", onFinished);
    return () => {
      mixer.removeEventListener("loop", onLoop);
      mixer.removeEventListener("finished", onFinished);
    };
  }, [mixer]);

  // Confirm that it actually renders at least once
  const renderedOnce = useRef(false);
  const onAfterRender = () => {
    if (!renderedOnce.current) {
      renderedOnce.current = true;
      console.log("✅ Man model rendered to the canvas at least once.");
    }
  };

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
      <primitive object={cloned} onAfterRender={onAfterRender} />
    </group>
  );
});

useGLTF.preload("/models/man/man_draco_optimized.glb"); // Using Draco-compressed and animation-optimized version
