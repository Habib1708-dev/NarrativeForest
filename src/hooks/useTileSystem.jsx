import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Shared tile management system for 2x2 unit grid rendering
 * Tracks camera position and determines visible tiles for both Terrain and Forest
 */
export function useTileSystem({
  tileSize = 4,
  visibilityRadius = 2, // How many tiles around current tile to render (1 = 3x3)
  terrainSize = 20, // Total terrain size to calculate tile bounds
  hysteresis = 10, // Distance threshold to prevent flicker at boundaries
} = {}) {
  const { camera } = useThree();

  // State
  const [currentTile, setCurrentTile] = useState([0, 0]);
  const [visibleTiles, setVisibleTiles] = useState(new Set());

  // Refs
  const lastTileRef = useRef([0, 0]);
  const lastCameraPos = useRef({ x: 0, z: 0 });
  const initializedRef = useRef(false);

  // Derived
  const tilesPerDimension = Math.max(1, Math.ceil(terrainSize / tileSize));
  const halfTerrain = terrainSize / 2;

  // Helpers
  const tileHelpers = useMemo(() => {
    const worldToTile = (worldX, worldZ) => {
      const tileX = Math.floor((worldX + halfTerrain) / tileSize);
      const tileZ = Math.floor((worldZ + halfTerrain) / tileSize);
      return [
        Math.max(0, Math.min(tilesPerDimension - 1, tileX)),
        Math.max(0, Math.min(tilesPerDimension - 1, tileZ)),
      ];
    };

    const tileToWorld = (tileX, tileZ) => {
      const worldX = (tileX + 0.5) * tileSize - halfTerrain;
      const worldZ = (tileZ + 0.5) * tileSize - halfTerrain;
      return [worldX, worldZ];
    };

    const getTileBounds = (tileX, tileZ) => {
      const minX = tileX * tileSize - halfTerrain;
      const maxX = (tileX + 1) * tileSize - halfTerrain;
      const minZ = tileZ * tileSize - halfTerrain;
      const maxZ = (tileZ + 1) * tileSize - halfTerrain;
      return { minX, maxX, minZ, maxZ };
    };

    const getTileKey = (tileX, tileZ) => `${tileX},${tileZ}`;
    const parseTileKey = (key) => key.split(",").map(Number);

    return {
      worldToTile,
      tileToWorld,
      getTileBounds,
      getTileKey,
      parseTileKey,
    };
  }, [tileSize, halfTerrain, tilesPerDimension]);

  const calculateVisibleTiles = useCallback(
    (centerTileX, centerTileZ) => {
      const visible = new Set();
      for (let dx = -visibilityRadius; dx <= visibilityRadius; dx++) {
        for (let dz = -visibilityRadius; dz <= visibilityRadius; dz++) {
          const tileX = centerTileX + dx;
          const tileZ = centerTileZ + dz;
          if (
            tileX >= 0 &&
            tileX < tilesPerDimension &&
            tileZ >= 0 &&
            tileZ < tilesPerDimension
          ) {
            visible.add(tileHelpers.getTileKey(tileX, tileZ));
          }
        }
      }
      return visible;
    },
    [visibilityRadius, tilesPerDimension, tileHelpers]
  );

  const pointToAABBDistance = useCallback((x, z, bounds) => {
    const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
    const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
    return Math.hypot(dx, dz);
  }, []);

  // Merge base-visibility with "retention" tiles within 2 * tileSize of the camera
  const mergeWithRetention = useCallback(
    (baseVisible, camX, camZ) => {
      const merged = new Set(baseVisible);
      const RETAIN_DIST = tileSize * 2; // requirement
      visibleTiles.forEach((key) => {
        if (merged.has(key)) return;
        const [tx, tz] = tileHelpers.parseTileKey(key);
        const b = tileHelpers.getTileBounds(tx, tz);
        if (pointToAABBDistance(camX, camZ, b) <= RETAIN_DIST) {
          merged.add(key);
        }
      });
      return merged;
    },
    [tileSize, visibleTiles, tileHelpers, pointToAABBDistance]
  );

  const hasMovedSignificantly = useCallback(
    (newX, newZ) => {
      const dx = newX - lastCameraPos.current.x;
      const dz = newZ - lastCameraPos.current.z;
      return Math.hypot(dx, dz) > hysteresis;
    },
    [hysteresis]
  );

  // Initialize once and whenever core parameters change
  const initializeNow = useCallback(() => {
    const camX = camera.position.x;
    const camZ = camera.position.z;
    const [tileX, tileZ] = tileHelpers.worldToTile(camX, camZ);
    const newVisible = calculateVisibleTiles(tileX, tileZ);

    setCurrentTile([tileX, tileZ]);
    setVisibleTiles(newVisible);
    lastTileRef.current = [tileX, tileZ];
    lastCameraPos.current = { x: camX, z: camZ };
    initializedRef.current = true;
  }, [camera, tileHelpers, calculateVisibleTiles]);

  useEffect(() => {
    initializeNow();
  }, [
    initializeNow,
    tileSize,
    terrainSize,
    visibilityRadius,
    tilesPerDimension,
  ]);

  // Frame updates
  useFrame(() => {
    if (!initializedRef.current) {
      initializeNow();
      return;
    }

    const camX = camera.position.x;
    const camZ = camera.position.z;

    if (!hasMovedSignificantly(camX, camZ)) {
      return;
    }

    const [newTileX, newTileZ] = tileHelpers.worldToTile(camX, camZ);
    const [lastTileX, lastTileZ] = lastTileRef.current;

    if (newTileX !== lastTileX || newTileZ !== lastTileZ) {
      // Base set by radius, then apply retention so tiles don't drop until far enough
      const base = calculateVisibleTiles(newTileX, newTileZ);
      const newVisibleTiles = mergeWithRetention(base, camX, camZ);

      // Update state if visible tiles have changed
      if (newVisibleTiles !== visibleTiles) {
        setVisibleTiles(newVisibleTiles);
        lastTileRef.current = [newTileX, newTileZ];
      }
    }

    lastCameraPos.current = { x: camX, z: camZ };
  });

  // Utilities
  const utilities = useMemo(() => {
    const isTileVisible = (tileX, tileZ) =>
      visibleTiles.has(tileHelpers.getTileKey(tileX, tileZ));

    const isPositionVisible = (worldX, worldZ) => {
      const [tileX, tileZ] = tileHelpers.worldToTile(worldX, worldZ);
      return visibleTiles.has(tileHelpers.getTileKey(tileX, tileZ));
    };

    const getVisibleTileCoords = () =>
      Array.from(visibleTiles).map(tileHelpers.parseTileKey);

    const getVisibleBounds = () => {
      if (visibleTiles.size === 0) return null;
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      visibleTiles.forEach((key) => {
        const [x, z] = tileHelpers.parseTileKey(key);
        const b = tileHelpers.getTileBounds(x, z);
        minX = Math.min(minX, b.minX);
        maxX = Math.max(maxX, b.maxX);
        minZ = Math.min(minZ, b.minZ);
        maxZ = Math.max(maxZ, b.maxZ);
      });
      return { minX, maxX, minZ, maxZ };
    };

    const filterByTileVisibility = (objects, positionProp = "position") =>
      objects.filter((obj) => {
        const pos = obj[positionProp];
        if (!pos || !Array.isArray(pos) || pos.length < 2) return false;
        return isPositionVisible(pos[0], pos[2] ?? pos[1]);
      });

    return {
      isTileVisible,
      isPositionVisible,
      getVisibleTileCoords,
      getVisibleBounds,
      filterByTileVisibility,
    };
  }, [visibleTiles, tileHelpers]);

  // Debug info (dev only)
  const debugInfo =
    process.env.NODE_ENV === "development"
      ? {
          currentTile,
          visibleTileCount: visibleTiles.size,
          visibleTileKeys: Array.from(visibleTiles),
          tileSize,
          terrainSize,
          tilesPerDimension,
          visibilityRadius,
        }
      : null;

  return {
    currentTile,
    visibleTiles,
    ...tileHelpers,
    ...utilities,
    tileSize,
    terrainSize,
    tilesPerDimension,
    visibilityRadius,
    debugInfo,
  };
}

export default useTileSystem;
