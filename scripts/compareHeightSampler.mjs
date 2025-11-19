import * as THREE from "three";
import { heightAt } from "../src/proc/heightfield.js";

const tileSize = 4;
const anchorMinX = -10;
const anchorMinZ = -10;
const resolution = 26;

const tilesRange = {
  minIx: -3,
  maxIx: 3,
  minIz: -3,
  maxIz: 3,
};

function buildTileMesh(ix, iz) {
  const minX = anchorMinX + ix * tileSize;
  const minZ = anchorMinZ + iz * tileSize;
  const maxX = minX + tileSize;
  const maxZ = minZ + tileSize;

  const seg = Math.max(2, resolution | 0);
  const vertsX = seg + 1;
  const vertsZ = seg + 1;

  const positions = new Float32Array(vertsX * vertsZ * 3);
  const indices = new Uint32Array(seg * seg * 6);

  const dx = (maxX - minX) / seg;
  const dz = (maxZ - minZ) / seg;

  let p = 0;
  for (let z = 0; z < vertsZ; z++) {
    const wz = minZ + z * dz;
    for (let x = 0; x < vertsX; x++) {
      const wx = minX + x * dx;
      const wy = heightAt(wx, wz);
      positions[p++] = wx;
      positions[p++] = wy;
      positions[p++] = wz;
    }
  }

  let i = 0;
  for (let z = 0; z < seg; z++) {
    for (let x = 0; x < seg; x++) {
      const i0 = z * vertsX + x;
      const i1 = i0 + 1;
      const i2 = i0 + vertsX;
      const i3 = i2 + 1;

      indices[i++] = i0;
      indices[i++] = i2;
      indices[i++] = i1;
      indices[i++] = i1;
      indices[i++] = i2;
      indices[i++] = i3;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x999999, wireframe: false })
  );
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function buildTerrainGroup() {
  const group = new THREE.Group();
  for (let iz = tilesRange.minIz; iz <= tilesRange.maxIz; iz++) {
    for (let ix = tilesRange.minIx; ix <= tilesRange.maxIx; ix++) {
      const mesh = buildTileMesh(ix, iz);
      group.add(mesh);
    }
  }
  group.updateMatrixWorld(true);
  return group;
}

const terrainGroup = buildTerrainGroup();

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

function raycastHeight(x, z) {
  const origin = new THREE.Vector3(x, 200, z);
  raycaster.set(origin, down);
  const hits = raycaster.intersectObjects(terrainGroup.children, true);
  if (!hits.length) return null;
  return hits[0].point.y;
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

const sampleMinX = anchorMinX + tilesRange.minIx * tileSize;
const sampleMaxX = anchorMinX + (tilesRange.maxIx + 1) * tileSize;
const sampleMinZ = anchorMinZ + tilesRange.minIz * tileSize;
const sampleMaxZ = anchorMinZ + (tilesRange.maxIz + 1) * tileSize;

const samples = 200;
const results = [];
let misses = 0;

for (let i = 0; i < samples; i++) {
  const x = randomBetween(sampleMinX, sampleMaxX);
  const z = randomBetween(sampleMinZ, sampleMaxZ);

  const sampleY = heightAt(x, z);
  const rayY = raycastHeight(x, z);

  if (rayY === null) {
    misses++;
    continue;
  }

  const diff = rayY - sampleY;
  results.push({ x, z, sampleY, rayY, diff, absDiff: Math.abs(diff) });
}

const stats = results.reduce(
  (acc, item) => {
    acc.count++;
    acc.sumAbs += item.absDiff;
    acc.sumDiff += item.diff;
    acc.maxAbs = Math.max(acc.maxAbs, item.absDiff);
    acc.maxDiff = Math.max(acc.maxDiff, item.diff);
    acc.minDiff = Math.min(acc.minDiff, item.diff);
    if (item.absDiff > acc.maxAbsItem.absDiff) acc.maxAbsItem = item;
    return acc;
  },
  {
    count: 0,
    sumAbs: 0,
    sumDiff: 0,
    maxAbs: 0,
    maxDiff: -Infinity,
    minDiff: Infinity,
    maxAbsItem: { absDiff: -Infinity },
  }
);

if (!results.length) {
  console.log("No successful raycast samples.");
  process.exit(1);
}

const avgAbs = stats.sumAbs / stats.count;
const avgSigned = stats.sumDiff / stats.count;

console.log(
  JSON.stringify(
    {
      samplesRequested: samples,
      samplesHit: stats.count,
      misses,
      avgAbsError: avgAbs,
      avgSignedError: avgSigned,
      maxAbsError: stats.maxAbs,
      maxPositiveDiff: stats.maxDiff,
      maxNegativeDiff: stats.minDiff,
      worstSample: stats.maxAbsItem,
    },
    null,
    2
  )
);
