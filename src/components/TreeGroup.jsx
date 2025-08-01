import React, { useRef, useMemo, useEffect } from "react";
import { useGLTF, useTexture, Instance, Instances } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useControls, folder } from "leva";

/**
 * TreeGroup component for creating optimized clusters of trees using instancing
 * @param {Object} props
 * @param {Array} [props.position=[0,0,0]] - Central position of the tree group
 * @param {number} [props.count=5] - Number of trees in the group
 * @param {number} [props.radius=15] - Radius in which trees are distributed
 * @param {number} [props.minScale=0.7] - Minimum scale of trees
 * @param {number} [props.maxScale=1.3] - Maximum scale of trees
 */
export default function TreeGroup({
  position = [0, 0, 0],
  count = 5,
  radius = 15,
  minScale = 0.7,
  maxScale = 1.3,
  seed = 1,
}) {
  const modelPath = "/models/tree/fir_tree_01_1k.gltf";
  const { nodes, materials } = useGLTF(modelPath);

  // Create refs for wind animation
  const trunkRef = useRef();
  const twigRef = useRef();

  // Use controls for forest parameters
  const forestParams = useControls("Forest", {
    forestDensity: {
      value: count,
      min: 1,
      max: 100,
      step: 1,
      label: "Tree Count",
    },
    forestRadius: {
      value: radius,
      min: 5,
      max: 100,
      step: 1,
      label: "Forest Radius",
    },
    forestVariation: {
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Tree Variation",
    },
    windIntensity: {
      value: 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Wind Intensity",
    },
    windFrequency: {
      value: 0.5,
      min: 0.1,
      max: 2,
      step: 0.1,
      label: "Wind Frequency",
    },
  });

  // Generate tree instances data
  const treeInstances = useMemo(() => {
    const instances = [];
    const actualCount = forestParams.forestDensity;
    const actualRadius = forestParams.forestRadius;

    // Use pseudorandom number generator with seed for deterministic generation
    const pseudoRandom = (i) => {
      // Simple seeded random function
      return (Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    };

    // Use a deterministic approach for positioning
    for (let i = 0; i < actualCount; i++) {
      // Use a deterministic but varied distribution
      const angle =
        (i / actualCount) * Math.PI * 2 + seed + pseudoRandom(i) * 0.5;

      // Vary the distance from center
      const distance = Math.pow(pseudoRandom(i + 1), 0.5) * actualRadius;

      const x = Math.cos(angle) * distance + position[0];
      const z = Math.sin(angle) * distance + position[2];

      // Get terrain height at this position (simplified for now)
      const y = position[1];

      // Vary the scale based on the forestVariation parameter
      const scale =
        minScale +
        pseudoRandom(i + 2) *
          (maxScale - minScale) *
          forestParams.forestVariation;

      // Random rotation for natural look
      const rotation = [0, pseudoRandom(i + 3) * Math.PI * 2, 0];

      // Random variation for wind animation
      const windVariation = pseudoRandom(i + 4) * 0.5 + 0.75;

      instances.push({
        position: [x, y, z],
        scale: scale,
        rotation: rotation,
        windVariation: windVariation,
        id: i,
      });
    }

    return instances;
  }, [
    forestParams.forestDensity,
    forestParams.forestRadius,
    forestParams.forestVariation,
    position,
    minScale,
    maxScale,
    seed,
  ]);

  // Wind animation effect using instanced attributes
  useFrame((state) => {
    if (!twigRef.current || !trunkRef.current) return;

    const time = state.clock.getElapsedTime();
    const windIntensity = forestParams.windIntensity;
    const windFrequency = forestParams.windFrequency;

    // Animated wind effect on twig instances
    treeInstances.forEach((tree, i) => {
      if (twigRef.current.getMatrixAt) {
        const matrix = new THREE.Matrix4();
        twigRef.current.getMatrixAt(i, matrix);

        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        matrix.decompose(position, rotation, scale);

        // Create a new quaternion for the wind effect
        const windRotation = new THREE.Euler(
          Math.sin(time * windFrequency * tree.windVariation) *
            windIntensity *
            0.05,
          tree.rotation[1],
          Math.cos(time * windFrequency * 0.7 * tree.windVariation) *
            windIntensity *
            0.05
        );

        const newRotation = new THREE.Quaternion().setFromEuler(windRotation);

        // Recompose the matrix with the new rotation
        matrix.compose(position, newRotation, scale);
        twigRef.current.setMatrixAt(i, matrix);
      }
    });

    // Update instance matrices
    if (twigRef.current.instanceMatrix) {
      twigRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  // Preload the GLTF model
  useEffect(() => {
    useGLTF.preload(modelPath);
  }, [modelPath]);

  // Extract geometry from the tree model
  // The GLTF model may contain multiple parts (trunk, branches, leaves)
  const trunkGeometry = useMemo(() => {
    // Find trunk/bark mesh from the model
    const trunks = [];
    if (nodes) {
      Object.values(nodes).forEach((node) => {
        if (node.geometry && node.material) {
          const materialName = node.material.name?.toLowerCase() || "";
          if (materialName.includes("bark") || materialName.includes("trunk")) {
            trunks.push(node);
          }
        }
      });
    }
    return trunks[0]?.geometry;
  }, [nodes]);

  const twigsGeometry = useMemo(() => {
    // Find twigs/leaves mesh from the model
    const twigs = [];
    if (nodes) {
      Object.values(nodes).forEach((node) => {
        if (node.geometry && node.material) {
          const materialName = node.material.name?.toLowerCase() || "";
          if (
            materialName.includes("twig") ||
            materialName.includes("needle")
          ) {
            twigs.push(node);
          }
        }
      });
    }
    return twigs[0]?.geometry;
  }, [nodes]);

  if (!trunkGeometry || !twigsGeometry) {
    // If geometries aren't loaded yet, return empty group
    return null;
  }

  return (
    <group position={position}>
      {/* Trunk instances */}
      <Instances
        limit={forestParams.forestDensity} // Limit number of instances
        range={forestParams.forestDensity} // Range of instances to create
        geometry={trunkGeometry}
        material={
          materials
            ? Object.values(materials).find(
                (m) =>
                  m.name?.toLowerCase().includes("trunk") ||
                  m.name?.toLowerCase().includes("bark")
              )
            : undefined
        }
        castShadow
      >
        <group ref={trunkRef}>
          {treeInstances.map((tree) => (
            <Instance
              key={tree.id}
              position={tree.position}
              rotation={tree.rotation}
              scale={tree.scale}
            />
          ))}
        </group>
      </Instances>

      {/* Twig/Needle instances */}
      <Instances
        limit={forestParams.forestDensity}
        range={forestParams.forestDensity}
        geometry={twigsGeometry}
        material={
          materials
            ? Object.values(materials).find((m) =>
                m.name?.toLowerCase().includes("twig")
              )
            : undefined
        }
        castShadow
      >
        <group ref={twigRef}>
          {treeInstances.map((tree) => (
            <Instance
              key={tree.id}
              position={tree.position}
              rotation={tree.rotation}
              scale={tree.scale}
            />
          ))}
        </group>
      </Instances>
    </group>
  );
}
