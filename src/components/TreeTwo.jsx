// src/components/Tree.jsx
import { useGLTF } from "@react-three/drei";
import { forwardRef, useEffect, useRef } from "react";
import { useControls } from "leva";
import * as THREE from "three";

const Tree = forwardRef(function Tree(props, ref) {
  const { scene } = useGLTF("/models/tree/tree_a.glb");
  const treeRef = useRef();
  const originalMaterials = useRef(new Map());

  // Leva controls for tree tinting
  const { tintColor, tintIntensity } = useControls("Tree", {
    tintColor: { value: "#ffffff", label: "Tint Color" },
    tintIntensity: {
      value: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: "Tint Intensity",
    },
  });

  // Apply tinting to all materials in the tree
  useEffect(() => {
    if (!treeRef.current) return;

    treeRef.current.traverse((child) => {
      if (child.isMesh && child.material) {
        const material = child.material;

        // Store original material properties if not already stored
        if (!originalMaterials.current.has(material.uuid)) {
          originalMaterials.current.set(material.uuid, {
            color: material.color.clone(),
            map: material.map,
          });
        }

        const original = originalMaterials.current.get(material.uuid);

        // Clone material to avoid affecting other instances
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = material;
          child.material = material.clone();
        }

        // Apply tinting
        const tintColorObj = new THREE.Color(tintColor);

        if (tintIntensity === 0) {
          // No tint - restore original color and texture
          child.material.color.copy(original.color);
          child.material.map = original.map;
        } else {
          // Apply tint by mixing original color with tint color
          const mixedColor = original.color
            .clone()
            .lerp(tintColorObj, tintIntensity);
          child.material.color.copy(mixedColor);

          // Optionally reduce texture influence when tinting is strong
          if (tintIntensity > 0.5 && original.map) {
            // You can choose to keep or remove texture based on tint intensity
            child.material.map = original.map;
          }
        }

        child.material.needsUpdate = true;
      }
    });
  }, [tintColor, tintIntensity]);

  return (
    <group ref={ref} {...props} dispose={null}>
      <primitive ref={treeRef} object={scene} />
    </group>
  );
});

// Preload the model for better performance
useGLTF.preload("/models/tree/tree_a.glb");

export default Tree;
