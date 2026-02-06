import * as THREE from "three";
import { getTerrainParams } from "../../proc/heightfield";
import terrainHeightAuthorityGlsl from "../../shaders/includes/terrainHeightAuthority.glsl?raw";

/**
 * Authority-Anchored Terrain Material
 *
 * Extended version of TerrainMaterial with support for the authority-anchor system.
 * Adds uFreeflight and uTravelOffset uniforms to enable infinite terrain illusion
 * during freeflight mode while preserving authored area spatial integrity.
 */

/**
 * Creates a MeshStandardMaterial patched with GPU terrain displacement
 * and authority-anchor support for freeflight mode.
 *
 * Uses onBeforeCompile to inject vertex shader code that:
 * - Displaces vertices using terrainHeightAt() with travel offset support
 * - Computes normals using finite differences
 */
export function createTerrainAuthorityMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: "#0a0a0a",
    roughness: 1,
    metalness: 0,
  });

  // Mark as terrain authority material for uniform updates
  material.userData.isTerrainMaterial = true;
  material.userData.isTerrainAuthorityMaterial = true;

  // Get terrain parameters for uniforms
  const params = getTerrainParams();

  // Patch the material with onBeforeCompile
  // CRITICAL: Use regular function (not arrow) so 'this' refers to the material instance
  // When material is cloned, each clone's onBeforeCompile uses 'this' to access its own userData
  const prevOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    // 'this' refers to the material instance being compiled (works correctly with cloned materials)
    if (prevOnBeforeCompile) prevOnBeforeCompile.call(this, shader, renderer);

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

    // Authority-anchor uniforms for freeflight mode
    shader.uniforms.uFreeflight = { value: 0.0 }; // 0 = AUTHORED, 1 = FREEFLIGHT
    shader.uniforms.uTravelOffset = { value: new THREE.Vector2(0, 0) }; // camera.xz - origin.xz

    // CRITICAL: Read per-tile uniforms from 'this' (the material instance)
    // Each tile has its own cloned material, so tileUniforms are stored per-material
    // Use 'this' instead of 'material' to ensure we read from the cloned material's userData
    if (this.userData.tileUniforms) {
      const tileUniforms = this.userData.tileUniforms;
      shader.uniforms.uTileMin.value.copy(tileUniforms.uTileMin);
      shader.uniforms.uTileSize.value = tileUniforms.uTileSize;
      shader.uniforms.uLatticeStep.value = tileUniforms.uLatticeStep;
    }

    // Read authority uniforms if set
    if (this.userData.authorityUniforms) {
      const authorityUniforms = this.userData.authorityUniforms;
      shader.uniforms.uFreeflight.value = authorityUniforms.uFreeflight;
      shader.uniforms.uTravelOffset.value.copy(authorityUniforms.uTravelOffset);
    }

    // Store uniform references in material for runtime updates
    // Use 'this' to ensure we store in the correct material instance
    if (!this.userData.shaderUniforms) {
      this.userData.shaderUniforms = {};
    }
    this.userData.shaderUniforms.uTileMin = shader.uniforms.uTileMin;
    this.userData.shaderUniforms.uTileSize = shader.uniforms.uTileSize;
    this.userData.shaderUniforms.uLatticeStep = shader.uniforms.uLatticeStep;
    this.userData.shaderUniforms.uFreeflight = shader.uniforms.uFreeflight;
    this.userData.shaderUniforms.uTravelOffset = shader.uniforms.uTravelOffset;

    // Inject terrain height module after common includes
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
${terrainHeightAuthorityGlsl}

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

  // Compute height using shared terrain function (includes freeflight offset)
  float height = terrainHeightAt(worldXZ.x, worldXZ.y);

  // Return world position with computed height
  return vec3(worldXZ.x, height, worldXZ.y);
}
`
    );

    // CRITICAL: Replace begin_vertex to inject displacement AFTER Three.js initializes transformed
    // The position attribute contains normalized grid coordinates [0,1] for XZ, Y=0
    // We must override transformed AFTER Three.js sets it up in begin_vertex
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
// Override transformed AFTER Three.js setup with terrain displacement
// transformed is now the world position (since mesh is at origin with no rotation/scale)
transformed = displaceTerrainVertex(position);
`
    );

    // Replace normal computation to use terrain normal
    // Use transformed (which is now the world position) for normal calculation
    shader.vertexShader = shader.vertexShader.replace(
      "#include <defaultnormal_vertex>",
      `// Compute terrain normal using finite differences
// transformed contains the world position after displacement
vec3 terrainNormal = computeTerrainNormal(transformed);
objectNormal = terrainNormal;

#include <defaultnormal_vertex>
`
    );
  };

  // CRITICAL: Set customProgramCacheKey so each cloned material gets its own shader program
  // Without this, Three.js may use a cached (unmodified) shader for clones
  // We use the material's uuid to ensure uniqueness - each clone gets a new uuid
  material.customProgramCacheKey = function () {
    return `terrain-authority-${this.uuid}`;
  };

  return material;
}

/**
 * Updates terrain material uniforms for a specific tile.
 * Call this after creating a mesh with the terrain material.
 * Stores uniforms in mesh.userData so they persist across shader recompiles.
 */
export function updateTerrainAuthorityTileUniforms(
  mesh,
  tileMinX,
  tileMinZ,
  tileSize,
  latticeStep
) {
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

/**
 * Updates authority-anchor uniforms for freeflight mode.
 * Call this each frame when in freeflight mode to update the travel offset.
 *
 * @param {THREE.Material} material - The terrain authority material
 * @param {number} freeflight - 0 for AUTHORED mode, 1 for FREEFLIGHT mode
 * @param {number} travelOffsetX - camera.x - origin.x
 * @param {number} travelOffsetZ - camera.z - origin.z
 */
export function updateTerrainAuthorityUniforms(
  material,
  freeflight,
  travelOffsetX,
  travelOffsetZ
) {
  if (!material || !material.userData.isTerrainAuthorityMaterial) {
    return;
  }

  // Store authority uniforms for shader recompile
  if (!material.userData.authorityUniforms) {
    material.userData.authorityUniforms = {
      uFreeflight: 0,
      uTravelOffset: new THREE.Vector2(0, 0),
    };
  }
  material.userData.authorityUniforms.uFreeflight = freeflight;
  material.userData.authorityUniforms.uTravelOffset.set(
    travelOffsetX,
    travelOffsetZ
  );

  // Update live shader uniforms if available
  if (material.userData.shaderUniforms) {
    const uniforms = material.userData.shaderUniforms;
    if (uniforms.uFreeflight) {
      uniforms.uFreeflight.value = freeflight;
    }
    if (uniforms.uTravelOffset) {
      uniforms.uTravelOffset.value.set(travelOffsetX, travelOffsetZ);
    }
  }
}
