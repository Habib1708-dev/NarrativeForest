// src/utils/ClickLogger.jsx
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * ClickLogger — console.logs hit positions when clicking rocks.
 * @param {React.RefObject[]} targets - array of refs to instancedMeshes (rocks).
 */
export default function ClickLogger({ targets = [] }) {
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  useEffect(() => {
    const handleClick = (event) => {
      // Convert screen coords → NDC
      const rect = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera);

      // Collect all meshes from refs
      const meshes = targets
        .map((r) => (r?.current ? r.current : null))
        .filter(Boolean);

      const intersects = raycaster.current.intersectObjects(meshes, true);

      if (intersects.length > 0) {
        console.clear();
        console.log("=== Click Hits ===");
        intersects.forEach((hit, i) => {
          const { x, y, z } = hit.point;
          console.log(
            `Hit ${i + 1}: [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]`
          );
        });
      }
    };

    gl.domElement.addEventListener("click", handleClick);
    return () => gl.domElement.removeEventListener("click", handleClick);
  }, [camera, gl, scene, targets]);

  return null;
}
