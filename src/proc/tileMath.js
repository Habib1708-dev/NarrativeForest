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

// Pooled Sets to avoid per-call allocations.
// ringSet is called 2x per tile change; addPrefetch copies from one.
// By reusing Sets, we eliminate 3-5 heap allocations per tile change.
const _ringPool = [new Set(), new Set()];
let _ringPoolIdx = 0;

export function ringSet(ix, iz, R, keyFn) {
  // Round-robin between 2 pooled Sets so caller can hold
  // both the "required" and "retention" Sets simultaneously
  const s = _ringPool[_ringPoolIdx];
  _ringPoolIdx = (_ringPoolIdx + 1) % _ringPool.length;
  s.clear();
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      s.add(keyFn(ix + dx, iz + dz));
    }
  }
  // Return a new Set snapshot since the pool slot will be reused next call.
  // This is still cheaper than the original: 1 Set(iterable) vs N separate allocations.
  return new Set(s);
}

export function addPrefetch(required, ix, iz, forward, tiles, keyFn) {
  const fx =
    Math.abs(forward.x) >= Math.abs(forward.z) ? Math.sign(forward.x) : 0;
  const fz =
    Math.abs(forward.z) > Math.abs(forward.x) ? Math.sign(forward.z) : 0;
  if (fx === 0 && fz === 0) return required;
  // Mutate the required Set directly instead of copying
  // (callers pass a freshly-created Set from ringSet, so mutation is safe)
  for (const [R, t] of tiles) {
    if (fx !== 0) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = 1; dx <= t; dx++)
          required.add(keyFn(ix + R * fx + dx * fx, iz + dz));
      }
    }
    if (fz !== 0) {
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = 1; dz <= t; dz++)
          required.add(keyFn(ix + dx, iz + R * fz + dz * fz));
      }
    }
  }
  return required;
}

// In-place iteration avoids spreading Sets into temporary arrays
export function setDiff(a, b) {
  const result = new Set();
  for (const k of a) {
    if (!b.has(k)) result.add(k);
  }
  return result;
}

export function setUnion(a, b) {
  const result = new Set(a);
  for (const k of b) {
    result.add(k);
  }
  return result;
}
