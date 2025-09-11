import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

/**
 * Hover-driven Sparkles for an instancedMesh.
 * - Attach {...handlers} to your <instancedMesh>
 * - Render {element} once as a sibling
 *
 * Tips:
 * - radiusScale: expands sparkle volume around the instance
 * - yOffset: lifts sparkles above the crystal so they aren't depth-occluded
 */
export default function useInstancedHoverSparkles({
  instancedRef,
  geometry,
  color = "#ffd15c",
  count = 60,
  size = 10,
  speed = 0.25,
  radiusScale = 1.6,
  yOffset = 0.3, // fraction of the computed radius to lift in +Y
  fade = true,
  debug = false, // draws a wireframe sphere so you can see placement/size
}) {
  const [hoveredId, setHoveredId] = useState(null);

  const groupRef = useRef();
  const tmpMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpScale = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame(() => {
    if (hoveredId == null) return;
    const mesh = instancedRef.current;
    const grp = groupRef.current;
    if (!mesh || !grp) return;

    mesh.getMatrixAt(hoveredId, tmpMatrix);
    tmpMatrix.decompose(tmpPos, tmpQuat, tmpScale);

    // Base radius from geometry, adjusted by instance scale
    const baseR = geometry?.boundingSphere?.radius ?? 1;
    const maxS = Math.max(tmpScale.x, tmpScale.y, tmpScale.z);
    const r = Math.max(0.02, baseR * maxS * radiusScale);

    grp.position.copy(tmpPos).addScaledVector(up, r * yOffset); // lift above to avoid being inside the mesh
    grp.quaternion.copy(tmpQuat);
    grp.scale.setScalar(r);
    grp.renderOrder = 999; // draw late; still respects depthTest, but helps sorting
  });

  const handlers = useMemo(
    () => ({
      onPointerOver: (e) => {
        if (typeof e.instanceId === "number") {
          e.stopPropagation();
          setHoveredId(e.instanceId);
        }
      },
      onPointerMove: (e) => {
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
      {debug && (
        <mesh frustumCulled={false}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="hotpink" wireframe />
        </mesh>
      )}
      <Sparkles
        count={count}
        size={size}
        speed={speed}
        color={color}
        opacity={1}
        fade={fade}
        scale={[1, 1, 1]} // actual volume is controlled by the parent group's scale
      />
    </group>
  );

  // If geometry isn't ready yet, keep things hidden
  useEffect(() => {
    if (!geometry && groupRef.current) groupRef.current.visible = false;
  }, [geometry]);

  return { handlers, element };
}
