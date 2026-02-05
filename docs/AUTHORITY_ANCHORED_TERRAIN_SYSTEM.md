# Authority-Anchored Infinite Terrain & Procedural World System

## 1. Objective

Introduce an infinite terrain illusion that activates during freeflight while preserving a static, authored world (cabin, man, intro camera path).

The system must:
- Support freeflight activation at any time
- Prevent accidental return to the focused authored area
- Maintain visual continuity for terrain, trees, and rocks
- Avoid tile/chunk lifecycle complexity
- Preserve the existing terrain height function and prop logic

## 2. Core Insight

This is not a terrain problem alone — it is a **world authority problem**.

The solution is to clearly define which coordinate space has authority at any moment and ensure that terrain and procedural props always follow the same authority.

## 3. World Model Overview

### Two Conceptual Spaces

#### 3.1 Authored World Space (Static)

**Used for:**
- Cabin
- Man
- Camera intro/waypoints
- Narrative-critical staging

**Properties:**
- Fixed world coordinates
- Never re-centered
- Never moved or rebased
- Spatially finite and intentional

#### 3.2 Procedural World Space (Endless)

**Used for:**
- Terrain
- Trees
- Rocks
- Distant exploration

**Properties:**
- Camera-anchored
- Relative coordinate system
- Infinite illusion
- Activated on freeflight

## 4. The World Anchor (Single Source of Truth)

Introduce a single runtime concept:

```typescript
WorldAnchor {
  mode: "AUTHORED" | "FREEFLIGHT"
  origin: Vector3
}
```

This anchor defines:
- Terrain noise sampling space
- Tree and rock placement space
- Distance measurement for ambience & transitions

**Terrain and procedural props must always sample using the same anchor.**

## 5. Anchor Behavior

### 5.1 AUTHORED Mode (Default)

```typescript
worldAnchor.mode = "AUTHORED"
worldAnchor.origin = [0, 0, 0]
```

- Terrain height sampled in absolute world space
- Trees and rocks sampled in absolute world space
- Cabin and Man align correctly
- Intro camera path behaves as authored

This is the focused scene.

### 5.2 FREEFLIGHT Mode (Can Activate Anytime)

When the user enables freeflight (regardless of location):

```typescript
worldAnchor.mode = "FREEFLIGHT"
worldAnchor.origin = camera.position.clone()
```

This moment marks the **exit point** from the authored world.

From this frame forward:
- Terrain becomes camera-anchored
- Procedural props become camera-anchored
- The authored area becomes naturally unreachable unless the user truly flies back

**No teleportation. No clamps. No invisible walls.**

## 6. Terrain System Design

### 6.1 Fixed-Size, Camera-Anchored Terrain

- One or more fixed-size terrain meshes
- Terrain follows the camera via grid snapping
- Height function remains unchanged

### Sampling Logic

```typescript
function getSamplePosition(worldPos) {
  if (worldAnchor.mode === "AUTHORED") {
    return worldPos;
  }

  // FREEFLIGHT
  return worldPos.sub(worldAnchor.origin);
}
```

### Shader Concept

```glsl
vec2 sampleXZ = position.xz + uTerrainOffset;

if (uFreeflight == 1) {
  sampleXZ += uTravelOffset;
}

float height = terrainHeightAt(sampleXZ.x, sampleXZ.y);
```

Where:
- `uTravelOffset = camera.position - worldAnchor.origin`

## 7. Procedural Props (Trees & Rocks)

### 7.1 Critical Rule

**Procedural props must sample using the same coordinate space as terrain.**

This guarantees:
- Props stay glued to terrain
- No popping or snapping on freeflight activation
- No spatial hints leading back to the cabin

### 7.2 Deterministic Sampling

Instead of:
```typescript
hash(worldX, worldZ)
```

Use:
```typescript
hash(sampleX, sampleZ)
```

Where:
```typescript
sampleX, sampleZ = getSamplePosition(worldPos)
```

This ensures:
- Stable placement
- Infinite repeatability
- No persistent storage required

### 7.3 Runtime Behavior

- Existing trees and rocks are not forcibly despawned
- New props are spawned procedurally as cells enter view
- Old props naturally fall out of view

This keeps transitions smooth and believable.

## 8. Distance Monitoring (Optional but Recommended)

Distance is measured from the anchor, not from world origin:

```typescript
distanceFromAnchor = length(
  camera.position - worldAnchor.origin
);
```

This distance can drive:
- Audio fading (cabin ambience → wind)
- Fog density increase
- Sky/aurora transitions
- Narrative cues

This works identically whether freeflight starts early or late.

## 9. Preventing Return to the Focused Area

This system does **not** block movement.

Instead, it:
- Breaks spatial continuity at the moment freeflight begins
- Makes the authored area unreachable unless the user intentionally flies back the full distance

This feels natural and avoids immersion-breaking constraints.

## 10. Why This Works with Early Freeflight

| Scenario | Result |
|----------|--------|
| Freeflight near cabin | Cabin fades naturally into the past |
| Freeflight mid-intro | Authored sequence loses spatial authority cleanly |
| Freeflight at start | Scene behaves as pure infinite world |
| Flying back | Possible, but only with real travel |

No special cases required.

## 11. What This System Avoids

- ❌ Tile or chunk lifecycle management
- ❌ World origin rebasing
- ❌ Invisible barriers
- ❌ Forced teleportation
- ❌ Prop resampling pops
- ❌ Narrative breakage

## 12. Implementation Phases

### Phase 1 — Anchor Infrastructure
- Introduce `WorldAnchor`
- Refactor terrain sampling to use anchor

### Phase 2 — Procedural Prop Alignment
- Update tree & rock sampling to use anchor-relative space
- Ensure deterministic hashing

### Phase 3 — Camera-Anchored Terrain
- Replace tile logic with fixed mesh (or clipmap rings)
- Enable freeflight transition

### Phase 4 — Ambience & Polish
- Distance-based fog, audio, sky transitions

## 13. Final Recommendation

Adopt an authority-anchored world model where:
- Authored content owns space until freeflight
- Freeflight transfers spatial authority to the camera
- Terrain and procedural props always obey the same anchor

This produces:
- ✅ Endless exploration
- ✅ Narrative integrity
- ✅ Stable visuals
- ✅ Minimal engine complexity
