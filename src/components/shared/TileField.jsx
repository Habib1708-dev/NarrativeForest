// src/hooks/TileField.js
import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { useTileSystem as baseUseTileSystem } from "../../hooks/useTileSystem";

/** Context data shape:
 * {
 *   currentTile, visibleTiles, tilesPerDimension, tileSize, terrainSize,
 *   getTileBounds, getTileKey, parseTileKey,
 *   added, removed, // per-update diffs
 *   registerTile, unregisterTile, getTileMesh // registry
 * }
 */
const TileFieldCtx = createContext(null);

export function TileFieldProvider({
  children,
  tileSize,
  terrainSize,
  visibilityRadius,
  hysteresis,
}) {
  // Single source of truth — run the real hook once here
  const t = baseUseTileSystem({
    tileSize,
    terrainSize,
    visibilityRadius,
    hysteresis,
  });

  // Diff visibleTiles
  const prevVisibleRef = useRef(new Set());
  const added = useMemo(() => {
    const prev = prevVisibleRef.current;
    const now = t.visibleTiles;
    const a = new Set();
    now.forEach((k) => !prev.has(k) && a.add(k));
    return a;
  }, [t.visibleTiles]);
  const removed = useMemo(() => {
    const prev = prevVisibleRef.current;
    const now = t.visibleTiles;
    const r = new Set();
    prev.forEach((k) => !now.has(k) && r.add(k));
    return r;
  }, [t.visibleTiles]);

  useEffect(() => {
    prevVisibleRef.current = t.visibleTiles;
  }, [t.visibleTiles]);

  // Tile mesh registry
  const tileRegistryRef = useRef(new Map()); // key -> THREE.Mesh
  const registerTile = (key, mesh) => tileRegistryRef.current.set(key, mesh);
  const unregisterTile = (key) => tileRegistryRef.current.delete(key);
  const getTileMesh = (key) => tileRegistryRef.current.get(key) || null;

  const value = useMemo(
    () => ({
      ...t,
      added,
      removed,
      registerTile,
      unregisterTile,
      getTileMesh,
    }),
    [t, added, removed]
  );

  return (
    <TileFieldCtx.Provider value={value}>{children}</TileFieldCtx.Provider>
  );
}

export function useTileField() {
  const ctx = useContext(TileFieldCtx);
  if (!ctx)
    throw new Error("useTileField must be used inside <TileFieldProvider>");
  return ctx;
}
