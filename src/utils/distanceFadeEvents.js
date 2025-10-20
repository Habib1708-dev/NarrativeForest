export const DISTANCE_FADE_TILE_READY_EVENT = "distance-fade/tile-ready";

export function emitDistanceFadeTileReady(detail) {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  ) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(DISTANCE_FADE_TILE_READY_EVENT, { detail })
  );
}
