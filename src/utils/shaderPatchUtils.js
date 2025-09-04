// Compose multiple patches on a material without clobbering previous ones.
export function stackOnBeforeCompile(material, patchFn) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    prev?.(shader);
    patchFn(shader);
  };
  material.needsUpdate = true;
}

// Ensure the material gets a distinct program variant, even if a previous
// patch compiled a program already. We keep any previous key-fn intact.
export function appendProgramKey(material, tag) {
  const prevKeyFn =
    typeof material.customProgramCacheKey === "function"
      ? material.customProgramCacheKey.bind(material)
      : null;
  material.customProgramCacheKey = () => {
    const base = prevKeyFn ? prevKeyFn() : "";
    return (base ? base + "|" : "") + tag;
  };
  material.needsUpdate = true; // force recompilation using new key
}
