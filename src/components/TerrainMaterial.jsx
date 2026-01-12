import * as THREE from "three";
import { getTerrainParams } from "../proc/heightfield";
import terrainHeightGlsl from "../shaders/includes/terrainHeight.glsl?raw";

// GLSL shader code for terrain displacement
// This will be injected into the vertex shader via onBeforeCompile

/**
 * Creates a MeshStandardMaterial patched with GPU terrain displacement.
 * Uses onBeforeCompile to inject vertex shader code that:
 * - Displaces vertices using terrainHeightAt()
 * - Computes normals using finite differences
 */
export function createTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: "#0a0a0a",
    roughness: 1,
    metalness: 0,
  });

  // Mark as terrain material for uniform updates
  material.userData.isTerrainMaterial = true;

  // Get terrain parameters for uniforms
  const params = getTerrainParams();

  // Patch the material with onBeforeCompile
  const prevOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);

    // Add terrain height uniforms
    shader.uniforms.uTerrainElevation = { value: params.elevation };
    shader.uniforms.uTerrainFrequency = { value: params.frequency };
    shader.uniforms.uTerrainOctaves = { value: params.octaves };
    shader.uniforms.uTerrainSeed = { value: params.seed };
    shader.uniforms.uTerrainScale = { value: params.scale };
    shader.uniforms.uTerrainPlateauHeight = { value: params.plateauHeight };
    shader.uniforms.uTerrainPlateauSmoothing = { value: params.plateauSmoothing };
    shader.uniforms.uTerrainBaseHeight = { value: params.baseHeight };
    shader.uniforms.uTerrainWorldYOffset = { value: params.worldYOffset };

    // Per-tile uniforms (default values, will be overridden if tileUniforms exist)
    shader.uniforms.uTileMin = { value: new THREE.Vector2() };
    shader.uniforms.uTileSize = { value: 4.0 };
    shader.uniforms.uLatticeStep = { value: 0.1 };
    
    // Read per-tile uniforms from material.userData (set by updateTerrainTileUniforms)
    // Each tile has its own cloned material, so tileUniforms are stored per-material
    if (material.userData.tileUniforms) {
      const tileUniforms = material.userData.tileUniforms;
      shader.uniforms.uTileMin.value.copy(tileUniforms.uTileMin);
      shader.uniforms.uTileSize.value = tileUniforms.uTileSize;
      shader.uniforms.uLatticeStep.value = tileUniforms.uLatticeStep;
    }
    
    // Store uniform references in material for runtime updates
    if (!material.userData.shaderUniforms) {
      material.userData.shaderUniforms = {};
    }
    material.userData.shaderUniforms.uTileMin = shader.uniforms.uTileMin;
    material.userData.shaderUniforms.uTileSize = shader.uniforms.uTileSize;
    material.userData.shaderUniforms.uLatticeStep = shader.uniforms.uLatticeStep;

    // Inject terrain height module after common includes
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
${terrainHeightGlsl}

// Per-tile uniforms
uniform vec2 uTileMin;
uniform float uTileSize;
uniform float uLatticeStep;

// Compute normal using finite differences (matching CPU logic)
// Input: world position (for height sampling)
vec3 computeTerrainNormal(vec3 worldPos) {
  float eps = uLatticeStep;
  
  float hL = terrainHeightAt(worldPos.x - eps, worldPos.z);
  float hR = terrainHeightAt(worldPos.x + eps, worldPos.z);
  float hD = terrainHeightAt(worldPos.x, worldPos.z - eps);
  float hU = terrainHeightAt(worldPos.x, worldPos.z + eps);
  
  float ddx = (hR - hL) / (2.0 * eps);
  float ddz = (hU - hD) / (2.0 * eps);
  
  vec3 normal = vec3(-ddx, 1.0, -ddz);
  return normalize(normal);
}

// Vertex displacement: convert local flat grid position to world, compute height
// Returns world position for height sampling
// Note: transformed remains in object space, only Y is updated
vec3 displaceTerrainVertex(vec3 localPos) {
  // localPos.xz are normalized coordinates [0,1] representing position within tile
  // Convert to world XZ coordinates: tileMin + normalizedPos * tileSize
  vec2 worldXZ = uTileMin + localPos.xz * uTileSize;
  
  // Compute height using shared terrain function
  float height = terrainHeightAt(worldXZ.x, worldXZ.y);
  
  // Return world position with computed height (for sampling only)
  // The actual transformed will keep XZ in object space, only Y is displaced
  return vec3(worldXZ.x, height, worldXZ.y);
}
`
    );

    // CRITICAL: Replace begin_vertex to inject displacement AFTER Three.js initializes transformed
    // The position attribute contains normalized grid coordinates [0,1] for XZ, Y=0
    // We compute world coordinates for height sampling, then set transformed to object space
    // NOTE: Currently assumes mesh has identity transform (at origin, no rotation/scale)
    // For future transform support, would need to convert worldPos back to object space
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
// Compute world coordinates for terrain height sampling
vec3 worldPos = displaceTerrainVertex(position);
// Set transformed to object space coordinates
// Since mesh is at origin with identity transform, worldPos = objectPos
// For future: if mesh has transform, convert worldPos to object space via inverse modelMatrix
transformed = worldPos;
`
    );

    // SAFE: Inject terrain normal assignment AFTER defaultnormal_vertex
    // Do NOT redeclare objectNormal - just assign to it
    // Let Three.js handle the rest of the normal pipeline (normal_vertex, etc.)
    shader.vertexShader = shader.vertexShader.replace(
      "#include <defaultnormal_vertex>",
      `#include <defaultnormal_vertex>
// Override objectNormal with terrain normal (computed from world position)
// Compute world position again for normal calculation
vec3 worldPosForNormal = displaceTerrainVertex(position);
objectNormal = computeTerrainNormal(worldPosForNormal);
`
    );
  };

  return material;
}

/**
 * Updates terrain material uniforms for a specific tile.
 * Call this after creating a mesh with the terrain material.
 * 
 * Strategy: Each tile has its own cloned material, so we store tile uniforms
 * in both mesh.userData (for reference) and material.userData (for onBeforeCompile access).
 */
export function updateTerrainTileUniforms(mesh, tileMinX, tileMinZ, tileSize, latticeStep) {
  if (!mesh.material || !mesh.material.userData.isTerrainMaterial) {
    return;
  }

  const material = mesh.material;
  const tileUniforms = {
    uTileMin: new THREE.Vector2(tileMinX, tileMinZ),
    uTileSize: tileSize,
    uLatticeStep: latticeStep,
  };

  // Store in mesh.userData for reference (optional, but kept for consistency)
  mesh.userData.tileUniforms = tileUniforms;

  // CRITICAL: Store in material.userData for onBeforeCompile to read
  // Since each tile has its own cloned material, this is per-tile data
  material.userData.tileUniforms = tileUniforms;

  // Also update uniforms directly if shader is already compiled
  // This handles the case where shader was compiled before tileUniforms were set
  if (material.userData.shaderUniforms) {
    const uniforms = material.userData.shaderUniforms;
    if (uniforms.uTileMin) {
      uniforms.uTileMin.value.set(tileMinX, tileMinZ);
    }
    if (uniforms.uTileSize) {
      uniforms.uTileSize.value = tileSize;
    }
    if (uniforms.uLatticeStep) {
      uniforms.uLatticeStep.value = latticeStep;
    }
  }
}

