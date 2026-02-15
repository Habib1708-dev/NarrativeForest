// src/components/MossRockInstances.jsx
import React, { forwardRef, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";

const ROCK_GLB = "/models/rocks/MossRock_ktx2.glb"; // Using KTX2-compressed version
const COUNT = 5;

function deg2rad(d) {
  return (d * Math.PI) / 180;
}

export default forwardRef(function MossRockInstances(props, ref) {
  const { scene } = useGLTF(ROCK_GLB);

  // Grab the FIRST mesh's geometry & material from the GLB
  const { geometry, material } = useMemo(() => {
    let geo = null;
    let mat = null;
    if (scene) {
      scene.traverse((o) => {
        if (!geo && o.isMesh && o.geometry) {
          geo = o.geometry;
          // clone the material so we don't mutate the original
          mat = Array.isArray(o.material)
            ? o.material[0]?.clone?.()
            : o.material?.clone?.();
        }
      });
    }
    // Fallbacks
    if (!geo) {
      geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      mat = new THREE.MeshStandardMaterial({ color: "#888888" });
    } else if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: "#888888" });
    }
    // sensible defaults for rock look
    if (mat) {
      if ("metalness" in mat) mat.metalness = 0.0;
      if ("roughness" in mat) mat.roughness = 0.95;
    }
    return { geometry: geo, material: mat };
  }, [scene]);

  // Build Leva controls for each instance
  const controlSchema = useMemo(() => {
    const schema = {};
    for (let i = 0; i < COUNT; i++) {
      schema[`Rock ${i + 1}`] = folder({
        [`posX_${i}`]: {
          value: -1.0,
          min: -2.0,
          max: 0.0,
          step: 0.001,
          label: "X",
        },
        [`posY_${i}`]: {
          value: -4.0,
          min: -5.5,
          max: -4.0,
          step: 0.001,
          label: "Y",
        },
        [`posZ_${i}`]: {
          value: -2.0,
          min: -2.0,
          max: 1.0,
          step: 0.001,
          label: "Z",
        },
        [`scale_${i}`]: {
          value: 0.2,
          min: 0.001,
          max: 0.4,
          step: 0.001,
          label: "Scale",
        },
        [`rotX_${i}`]: {
          value: 0.0,
          min: -180,
          max: 180,
          step: 0.1,
          label: "Rot X (deg)",
        },
        [`rotY_${i}`]: {
          value: 0.0,
          min: -180,
          max: 180,
          step: 0.1,
          label: "Rot Y (deg)",
        },
        [`rotZ_${i}`]: {
          value: 0.0,
          min: -180,
          max: 180,
          step: 0.1,
          label: "Rot Z (deg)",
        },
      });
    }
    return schema;
  }, []);

  const ctl = useControls("MossRock Instances", controlSchema, { collapsed: true });

  const instRef = useRef();
  // So parent can access the instancedMesh if needed
  React.useImperativeHandle(ref, () => instRef.current, []);

  // Upload per-instance transforms whenever controls change
  useEffect(() => {
    const mesh = instRef.current;
    if (!mesh) return;

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    for (let i = 0; i < COUNT; i++) {
      const px = ctl[`posX_${i}`];
      const py = ctl[`posY_${i}`];
      const pz = ctl[`posZ_${i}`];

      const sc = ctl[`scale_${i}`];

      const rx = deg2rad(ctl[`rotX_${i}`] || 0);
      const ry = deg2rad(ctl[`rotY_${i}`] || 0);
      const rz = deg2rad(ctl[`rotZ_${i}`] || 0);

      p.set(px, py, pz);
      q.setFromEuler(new THREE.Euler(rx, ry, rz));
      s.set(sc, sc, sc);

      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    }

    mesh.count = COUNT;
    mesh.instanceMatrix.needsUpdate = true;
  }, [ctl]);

  // Ensure stable instanced settings
  useEffect(() => {
    if (!instRef.current) return;
    instRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instRef.current.frustumCulled = false;
    instRef.current.matrixAutoUpdate = false;
  }, []);

  if (!geometry || !material) return null;

  return (
    <group {...props}>
      <instancedMesh
        ref={instRef}
        args={[geometry, material, COUNT]}
      />
    </group>
  );
});

useGLTF.preload(ROCK_GLB);
