import React, { useMemo } from "react";
import { useGLTF } from "@react-three/drei";

export function Tree({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  variant = "a", // 'a', 'b', or 'c'
}) {
  // Load the GLTF model
  const { scene } = useGLTF("/models/tree/fir_tree_01_1k.gltf");

  // Extract the specific tree variant
  const treeModel = useMemo(() => {
    // Clone the scene to avoid reference issues
    const clonedScene = scene.clone();

    // Find the requested tree variant
    const variantName = `fir_tree_01_${variant}_LOD0`;
    const treeVariant = clonedScene.children.find(
      (child) => child.name === variantName
    );

    if (!treeVariant) {
      console.warn(
        `Tree variant "${variant}" not found, using first available tree`
      );
      return clonedScene.children[0].clone();
    }

    return treeVariant.clone();
  }, [scene, variant]);

  console.log("Tree model loaded:", treeModel);

  return (
    <primitive
      object={treeModel}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
    />
  );
}

// Preload the model
useGLTF.preload("/models/tree/fir_tree_01_1k.gltf");

export default Tree;

/* ---------------------------------------------------------------------------
  Darkening the tree model – three quick methods
  ----------------------------------------------

  1. Tint via material.color  (fast & simple)
     -------------------------------------------------
     scene.traverse(obj => {
       if (!obj.isMesh) return;
       obj.material = obj.material.clone();      // avoid mutating shared mats
       obj.material.color.multiplyScalar(0.4);   // 0-1 → darker
     });

  2. Dim the light / environment  (physically correct)
     -------------------------------------------------
       <ambientLight intensity={0.15} />
       <directionalLight intensity={0.5} />
     Optionally reduce reflections only:
       obj.material.envMapIntensity = 0.3;

  3. Shader uniform for animated darkness  (day ↔ night fade)
     -------------------------------------------------
     obj.material.onBeforeCompile = (shader) => {
       shader.uniforms.uDark = { value: 0.0 };           // 0 = bright, 1 = black
       shader.fragmentShader = shader.fragmentShader.replace(
         'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
         `
         outgoingLight *= (1.0 - uDark);
         gl_FragColor = vec4( outgoingLight, diffuseColor.a );
         `
       );
       obj.userData.shader = shader;                     // keep reference
     };

     // later in useFrame:
     scene.traverse(o => {
       if (o.userData.shader) o.userData.shader.uniforms.uDark.value = nightValue;
     });

  Choose #1 for a static tint, #2 to darken the whole scene realistically,
  or #3 for smooth, per-pixel day-to-night transitions.
--------------------------------------------------------------------------- */

// Group "fir_tree_01_a_LOD0"
// │
// ├─ Mesh "NurbsPath001"            (trunk)
// │   ├─ geometry: BufferGeometry
// │   └─ material: MeshPhysicalMaterial  "fir_tree_01_bark"
// │       ├─ color          : Color(1,1,1) ← you tint this
// │       ├─ map            : Texture "fir_tree_01_bark_diff"        ← delete if you want uniform tint
// │       ├─ normalMap      : Texture "fir_tree_01_bark_nor_gl"
// │       ├─ roughnessMap   : Texture "fir_tree_01_bark_rough"
// │       ├─ metalnessMap   : Texture "fir_tree_01_bark_rough"
// │       └─ (other PBR slots…)
// │
// ├─ Mesh "NurbsPath001_1"          (foliage chunk 1)
// │   └─ material: MeshPhysicalMaterial "fir_tree_01_leaf"
// │       ├─ color        : Color(1,1,1)
// │       ├─ map          : Texture "fir_tree_01_leaf_diff"
// │       ├─ alphaMap     : Texture "fir_tree_01_leaf_alpha"
// │       ├─ normalMap    : Texture "fir_tree_01_leaf_nor_gl"
// │       └─ roughnessMap : Texture "fir_tree_01_leaf_rough"
// │
// ├─ Mesh "NurbsPath001_2"          (foliage chunk 2) ── same slots
// └─ Mesh "NurbsPath001_3"          (foliage chunk 3) ── same slots

// Physically-based shading still works.
// When you delete material.map and set material.color = new THREE.Color(tint), that colour becomes the new base-albedo that the shader multiplies by the light.
// Normal-, roughness-, metalness-, displacement-, and alpha-maps are left intact, so you keep:

// fine-grained surface bumps (normal/displacement),

// realistic specular highlights & matte areas (roughness/metalness),

// cut-out leaves (alpha).
