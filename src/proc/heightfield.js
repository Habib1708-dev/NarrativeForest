// Mirrors src/components/Terrain.jsx exactly.
// IMPORTANT: We feed fbm(x, -z, ...) to match your rotated plane mapping,
// and then do Math.abs(...)+baseHeight and finally apply the original
// mesh world offset (position.y = -10).

// ----- Simplex (identical) -----
function permute(x) {
  return ((x * 34.0 + 1.0) * x) % 289.0;
}

function simplexNoise(x, y) {
  const C = [
    0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439,
  ];

  let i = Math.floor(x + (x + y) * C[1]);
  let j = Math.floor(y + (x + y) * C[1]);

  let x0 = x - i + (i + j) * C[0];
  let y0 = y - j + (i + j) * C[0];

  let i1 = x0 > y0 ? 1.0 : 0.0;
  let j1 = x0 > y0 ? 0.0 : 1.0;

  let x1 = x0 - i1 + C[0];
  let y1 = y0 - j1 + C[0];
  let x2 = x0 - 1.0 + 2.0 * C[0];
  let y2 = y0 - 1.0 + 2.0 * C[0];

  i %= 289.0;
  j %= 289.0;

  const p0 = permute(permute(j) + i);
  const p1 = permute(permute(j + j1) + i + i1);
  const p2 = permute(permute(j + 1.0) + i + 1.0);

  let m0 = Math.max(0.5 - x0 * x0 - y0 * y0, 0.0);
  let m1 = Math.max(0.5 - x1 * x1 - y1 * y1, 0.0);
  let m2 = Math.max(0.5 - x2 * x2 - y2 * y2, 0.0);

  m0 = m0 ** 4;
  m1 = m1 ** 4;
  m2 = m2 ** 4;

  const px0 = 2.0 * ((p0 * C[3]) % 1.0) - 1.0;
  const py0 = Math.abs(px0) - 0.5;
  const ax0 = px0 - Math.floor(px0 + 0.5);

  const px1 = 2.0 * ((p1 * C[3]) % 1.0) - 1.0;
  const py1 = Math.abs(px1) - 0.5;
  const ax1 = px1 - Math.floor(px1 + 0.5);

  const px2 = 2.0 * ((p2 * C[3]) % 1.0) - 1.0;
  const py2 = Math.abs(px2) - 0.5;
  const ax2 = px2 - Math.floor(px2 + 0.5);

  m0 *= 1.79284291400159 - 0.85373472095314 * (ax0 * ax0 + py0 * py0);
  m1 *= 1.79284291400159 - 0.85373472095314 * (ax1 * ax1 + py1 * py1);
  m2 *= 1.79284291400159 - 0.85373472095314 * (ax2 * ax2 + py2 * py2);

  const g0 = ax0 * x0 + py0 * y0;
  const g1 = ax1 * x1 + py1 * y1;
  const g2 = ax2 * x2 + py2 * y2;

  return 130.0 * (m0 * g0 + m1 * g1 + m2 * g2);
}

// ----- fBm + plateauize (identical math) -----
function fbm(x, y, frequency, octaves, seed, scale) {
  let value = 0.0;
  let amplitude = 0.5;
  let freq = frequency;
  for (let o = 0; o < octaves; o++) {
    value +=
      amplitude *
      simplexNoise(
        (x + seed * 100) * freq * scale,
        (y + seed * 100) * freq * scale
      );
    freq *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function plateauize(h, threshold, smoothing) {
  const low = Math.max(0, threshold - smoothing);
  const high = Math.min(1, threshold + smoothing);
  if (h < low || h > high) return h;
  const n = (h - low) / (high - low);
  return low + (h - low) * smoothstep(0, 1, n);
}

// Match Terrain.jsx Leva defaults 1:1 (and mesh world offset)
const params = {
  elevation: 7,
  frequency: 0.004,
  octaves: 8,
  seed: 2.2,
  scale: 5,
  plateauHeight: 0.0,
  plateauSmoothing: 0.0,
  baseHeight: 5,
  worldYOffset: -10, // <mesh position={[0,-10,0]}>
};

// Optional hooks to sync if you later want Leva to drive this too.
export function setTerrainParams(next) {
  Object.assign(params, next);
}
export function getTerrainParams() {
  return { ...params };
}

// Exactly what the tiled terrain samples
export function heightAt(xWorld, zWorld) {
  // CRITICAL: use (x, -z) to mirror Z like the rotated plane did.
  const d =
    fbm(
      xWorld,
      -zWorld,
      params.frequency,
      params.octaves,
      params.seed,
      params.scale
    ) * params.elevation;

  const n =
    plateauize(
      d / params.elevation,
      params.plateauHeight,
      params.plateauSmoothing
    ) * params.elevation;

  // Terrain.jsx: pos.z = Math.abs(n) + baseHeight; mesh is at y = -10
  return Math.abs(n) + params.baseHeight + params.worldYOffset;
}

// Handy normal (central differences)
export function normalAt(x, z, eps = 0.25) {
  const yhx1 = heightAt(x + eps, z);
  const yhx0 = heightAt(x - eps, z);
  const yhz1 = heightAt(x, z + eps);
  const yhz0 = heightAt(x, z - eps);
  const ddx = (yhx1 - yhx0) / (2 * eps);
  const ddz = (yhz1 - yhz0) / (2 * eps);
  const nx = -ddx,
    ny = 1,
    nz = -ddz;
  const inv = 1 / Math.hypot(nx, ny, nz);
  return [nx * inv, ny * inv, nz * inv];
}
