// src/three-bvh-setup.js
import * as THREE from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  // NOTE: MeshBVHVisualizer is NOT imported — some versions don’t export it
} from "three-mesh-bvh";

// Avoid double-patching during HMR
const alreadyPatched =
  THREE.BufferGeometry.prototype.computeBoundsTree &&
  THREE.BufferGeometry.prototype.disposeBoundsTree &&
  THREE.Mesh.prototype.raycast === acceleratedRaycast;

if (!alreadyPatched) {
  // Add BVH helpers to BufferGeometry
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

  // Use accelerated raycast
  THREE.Mesh.prototype.raycast = acceleratedRaycast;

  // Provide Raycaster.firstHitOnly if missing
  if (!("firstHitOnly" in THREE.Raycaster.prototype)) {
    Object.defineProperty(THREE.Raycaster.prototype, "firstHitOnly", {
      value: false,
      writable: true,
      configurable: true,
    });
  }

  if (typeof window !== "undefined" && window.console) {
    console.log(
      "[three-bvh-setup] BVH patch applied (accelerated raycasting enabled)."
    );
  }
} else {
  if (typeof window !== "undefined" && window.console) {
    console.log("[three-bvh-setup] Already patched — skipping.");
  }
}
