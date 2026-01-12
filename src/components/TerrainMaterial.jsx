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

    // Get tile uniforms from mesh userData (set by updateTerrainTileUniforms)
    // This is accessed via the renderer's current render item
    let tileUniforms = { uTileMin: new THREE.Vector2(), uTileSize: 4.0, uLatticeStep: 0.1 };
    
    // Try to get tile uniforms from current render item
    if (renderer && renderer.info && renderer.info.render) {
      const renderList = renderer.info.render.frame;
      if (renderList && renderList.items) {
        // Find the current mesh being rendered
        // This is a bit hacky but necessary for per-mesh uniforms with onBeforeCompile
        // We'll use a different approach: store in material and update per-frame
      }
    }

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

    // Per-tile uniforms (default values, updated per-mesh)
    shader.uniforms.uTileMin = { value: new THREE.Vector2() };
    shader.uniforms.uTileSize = { value: 4.0 };
    shader.uniforms.uLatticeStep = { value: 0.1 };
    
    // Store uniform references in material for per-mesh updates
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
vec3 displaceTerrainVertex(vec3 localPos) {
  // localPos.xz are normalized coordinates [0,1] representing position within tile
  // Convert to world XZ coordinates: tileMin + normalizedPos * tileSize
  vec2 worldXZ = uTileMin + localPos.xz * uTileSize;
  
  // Compute height using shared terrain function
  float height = terrainHeightAt(worldXZ.x, worldXZ.y);
  
  // Return world position with computed height
  return vec3(worldXZ.x, height, worldXZ.y);
}
`
    );

    // Replace position transformation: displace before normal computation
    // The position attribute contains normalized grid coordinates [0,1] for XZ, Y=0
    // We compute world position with height, then set transformed to object-space
    // Since mesh is at world origin, object-space = world-space
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `// Displace terrain vertex: convert normalized grid to world position with height
vec3 terrainWorldPos = displaceTerrainVertex(position);
// Set transformed to object-space (equals world-space since mesh is at origin)
transformed = terrainWorldPos;

#include <beginnormal_vertex>
`
    );

    // Replace normal computation to use terrain normal
    // Compute normal from world position using finite differences
    shader.vertexShader = shader.vertexShader.replace(
      "#include <defaultnormal_vertex>",
      `// Compute terrain normal using finite differences
vec3 terrainNormal = computeTerrainNormal(terrainWorldPos);
objectNormal = terrainNormal;

#include <defaultnormal_vertex>
`
    );
  };

  return material;
}

/**
 * Updates terrain material uniforms for a specific tile.
 * Call this after creating a mesh with the terrain material.
 * Stores uniforms in mesh.userData so they persist across shader recompiles.
 */
export function updateTerrainTileUniforms(mesh, tileMinX, tileMinZ, tileSize, latticeStep) {
  if (!mesh.material || !mesh.material.userData.isTerrainMaterial) {
    return;
  }

  // Store tile uniforms in mesh userData for access during onBeforeCompile
  mesh.userData.tileUniforms = {
    uTileMin: new THREE.Vector2(tileMinX, tileMinZ),
    uTileSize: tileSize,
    uLatticeStep: latticeStep,
  };

  // Update uniforms via material.userData.shaderUniforms (set during onBeforeCompile)
  const material = mesh.material;
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

