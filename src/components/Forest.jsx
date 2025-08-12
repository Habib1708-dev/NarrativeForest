// src/components/Forest.jsx
import React, { useMemo, useEffect, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";

export default function Forest({ terrainMesh }) {
  // i control LODs and planting
  const {
    size,
    seed,
    count,
    chunkSize,
    nearRadius,
    midRadius,
    viewRadius,
    plantRadius,
  } = useControls("Forest", {
    size: { value: 20, min: 10, max: 200, step: 5 },
    seed: { value: 1, min: 0, max: 100, step: 1 },
    count: { value: 1300, min: 10, max: 20000, step: 10 },
    chunkSize: { value: 5, min: 2, max: 20, step: 1, label: "Chunk Size (m)" },
    nearRadius: {
      value: 0.2,
      min: 0.01,
      max: 10,
      step: 0.01,
      label: "High LOD radius (chunks)",
    },
    midRadius: {
      value: 2,
      min: 1,
      max: 60,
      step: 1,
      label: "Low LOD radius (chunks)",
    },
    viewRadius: {
      value: 5,
      min: 2,
      max: 80,
      step: 1,
      label: "Cull radius (chunks)",
    },
    plantRadius: {
      value: 12,
      min: 2,
      max: 100,
      step: 1,
      label: "Plant radius (m)",
    },
  });

  // i control tinting
  const { tintColor, tintIntensity } = useControls("Tree Tint", {
    tintColor: { value: "#0a0a0a", label: "Tint Color" }, // near-black
    tintIntensity: {
      value: 0.8,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Intensity",
    },
  });

  // i load the two LOD assets
  const highParts = useInstancedTree(
    "/models/tree/PineTrees2/PineTreeHighLOD6065.glb"
  );
  const lowParts = useInstancedTree(
    "/models/tree/PineTrees2/PineTree2LowLODDecimated89.glb"
  );

  // i apply the tint whenever parts load or controls change
  useEffect(() => {
    const target = new THREE.Color(tintColor);

    const tintParts = (parts) => {
      parts.forEach((p) => {
        const m = p.material;
        if (!m || !m.color) return;

        // i stash the original color once so i can lerp from it every time
        if (!m.userData._origColor) {
          m.userData._origColor = m.color.clone();
        }

        // i start from the original, then lerp toward the target by intensity
        m.color.copy(m.userData._origColor).lerp(target, tintIntensity);

        // i keep wood non-metal and fairly rough so dark looks natural
        if (typeof m.metalness === "number") m.metalness = 0.0;
        if (typeof m.roughness === "number")
          m.roughness = Math.min(1, Math.max(0.8, m.roughness));
        m.needsUpdate = true;
      });
    };

    if (highParts.length) tintParts(highParts);
    if (lowParts.length) tintParts(lowParts);
  }, [highParts, lowParts, tintColor, tintIntensity]);

  // i bake all transforms once
  const allTransforms = useMemo(() => {
    if (!terrainMesh) return [];
    terrainMesh.updateMatrixWorld(true);

    const prng = mulberry32(Math.floor(seed));
    const arr = [];

    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const origin = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);

    const bbox = new THREE.Box3().setFromObject(terrainMesh);
    const originY = bbox.max.y + 5;
    const rayFar = Math.max(10, bbox.max.y - bbox.min.y + 20);

    const R = Math.min(plantRadius, size * 0.5 - 0.001);

    for (let i = 0; i < count; i++) {
      // i sample uniformly in a disk
      const r = Math.sqrt(prng()) * R;
      const theta = prng() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      // scale trees with a relative factor in [1.3, 1.9] around a base scale
      const baseScale = 0.0045; // midpoint of previous 0.003..0.006
      const scale = baseScale * (1.3 + prng() * 0.6);

      origin.set(x, originY, z);
      ray.set(origin, down);
      ray.near = 0;
      ray.far = rayFar;

      const hit = ray.intersectObject(terrainMesh, false)[0] || null;
      const terrainY = hit?.point.y ?? 0;

      const adjustedY = terrainY - scale * 2.0;

      arr.push({
        position: [x, adjustedY, z],
        rotation: prng() * Math.PI * 2,
        scale,
      });
    }

    return arr;
  }, [terrainMesh, seed, size, count, plantRadius]);

  // i partition into chunks
  const chunks = useMemo(() => {
    if (allTransforms.length === 0) return [];
    const map = new Map();
    for (const t of allTransforms) {
      const [x, , z] = t.position;
      const cx = Math.floor((x + size / 2) / chunkSize);
      const cz = Math.floor((z + size / 2) / chunkSize);
      const key = `${cx},${cz}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          cx,
          cz,
          transforms: [],
          center: new THREE.Vector3(
            cx * chunkSize - size / 2 + chunkSize / 2,
            0,
            cz * chunkSize - size / 2 + chunkSize / 2
          ),
        });
      }
      map.get(key).transforms.push(t);
    }
    return Array.from(map.values());
  }, [allTransforms, size, chunkSize]);

  // i choose chunk LOD per camera distance
  const { camera } = useThree();
  const [chunkModes, setChunkModes] = useState({}); // key -> "off" | "med" | "high"
  const modesRef = useRef(chunkModes); // i avoid stale state in useFrame
  const lastCam = useRef(new THREE.Vector3(1e9, 0, 1e9));
  const cam2 = useRef(new THREE.Vector3());
  const moveThreshold = Math.max(0.5, chunkSize * 0.5);

  useEffect(() => {
    modesRef.current = chunkModes;
  }, [chunkModes]);

  useEffect(() => {
    setChunkModes({});
    lastCam.current.set(1e9, 0, 1e9);
  }, [chunks, chunkSize, nearRadius, midRadius, viewRadius]);

  useFrame(() => {
    cam2.current.set(camera.position.x, 0, camera.position.z);
    const dx = cam2.current.x - lastCam.current.x;
    const dz = cam2.current.z - lastCam.current.z;
    if (dx * dx + dz * dz < moveThreshold * moveThreshold) return;
    lastCam.current.copy(cam2.current);

    const halfDiag = Math.SQRT2 * (chunkSize / 2);
    const nearWorld = nearRadius * chunkSize;
    const midWorld = midRadius * chunkSize;
    const viewWorld = viewRadius * chunkSize;

    const nextModes = {};
    for (const c of chunks) {
      const dist = c.center.distanceTo(cam2.current);
      if (dist > viewWorld + halfDiag) nextModes[c.key] = "off";
      else if (dist <= nearWorld + halfDiag) nextModes[c.key] = "high";
      else if (dist <= midWorld + halfDiag) nextModes[c.key] = "med";
      else nextModes[c.key] = "off";
    }

    // i only update state when something actually changed
    const curr = modesRef.current;
    let changed = false;
    if (Object.keys(nextModes).length !== Object.keys(curr).length)
      changed = true;
    else
      for (const k in nextModes)
        if (curr[k] !== nextModes[k]) {
          changed = true;
          break;
        }
    if (changed) {
      setChunkModes(nextModes);
      modesRef.current = nextModes;
    }
  });

  // i wait for both LODs to be ready
  if (!highParts.length || !lowParts.length) return null;

  return (
    <group>
      {chunks.map((chunk) => (
        <ChunkInstanced
          key={chunk.key}
          transforms={chunk.transforms}
          mode={chunkModes[chunk.key] ?? "off"}
          highParts={highParts}
          medParts={lowParts}
        />
      ))}
    </group>
  );
}

// i render a chunk: i upload matrices once, then i only flip counts
function ChunkInstanced({ transforms, mode, highParts, medParts }) {
  const capacity = transforms.length;

  const highRefs = useRef(highParts.map(() => React.createRef()));
  const medRefs = useRef(medParts.map(() => React.createRef()));

  // i precompute matrices
  const matrices = useMemo(() => {
    const list = new Array(transforms.length);
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      p.fromArray(t.position);
      q.setFromEuler(new THREE.Euler(0, t.rotation, 0));
      s.setScalar(t.scale);
      list[i] = m4.clone().compose(p, q, s);
    }
    return list;
  }, [transforms]);

  // i upload matrices once
  useEffect(() => {
    [highRefs.current, medRefs.current].forEach((arr) =>
      arr.forEach((r) => {
        const mesh = r.current;
        if (!mesh) return;
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.matrixAutoUpdate = false;
        for (let i = 0; i < matrices.length; i++)
          mesh.setMatrixAt(i, matrices[i]);
        mesh.count = 0;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
      })
    );
  }, [matrices]);

  // i flip counts on mode change
  useEffect(() => {
    const setCount = (refs, n) =>
      refs.forEach((ref) => ref.current && (ref.current.count = n));
    if (mode === "high") {
      setCount(highRefs.current, matrices.length);
      setCount(medRefs.current, 0);
    } else if (mode === "med") {
      setCount(highRefs.current, 0);
      setCount(medRefs.current, matrices.length);
    } else {
      setCount(highRefs.current, 0);
      setCount(medRefs.current, 0);
    }
  }, [mode, matrices.length]);

  return (
    <group>
      {highParts.map((p, i) => (
        <instancedMesh
          key={`h-${i}`}
          ref={highRefs.current[i]}
          args={[p.geometry, p.material, capacity]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}
      {medParts.map((p, i) => (
        <instancedMesh
          key={`m-${i}`}
          ref={medRefs.current[i]}
          args={[p.geometry, p.material, capacity]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

// simple seedable prng
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let z = Math.imul(t ^ (t >>> 15), 1 | t);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
