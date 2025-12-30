# Hover Performance Issue - Fixed

## Problem Description

**Symptom:** Performance drops significantly when hovering the mouse, even when crystals/mushrooms are not visible (transparent/dissolved out).

**Root Cause:** The hover detection system in `UnifiedCrystalClusters` was running **every frame** regardless of whether the crystals were visible or not.

## Technical Details

### The Issue

In `UnifiedCrystalClusters.jsx`, the hover detection code (lines 1325-1328) was executing every frame:

```javascript
const hovered =
  anyHoveredFor(meshARef.current, geoA?.boundingSphere?.radius || 1) ||
  anyHoveredFor(meshBRef.current, geoB?.boundingSphere?.radius || 1) ||
  anyHoveredFor(meshCRef.current, geoC?.boundingSphere?.radius || 1);
```

**What `anyHoveredFor` does:**
- Iterates through **all 65 crystal instances** (15 + 34 + 16)
- For each instance:
  - Gets instance matrix
  - Decomposes matrix (position, rotation, scale)
  - Projects position to NDC (Normalized Device Coordinates)
  - Calculates distance from mouse pointer
- **Total: 65 matrix operations + 65 projections per frame**

**Performance Cost:**
- ~1.8ms per frame (as identified in performance study)
- Runs even when `progressRef.current < 0` (crystals are invisible/dissolved)

### Why It Happened

The dissolve system uses `progressRef.current` to control visibility:
- `progressRef.current = -0.2`: Fully dissolved (invisible)
- `progressRef.current = 0.0`: Starting to appear
- `progressRef.current = 1.1`: Fully visible

However, the hover detection had **no visibility check** - it ran regardless of the progress value.

## Solution

Added a visibility check before running hover detection:

```javascript
// Skip hover detection when crystals are not visible (dissolved out)
// Progress < 0 means crystals are fully dissolved and invisible
const isVisible = progressRef.current >= 0.0;
const hovered = isVisible
  ? anyHoveredFor(meshARef.current, geoA?.boundingSphere?.radius || 1) ||
    anyHoveredFor(meshBRef.current, geoB?.boundingSphere?.radius || 1) ||
    anyHoveredFor(meshCRef.current, geoC?.boundingSphere?.radius || 1)
  : false;
```

**How It Works:**
- When `progressRef.current < 0.0`: Crystals are invisible → skip hover detection → `hovered = false`
- When `progressRef.current >= 0.0`: Crystals are visible → run hover detection normally

## Performance Impact

### Before Fix
- **Hover detection**: Always running (~1.8ms/frame)
- **When invisible**: Still checking all 65 instances unnecessarily
- **Total waste**: ~1.8ms per frame when crystals are not visible

### After Fix
- **Hover detection**: Only runs when crystals are visible
- **When invisible**: Skips all hover checks (0ms cost)
- **Performance gain**: **~1.8ms saved per frame** when crystals are dissolved out

## Additional Notes

### Magic Mushrooms
Magic Mushrooms don't have hover detection - they only have `onClick` handlers. The click handlers are event-driven (only fire on click), not per-frame, so they don't have the same performance issue.

However, mushrooms do have a `useFrame` loop that runs every frame, but it only:
- Updates dissolve progress (very cheap)
- Updates particle system (only when particles exist)
- Updates squeeze animations (only when interacting)

These are all necessary operations and don't cause the same issue.

### Why This Matters

When the camera is before the waypoint where crystals appear:
- Crystals are dissolved out (`progressRef.current = -0.2`)
- User moves mouse around
- Hover detection was still running, checking all 65 invisible instances
- **Wasted ~1.8ms per frame** doing unnecessary work

Now, when crystals are invisible, hover detection is completely skipped, saving that performance cost.

## Testing

To verify the fix:
1. Position camera before the crystals appear (before stop-15-down waypoint)
2. Move mouse around
3. Performance should be stable (no drops)
4. When crystals fade in, hover detection activates normally

---

*Fixed: Hover detection now respects crystal visibility state*
*Performance gain: ~1.8ms per frame when crystals are invisible*

