import { createRef, useEffect, useMemo } from "react";
import { useCabinPropsPlacementStore } from "../../state/useCabinPropsPlacementStore";
import { useInstancedTree } from "../../hooks/useInstancedTree";
import { useInstancedRocks } from "../../hooks/useInstancedRocks";
import * as THREE from "three";

const ROCK_MODEL_PATH = "/models/rocks/MateriallessRock.glb";
const TREE_MODEL_PATH = "/models/tree/Spruce_Fir/Spruce1_draco.glb";

function applyInstanceMatrices(mesh, entries) {
  if (!mesh) return;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    position.set(entry.position[0], entry.position[1], entry.position[2]);
    euler.set(
      entry.rotationX ?? 0,
      entry.rotationY ?? 0,
      entry.rotationZ ?? 0
    );
    quaternion.setFromEuler(euler);
    scale.setScalar(entry.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }

  mesh.count = entries.length;
  mesh.instanceMatrix.needsUpdate = true;
}

export default function CabinPropsPlacementDebug() {
  const initialize = useCabinPropsPlacementStore((state) => state.initialize);
  const objects = useCabinPropsPlacementStore((state) => state.objects);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const rocks = useMemo(
    () => objects.filter((entry) => entry.type === "rock"),
    [objects]
  );
  const trees = useMemo(
    () => objects.filter((entry) => entry.type === "tree"),
    [objects]
  );

  const treeParts = useInstancedTree(TREE_MODEL_PATH);
  const rockParts = useInstancedRocks(ROCK_MODEL_PATH);

  const treeRefs = useMemo(
    () => treeParts.map(() => createRef()),
    [treeParts.length]
  );
  const rockRefs = useMemo(
    () => rockParts.map(() => createRef()),
    [rockParts.length]
  );

  useEffect(() => {
    for (let index = 0; index < rockRefs.length; index += 1) {
      applyInstanceMatrices(rockRefs[index].current, rocks);
    }
  }, [rocks, rockRefs]);

  useEffect(() => {
    for (let index = 0; index < treeRefs.length; index += 1) {
      applyInstanceMatrices(treeRefs[index].current, trees);
    }
  }, [trees, treeRefs]);

  useEffect(() => {
    const allRefs = [...rockRefs, ...treeRefs];
    for (let index = 0; index < allRefs.length; index += 1) {
      const mesh = allRefs[index].current;
      if (!mesh) continue;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.matrixAutoUpdate = false;
    }
  }, [rockRefs, treeRefs]);

  return (
    <group>
      {rockParts.map((part, index) => (
        <instancedMesh
          key={`rock-${part.name || "part"}-${index}`}
          ref={rockRefs[index]}
          args={[part.geometry, part.material, Math.max(rocks.length, 1)]}
        />
      ))}
      {treeParts.map((part, index) => (
        <instancedMesh
          key={`tree-${part.name || "part"}-${index}`}
          ref={treeRefs[index]}
          args={[part.geometry, part.material, Math.max(trees.length, 1)]}
        />
      ))}
    </group>
  );
}

