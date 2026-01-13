// src/proc/tileMath.js
export function makeTileMath({
  tileSize = 4,
  anchorMinX = -10,
  anchorMinZ = -10,
} = {}) {
  const key = (ix, iz) => `${ix},${iz}`;
  const parse = (k) => k.split(",").map((n) => parseInt(n, 10));

  const worldToTile = (x, z) => [
    Math.floor((x - anchorMinX) / tileSize),
    Math.floor((z - anchorMinZ) / tileSize),
  ];

  const tileMinWorld = (ix, iz) => [
    anchorMinX + ix * tileSize,
    anchorMinZ + iz * tileSize,
  ];

  const tileBounds = (ix, iz) => {
    const [minX, minZ] = tileMinWorld(ix, iz);
    return { minX, minZ, maxX: minX + tileSize, maxZ: minZ + tileSize };
  };

  return {
    key,
    parse,
    worldToTile,
    tileMinWorld,
    tileBounds,
    tileSize,
    anchorMinX,
    anchorMinZ,
  };
}

export function ringSet(ix, iz, R, keyFn) {
  const s = new Set();
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      s.add(keyFn(ix + dx, iz + dz));
    }
  }
  return s;
}

export function addPrefetch(required, ix, iz, forward, tiles, keyFn) {
  const fx =
    Math.abs(forward.x) >= Math.abs(forward.z) ? Math.sign(forward.x) : 0;
  const fz =
    Math.abs(forward.z) > Math.abs(forward.x) ? Math.sign(forward.z) : 0;
  if (fx === 0 && fz === 0) return required;
  const out = new Set(required);
  for (const [R, t] of tiles) {
    if (fx !== 0) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = 1; dx <= t; dx++)
          out.add(keyFn(ix + R * fx + dx * fx, iz + dz));
      }
    }
    if (fz !== 0) {
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = 1; dz <= t; dz++)
          out.add(keyFn(ix + dx, iz + R * fz + dz * fz));
      }
    }
  }
  return out;
}

export const setDiff = (a, b) => new Set([...a].filter((k) => !b.has(k)));
export const setUnion = (a, b) => new Set([...a, ...b]);
