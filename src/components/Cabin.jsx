import React, {
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

export default forwardRef(function Cabin(_, ref) {
  // Load GLB from /public
  const { scene } = useGLTF("/models/cabin/Cabin2.glb");

  // Clone so this instance has its own materials/props
  const clonedScene = useMemo(() => (scene ? clone(scene) : null), [scene]);

  // Expose a root ref (for fog occluder usage)
  const rootRef = useRef(null);
  useImperativeHandle(ref, () => rootRef.current, []);

  // Collect unique materials for tinting
  const materialsRef = useRef([]);
  useEffect(() => {
    if (!clonedScene) return;
    const mats = new Map();

    clonedScene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;

        const arr = Array.isArray(o.material) ? o.material : [o.material];
        arr.forEach((m) => {
          if (!m) return;
          if (!m.userData._origColor && m.color) {
            m.userData._origColor = m.color.clone();
          }
          mats.set(m.uuid, m);
        });
      }
    });

    materialsRef.current = Array.from(mats.values());
  }, [clonedScene]);

  // Leva controls (use your provided defaults)
  const {
    positionX,
    positionY,
    positionZ,
    rotationYDeg,
    scale,
    tintColor,
    tintIntensity,
    bulbEnabled,
    bulbColor,
    bulbIntensity,
    bulbSize,
    bulbX,
    bulbY,
    bulbZ,
  } = useControls({
    Cabin: folder({
      Transform: folder({
        positionX: { value: -2.3, min: -50, max: 50, step: 0.1 },
        positionY: { value: -4.85, min: -20, max: 20, step: 0.01 },
        positionZ: { value: -2.7, min: -50, max: 50, step: 0.1 },
        rotationYDeg: {
          value: 180,
          min: -180,
          max: 180,
          step: 1,
          label: "Rotation Y (deg)",
        },
        scale: {
          value: 0.06,
          min: 0.01,
          max: 5,
          step: 0.01,
          label: "Uniform Scale",
        },
      }),
      Tint: folder({
        tintColor: { value: "#808080", label: "Tint Color" },
        tintIntensity: {
          value: 0.75,
          min: 0,
          max: 1,
          step: 0.01,
          label: "Intensity",
        },
      }),
      "Bulb Light": folder({
        bulbEnabled: { value: true, label: "Enabled" },
        bulbColor: { value: "#ffc37b", label: "Color" },
        bulbIntensity: {
          value: 0.1,
          min: 0,
          max: 2,
          step: 0.01,
          label: "Intensity",
        },
        bulbSize: {
          value: 0.01,
          min: 0.001,
          max: 0.1,
          step: 0.001,
          label: "Size",
        },
        bulbX: { value: -1.71, min: -50, max: 50, step: 0.001, label: "X" },
        bulbY: { value: -4.6, min: -50, max: 50, step: 0.01, label: "Y" },
        bulbZ: { value: -2.94, min: -50, max: 50, step: 0.01, label: "Z" },
      }),
    }),
  });

  // Apply tint (lerp from original to target color by intensity)
  useEffect(() => {
    const target = new THREE.Color(tintColor);
    materialsRef.current.forEach((m) => {
      if (!m || !m.color) return;
      if (!m.userData._origColor) m.userData._origColor = m.color.clone();
      m.color.copy(m.userData._origColor).lerp(target, tintIntensity);
      m.needsUpdate = true;
    });
  }, [tintColor, tintIntensity]);

  const position = useMemo(
    () => [positionX, positionY, positionZ],
    [positionX, positionY, positionZ]
  );
  const rotationY = useMemo(
    () => THREE.MathUtils.degToRad(rotationYDeg),
    [rotationYDeg]
  );

  if (!clonedScene) return null;

  // Bulb position controlled via Leva (defaults near Man): [-1.3, -4.3, -2.9]
  const bulbPosition = useMemo(
    () => [bulbX, bulbY, bulbZ],
    [bulbX, bulbY, bulbZ]
  );

  // -------------------- ADDED: Rocks instanced meshes (baked transforms) --------------------
  // Switched to the material-less rock model as requested
  const ROCK_GLB = "/models/cabin/MateriallessRock.glb";
  const { scene: rockScene } = useGLTF(ROCK_GLB);

  const rockGeoMat = useMemo(() => {
    let geo = null;

    if (rockScene) {
      rockScene.traverse((o) => {
        if (!geo && o.isMesh && o.geometry) {
          geo = o.geometry;
        }
      });
    }

    // Fallback geometry if GLB failed to load/has no meshes
    if (!geo) {
      geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    }

    // Material-less → provide a solid MeshStandardMaterial with #444444 @ intensity 1.0
    const mat = new THREE.MeshStandardMaterial({
      color: "#444444",
      metalness: 0.0,
      roughness: 0.95,
    });

    return { geometry: geo, material: mat };
  }, [rockScene]);

  const instRef = useRef(null);
  const COUNT = 5;
  const d2r = (deg) => (deg * Math.PI) / 180;

  const rockTransforms = useMemo(
    () => [
      // First instance
      {
        position: [-1.944, -4.832, -1.841],
        scale: 0.168,
        rotDeg: [0, -100.9, -67.3],
      },
      // Second instance
      {
        position: [-1.505, -4.862, -1.664],
        scale: 0.2,
        rotDeg: [3.4, 53.8, -6.7],
      },
      // Third instance
      {
        position: [-1.411, -5.023, -1.72],
        scale: 0.278,
        rotDeg: [40.3, -10.1, 0],
      },
      // Fourth instance
      {
        position: [-1.262, -4.841, -1.623],
        scale: 0.294,
        rotDeg: [0, 0, -97.6],
      },
      // Fifth instance
      { position: [-1.0, -4.855, -1.804], scale: 0.241, rotDeg: [0, 0, 0] },
    ],
    []
  );

  useEffect(() => {
    const inst = instRef.current;
    const { geometry, material } = rockGeoMat || {};
    if (!inst || !geometry || !material) return;

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    for (let i = 0; i < COUNT; i++) {
      const t = rockTransforms[i];
      const [rx, ry, rz] = t.rotDeg;
      p.fromArray(t.position);
      q.setFromEuler(new THREE.Euler(d2r(rx), d2r(ry), d2r(rz)));
      s.setScalar(t.scale);
      m4.compose(p, q, s);
      inst.setMatrixAt(i, m4);
    }
    inst.count = COUNT;
    inst.instanceMatrix.needsUpdate = true;
  }, [rockGeoMat, rockTransforms]);

  useEffect(() => {
    if (!instRef.current) return;
    instRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    instRef.current.frustumCulled = false;
    instRef.current.matrixAutoUpdate = false;
  }, []);
  // ------------------------------------------------------------------------------------------

  return (
    <group ref={rootRef}>
      {/* Cabin model */}
      <group
        position={position}
        rotation={[0, rotationY, 0]}
        scale={scale}
        dispose={null}
      >
        <primitive object={clonedScene} />
      </group>

      {/* ADDED: Rock instances (absolute/world space) */}
      {rockGeoMat?.geometry && rockGeoMat?.material && (
        <instancedMesh
          ref={instRef}
          args={[rockGeoMat.geometry, rockGeoMat.material, COUNT]}
          castShadow={false}
          receiveShadow
        />
      )}

      {/* Miniature light bulb near the Man (absolute/world position) */}
      {bulbEnabled && (
        <group position={bulbPosition}>
          {/* Visible tiny bulb */}
          <mesh scale={bulbSize} castShadow={false} receiveShadow={false}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial
              color={bulbColor}
              emissive={bulbColor}
              emissiveIntensity={1}
              metalness={0}
              roughness={0.3}
              toneMapped={false}
            />
          </mesh>
          {/* Actual light source */}
          <pointLight
            color={bulbColor}
            intensity={bulbIntensity}
            distance={2.5}
            decay={2}
            castShadow={false}
          />
        </group>
      )}
    </group>
  );
});

useGLTF.preload("/models/cabin/Cabin.glb");
