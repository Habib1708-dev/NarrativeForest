import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useCrystalPlacementStore } from "../../state/useCrystalPlacementStore";

const GLB_TALL_ROD = "/models/magicPlantsAndCrystal/TallRod.glb";

function getFirstMeshGeometry(scene) {
  let geom = null;
  scene?.traverse((n) => {
    if (!geom && n.isMesh && n.geometry) geom = n.geometry.clone();
  });
  return geom;
}

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
    const sx = entry.scaleX ?? entry.scale;
    const sy = entry.scaleY ?? entry.scale;
    const sz = entry.scale;
    scale.set(sx, sy, sz);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }

  mesh.count = entries.length;
  mesh.instanceMatrix.needsUpdate = true;
}

export default function CrystalPlacementDebug() {
  const initialize = useCrystalPlacementStore((state) => state.initialize);
  const objects = useCrystalPlacementStore((state) => state.objects);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const tallRod = useMemo(
    () => objects.filter((e) => e.type === "tallRod"),
    [objects]
  );

  const { scene: sceneRod } = useGLTF(GLB_TALL_ROD);

  const geoRod = useMemo(() => {
    let g = getFirstMeshGeometry(sceneRod);
    if (!g) return null;
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [sceneRod]);

  const matRod = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#aaccff",
        emissive: "#224466",
        emissiveIntensity: 0.2,
        metalness: 0.3,
        roughness: 0.35,
      }),
    []
  );

  const tallRodRef = useRef(null);

  useEffect(() => {
    return () => matRod.dispose();
  }, [matRod]);
  useEffect(() => {
    applyInstanceMatrices(tallRodRef.current, tallRod);
  }, [tallRod]);

  useEffect(() => {
    if (tallRodRef.current) {
      tallRodRef.current.frustumCulled = false;
      tallRodRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      tallRodRef.current.matrixAutoUpdate = false;
    }
  }, []);

  if (!geoRod) return null;

  return (
    <group>
      <instancedMesh
        ref={tallRodRef}
        args={[geoRod, matRod, Math.max(tallRod.length, 1)]}
        castShadow={false}
        receiveShadow={false}
      />
    </group>
  );
}

useGLTF.preload(GLB_TALL_ROD);
