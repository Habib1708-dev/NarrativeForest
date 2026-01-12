import { heightAt, setTerrainParams } from "../proc/heightfield";

const ctx = self;

const buildTile = (payload) => {
  if (!payload) return;
  const { key, resolution, minX, minZ, maxX, maxZ } = payload;
  if (typeof key !== "string") return;

  try {
    const seg = Math.max(2, resolution | 0);
    const vertsX = seg + 1;
    const vertsZ = seg + 1;
    const positions = new Float32Array(vertsX * vertsZ * 3);
    const normals = new Float32Array(vertsX * vertsZ * 3);
    const dx = (maxX - minX) / seg;
    const dz = (maxZ - minZ) / seg;

    // First pass: compute all positions and track minY/maxY for bounding box
    const heights = new Array(vertsX * vertsZ);
    let cursor = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let z = 0; z < vertsZ; z++) {
      const wz = minZ + z * dz;
      for (let x = 0; x < vertsX; x++) {
        const wx = minX + x * dx;
        const wy = heightAt(wx, wz);
        heights[z * vertsX + x] = wy;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
        positions[cursor++] = wx;
        positions[cursor++] = wy;
        positions[cursor++] = wz;
      }
    }

    // Compute bounding box from known tile bounds and tracked Y range
    const boundingBox = {
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
    };

    // Compute bounding sphere from bounding box
    // Center is the midpoint of the bounding box
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    // Radius is half the diagonal of the bounding box
    const dxBox = maxX - minX;
    const dyBox = maxY - minY;
    const dzBox = maxZ - minZ;
    const radius = Math.sqrt(dxBox * dxBox + dyBox * dyBox + dzBox * dzBox) * 0.5;

    const boundingSphere = {
      center: { x: centerX, y: centerY, z: centerZ },
      radius,
    };

    // Second pass: compute normals using finite differences
    for (let z = 0; z < vertsZ; z++) {
      for (let x = 0; x < vertsX; x++) {
        const idx = z * vertsX + x;
        let ddx, ddz;

        // Compute gradient in X direction using central differences
        if (x === 0) {
          // Left edge: forward difference
          const h0 = heights[idx];
          const h1 = heights[z * vertsX + (x + 1)];
          ddx = (h1 - h0) / dx;
        } else if (x === vertsX - 1) {
          // Right edge: backward difference
          const h0 = heights[idx];
          const h1 = heights[z * vertsX + (x - 1)];
          ddx = (h0 - h1) / dx;
        } else {
          // Interior: central difference
          const h1 = heights[z * vertsX + (x + 1)];
          const h0 = heights[z * vertsX + (x - 1)];
          ddx = (h1 - h0) / (2 * dx);
        }

        // Compute gradient in Z direction using central differences
        if (z === 0) {
          // Top edge: forward difference
          const h0 = heights[idx];
          const h1 = heights[(z + 1) * vertsX + x];
          ddz = (h1 - h0) / dz;
        } else if (z === vertsZ - 1) {
          // Bottom edge: backward difference
          const h0 = heights[idx];
          const h1 = heights[(z - 1) * vertsX + x];
          ddz = (h0 - h1) / dz;
        } else {
          // Interior: central difference
          const h1 = heights[(z + 1) * vertsX + x];
          const h0 = heights[(z - 1) * vertsX + x];
          ddz = (h1 - h0) / (2 * dz);
        }

        // Compute normal vector: normal = normalize([-ddx, 1, -ddz])
        const nx = -ddx;
        const ny = 1;
        const nz = -ddz;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const invLen = len > 0 ? 1 / len : 1;

        const normalIdx = idx * 3;
        normals[normalIdx] = nx * invLen;
        normals[normalIdx + 1] = ny * invLen;
        normals[normalIdx + 2] = nz * invLen;
      }
    }

    ctx.postMessage(
      {
        type: "build-complete",
        key,
        positions: positions.buffer,
        normals: normals.buffer,
        boundingBox,
        boundingSphere,
      },
      [positions.buffer, normals.buffer]
    );
  } catch (error) {
    ctx.postMessage({
      type: "build-error",
      key,
      message: error?.message || "Failed to build terrain tile",
    });
  }
};

ctx.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};
  if (type === "build") {
    buildTile(payload);
  } else if (type === "sync-params" && payload) {
    setTerrainParams(payload);
  }
});
