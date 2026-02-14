import * as THREE from "three";

/**
 * Creates a single shared MeshStandardMaterial for TerrainTiledOpt.
 * No GPU displacement, no per-tile uniforms, no cloning needed.
 * One material instance is shared across all terrain tiles.
 */
export function createTerrainOptMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#0a0a0a",
    roughness: 1,
    metalness: 0,
  });
}
