//src/components/effects/useInstancedHoverSparkles.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

/**
 * Hook to attach hover-driven Sparkles to an instancedMesh.
 * - Attach the returned handlers to the instancedMesh.
 * - Render the returned JSX sibling anywhere in the same component.
 */
export default function useInstancedHoverSparkles({
  instancedRef,
  geometry, // the geometry used by the instancedMesh (for radius)
  color = "#ffd15c",
  count = 40,
  size = 4,
  speed = 0.2,
  radiusScale = 1.2,
  fade = true,
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const groupRef = useRef();
  const tmpMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpScale = useMemo(() => new THREE.Vector3(), []);

  // Update sparkles transform while hovering
  useFrame(() => {
    if (hoveredId == null) return;
    const mesh = instancedRef.current;
    const grp = groupRef.current;
    if (!mesh || !grp) return;

    mesh.getMatrixAt(hoveredId, tmpMatrix);
    tmpMatrix.decompose(tmpPos, tmpQuat, tmpScale);

    grp.position.copy(tmpPos);
    grp.quaternion.copy(tmpQuat);

    // approximate radius from geometry * max scale axis
    const baseR = geometry?.boundingSphere?.radius ?? 1;
    const maxS = Math.max(tmpScale.x, tmpScale.y, tmpScale.z);
    const r = Math.max(0.001, baseR * maxS * radiusScale);
    grp.scale.setScalar(r);
  });

  // Basic handlers you can spread on the instancedMesh
  const handlers = useMemo(
    () => ({
      onPointerMove: (e) => {
        // instanceId is set when the ray intersects an instance
        if (typeof e.instanceId === "number") {
          e.stopPropagation();
          setHoveredId(e.instanceId);
        }
      },
      onPointerOut: () => setHoveredId(null),
      onPointerLeave: () => setHoveredId(null),
    }),
    []
  );

  const element = (
    <group ref={groupRef} visible={hoveredId != null}>
      <Sparkles
        count={count}
        size={size}
        speed={speed}
        color={color}
        opacity={1}
        fade={fade}
        // Sparkles are scaled by the parent group (we set it each frame)
        scale={[1, 1, 1]}
      />
    </group>
  );

  return { handlers, element };
}
