// src/components/Man.jsx
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useControls, folder } from "leva";

export default function Man() {
  // Load
  const { scene, animations } = useGLTF("/models/man/man.glb");

  // Clone so skeleton/materials are instance-local
  const cloned = useMemo(() => (scene ? clone(scene) : null), [scene]);

  // Animation setup
  const groupRef = useRef();
  const { actions, names, mixer } = useAnimations(animations || [], groupRef);

  // Pick desired clip (handles "Idel_Gun" vs "Idle_Gun" and fallbacks)
  const desiredClip = useMemo(() => {
    if (!names?.length) return "";
    const exact =
      names.find((n) => n === "Idel_Gun") ||
      names.find((n) => n === "Idle_Gun");
    if (exact) return exact;
    const fuzzy = names.find((n) => /idle/i.test(n) && /gun/i.test(n));
    return fuzzy || names[0];
  }, [names]);

  // Leva controls
  const clipOptions = useMemo(
    () => Object.fromEntries((names || []).map((n) => [n, n])),
    [names]
  );

  const { posX, posY, posZ, rotYDeg, scale, clipName, play, speed } =
    useControls(
      () => ({
        Man: folder({
          Transform: folder({
            posX: { value: 0, min: -50, max: 50, step: 0.1 },
            posY: { value: 0, min: -20, max: 20, step: 0.1 },
            posZ: { value: 0, min: -50, max: 50, step: 0.1 },
            rotYDeg: {
              value: 0,
              min: -180,
              max: 180,
              step: 1,
              label: "Rotation Y (deg)",
            },
            scale: {
              value: 1,
              min: 0.01,
              max: 5,
              step: 0.01,
              label: "Uniform Scale",
            },
          }),
          Animation: folder({
            clipName: {
              value: desiredClip,
              options: clipOptions,
              label: "Clip",
            },
            play: { value: true },
            speed: { value: 1, min: 0, max: 2, step: 0.1, label: "Speed" },
          }),
        }),
      }),
      [desiredClip, clipOptions]
    );

  // Shadows + gather materials (optional)
  useEffect(() => {
    if (!cloned) return;
    cloned.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }, [cloned]);

  // Play/stop the selected animation
  useEffect(() => {
    if (!actions || !clipName) return;
    // stop others
    Object.values(actions).forEach((a) => a?.stop?.());
    const action = actions[clipName];
    if (!action) return;
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
    return () => action.fadeOut(0.2);
  }, [actions, clipName]);

  // Handle play/pause and speed
  useEffect(() => {
    if (!actions || !clipName) return;
    const action = actions[clipName];
    if (action) action.paused = !play;
    if (mixer) mixer.timeScale = speed;
  }, [actions, clipName, play, speed, mixer]);

  const position = useMemo(() => [posX, posY, posZ], [posX, posY, posZ]);
  const rotationY = useMemo(() => THREE.MathUtils.degToRad(rotYDeg), [rotYDeg]);

  if (!cloned) return null;

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={scale}
      dispose={null}
    >
      <primitive object={cloned} />
    </group>
  );
}

useGLTF.preload("/models/man/man.glb");
