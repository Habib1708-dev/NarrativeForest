# Tree & Rock Placement: Old vs New System

## The Simple Version

Imagine you need to place 14 trees in a small patch of forest. Each tree needs breathing room — none can be too close to another.

**The old way (Rejection Sampling)** works like throwing darts blindfolded at a dartboard. You pick a random spot, check if it's too close to an existing tree, and if it is — you throw it away and try again. For 14 trees, the system was making up to **840 attempts**. Most of those attempts were wasted misses, especially as the patch fills up and open spots become harder to hit by chance.

Every single attempt — hit or miss — also had to calculate the terrain height at that spot (an expensive math operation involving 8 layers of noise). So even the 800+ failed guesses were burning computation for nothing.

**The new way (Poisson Disk Sampling)** is like placing trees with a strategy instead of blind luck. After placing the first tree, it looks at the area *around* that tree (specifically the ring between "too close" and "just right") and picks candidates there. Since it's only looking where trees *can* actually fit, almost every candidate succeeds.

The result: the terrain height calculation now only runs for the ~26 trees and rocks that actually get placed — not for hundreds of failed guesses.

---

## What Changed Visually?

Nothing. Both systems produce the same kind of distribution: randomly scattered points where no two are closer than a minimum distance. The forest looks natural either way. The only difference is how the computer arrives at that result.

---

## The Performance Gain

| | Old System | New System |
|---|---|---|
| Attempts to place 14 trees | Up to 840 | ~14 (nearly 1:1) |
| Attempts to place 12 rocks | Up to 720 | ~12 (nearly 1:1) |
| Terrain height calculations per patch | Up to 1,560 | ~26 |
| Wasted work | ~98% of attempts are discarded | Near zero waste |

The terrain height function is the most expensive part of placement — it layers 8 rounds of simplex noise on top of each other for every single call. Cutting those calls from ~1,560 down to ~26 per patch is roughly a **60x reduction** in the heaviest math operation.

---

## How It Works (Detailed)

### Old System: Rejection Sampling

```
Repeat up to 840 times:
  1. Pick a completely random (x, z) position in the patch
  2. Is it inside the lake? → Skip, try again
  3. Is it too close to an already-placed tree? → Skip, try again
  4. Calculate the terrain height at this position (expensive!)
  5. Place the tree at that height
  6. Stop early if we've hit 14 trees
```

The fundamental problem: step 1 has no awareness of where existing trees are. As the patch fills up, the odds of randomly landing in a valid gap drop fast. The system compensates by allowing 60 attempts per tree, but that's brute force — it wastes time on collisions that a smarter approach would avoid entirely.

The proximity check (step 3) uses a **spatial hash grid**: a Map of grid cells where each cell stores a list of nearby points. Checking "is this spot free?" requires scanning a 3x3 neighborhood of cells and comparing distances to every point found. Functional, but allocates Map entries and arrays that add garbage collection pressure.

### New System: Bridson's Poisson Disk Sampling

```
1. Place one seed tree at a random valid position
2. Add it to the "active" list
3. While there are active trees and we haven't reached 14:
   a. Pick a random tree from the active list
   b. Generate 30 candidate positions in a ring around it
      (between 1x and 2x the minimum spacing distance)
   c. For each candidate:
      - Is it inside the patch bounds? Is it outside the lake?
      - Is it too close to any existing tree? (grid lookup)
      - If valid → place it, add to active list, done
   d. If all 30 candidates failed → this tree is "surrounded",
      remove it from the active list
4. For each placed position:
   - Calculate terrain height (only now, only once)
   - Create the tree transform matrix
```

The key insight is step (b): candidates are generated **in the annulus** (ring) between distance `r` and `2r` from an existing point. This is exactly where valid placements can exist. The algorithm doesn't waste time guessing positions that are obviously too close or too far.

The proximity check uses a **flat Int32Array grid** instead of a Map. Each cell holds at most one point index (guaranteed by the cell size `r / √2`). Checking neighbors is a simple 5x5 loop over a contiguous typed array — no Map lookups, no array allocations, no garbage collection pressure. Each check is O(1).

### Why the Ring Matters

The minimum spacing between trees is `r = 0.7` world units. The old system picks from the entire 2×2 unit patch. The new system picks from a ring of inner radius 0.7 and outer radius 1.4 around a known tree.

As more trees fill the patch, the old system's random guesses increasingly land on occupied territory. The new system always starts its search from the frontier — the boundary between placed trees and open space — so it naturally finds gaps without wasting attempts.

### The Grid Trick

Bridson's algorithm uses a background grid with cell size `r / √2` (about 0.495 units for trees). At this size, each cell can contain **at most one point** while still guaranteeing that any two points within distance `r` will be in adjacent cells. This turns the "is anything too close?" check into a simple scan of 25 grid cells (5×5 neighborhood), each holding either nothing or a single index into a flat array.

Compare this to the old spatial hash, which stored variable-length arrays of points per cell and required Map key lookups — the flat grid is both faster and produces zero garbage for the collector to clean up.
