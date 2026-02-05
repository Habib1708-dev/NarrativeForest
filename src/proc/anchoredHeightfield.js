/**
 * Anchor-Aware Height Field Sampler
 *
 * Provides CPU-side height sampling that respects the WorldAnchor coordinate system.
 * In AUTHORED mode: samples at absolute world coordinates
 * In FREEFLIGHT mode: samples at camera-relative coordinates (with anchor offset)
 *
 * This ensures procedural props (trees, rocks) sample heights using the same
 * coordinate space as the terrain shader, keeping them aligned.
 */

import { heightAt } from "./heightfield";
import { useWorldAnchorStore } from "../state/useWorldAnchorStore";

/**
 * Sample terrain height at world coordinates with anchor offset applied.
 * Use this for procedural prop placement to ensure alignment with terrain.
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @returns {number} - Terrain height at the sampled position
 */
export function anchoredHeightAt(worldX, worldZ) {
  const { mode, origin } = useWorldAnchorStore.getState();

  if (mode === "AUTHORED") {
    // In authored mode, sample at absolute world coordinates
    return heightAt(worldX, worldZ);
  }

  // In freeflight mode, apply anchor offset to sample coordinates
  // This matches the shader's uTravelOffset logic
  const sampleX = worldX - origin.x;
  const sampleZ = worldZ - origin.z;
  return heightAt(sampleX, sampleZ);
}

/**
 * Get sample coordinates for a world position.
 * Use this when you need the sample coordinates without sampling.
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @returns {{ x: number, z: number }} - Sample coordinates
 */
export function getSampleCoordinates(worldX, worldZ) {
  const { mode, origin } = useWorldAnchorStore.getState();

  if (mode === "AUTHORED") {
    return { x: worldX, z: worldZ };
  }

  return {
    x: worldX - origin.x,
    z: worldZ - origin.z,
  };
}

/**
 * Convert world chunk coordinates to sample-space chunk coordinates.
 * Use this for deterministic prop hashing in the forest system.
 *
 * @param {number} chunkX - World chunk X index
 * @param {number} chunkZ - World chunk Z index
 * @param {number} chunkSize - Size of each chunk in world units
 * @returns {{ cx: number, cz: number }} - Sample-space chunk coordinates
 */
export function getSampleChunkCoords(chunkX, chunkZ, chunkSize) {
  const { mode, origin } = useWorldAnchorStore.getState();

  if (mode === "AUTHORED") {
    return { cx: chunkX, cz: chunkZ };
  }

  // Convert origin to chunk-space offset
  const originChunkX = Math.floor(origin.x / chunkSize);
  const originChunkZ = Math.floor(origin.z / chunkSize);

  return {
    cx: chunkX - originChunkX,
    cz: chunkZ - originChunkZ,
  };
}

/**
 * Convert world position to chunk coordinates with anchor awareness.
 * Use this for camera-to-chunk mapping in the forest system.
 *
 * @param {number} worldX - World X position
 * @param {number} worldZ - World Z position
 * @param {number} chunkSize - Size of each chunk in world units
 * @returns {[number, number]} - [chunkX, chunkZ] indices
 */
export function worldToAnchoredChunk(worldX, worldZ, chunkSize) {
  const { mode, origin } = useWorldAnchorStore.getState();

  if (mode === "AUTHORED") {
    return [Math.floor(worldX / chunkSize), Math.floor(worldZ / chunkSize)];
  }

  // In freeflight, compute chunk from sample-space position
  const sampleX = worldX - origin.x;
  const sampleZ = worldZ - origin.z;
  return [Math.floor(sampleX / chunkSize), Math.floor(sampleZ / chunkSize)];
}

/**
 * Check if currently in freeflight mode.
 *
 * @returns {boolean} - True if in freeflight mode
 */
export function isFreeflight() {
  return useWorldAnchorStore.getState().mode === "FREEFLIGHT";
}

/**
 * Get the current anchor origin.
 *
 * @returns {THREE.Vector3} - The anchor origin
 */
export function getAnchorOrigin() {
  return useWorldAnchorStore.getState().origin;
}
