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
    const dx = (maxX - minX) / seg;
    const dz = (maxZ - minZ) / seg;

    let cursor = 0;
    for (let z = 0; z < vertsZ; z++) {
      const wz = minZ + z * dz;
      for (let x = 0; x < vertsX; x++) {
        const wx = minX + x * dx;
        const wy = heightAt(wx, wz);
        positions[cursor++] = wx;
        positions[cursor++] = wy;
        positions[cursor++] = wz;
      }
    }

    ctx.postMessage(
      { type: "build-complete", key, positions: positions.buffer },
      [positions.buffer]
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
