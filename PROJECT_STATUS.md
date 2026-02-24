## Narrative Forest – Project Status (2026-02-22)

### Overview
- **Project**: Narrative Forest (interactive 3D narrative experience).
- **Tech**: React + Three.js (via `@react-three/fiber`), custom camera controllers, spline-based scroll camera, and rich UI overlays.
- **Camera mode**: `USE_SPLINE_CAMERA` is currently **enabled**, so the spline-based scroll path is the primary experience.

### Camera & Waypoints
- **Spline waypoints (in order)**:
  - Butterfly Intro
  - Butterfly Fades
  - Focus on the man
  - Focus on the man 2
  - Focus on the cat
  - Leaving the cat
  - Surrounded by nature
  - Focus on the tower
  - Approaching Crystals
  - Focus on crystals 1
  - Focus on crystals 2
  - New 1
  - New 2
  - New 3
  - End
- **Spline store** (`useSplineCameraStore`):
  - Handles scroll-driven camera motion, free-fly at the end, joystick inputs, and curve/weight configuration.
  - Includes special handling (gravity/slowdown) for key waypoints like **Focus on the man 2**, **Focus on the cat**, and crystal segments.

### StopCircleOverlay – Current Behavior
- **Activation**:
  - Overlay is driven by the spline camera `t` when `USE_SPLINE_CAMERA` is true.
  - For spline, the overlay appears starting at **“Focus on the man”** and remains active through the early narrative segments.
- **Habib intro text**:
  - `"Hello, this is me Habib."` is shown on the segment **between**:
    - **Focus on the man → Focus on the man 2** (spline).
  - Legacy waypoint timing (`stop-4`, `stop-5`, `stop-6`) is preserved for the non-spline camera path.
- **Cat segment text**:
  - `"This is my cat Skye"` is shown on the extended segment **between**:
    - **Focus on the man 2 → Leaving the cat** (spline).
  - Timing is eased in/out across that segment; legacy still uses the `t5 → t6 → t9` window.
- **Cat paw trail**:
  - Visible in the same **cat segment** as the `"This is my cat Skye"` text:
    - **Spline**: from **Focus on the man 2 → Leaving the cat**, starting **15%** into the segment and running until the end.
    - **Legacy**: from `t5 → t6` with the same 15% delay.
  - Individual paw opacities are sequenced with a fading tail for a trail effect.
- **Halo & backdrop**:
  - Circle and background opacity/scale are driven by normalized progress between segment waypoints.
  - **Cat segment halo color**:
    - Smoothly transitions to **orange** while in the `"This is my cat Skye"` segment.
    - Uses a **smooth-step** blend:
      - First and last **25%** of the cat segment: gradual in/out between the default yellow and orange.
      - Middle **50%**: fully orange.

### UI & Flow Integration
- **Welcome overlay**:
  - Shows after the loading screen finishes, then fades out in two phases (content, then background).
  - After the welcome overlay fully disappears, the Habib/StopCircle overlay fades in.
- **Free-fly mode**:
  - Entering free-fly immediately begins fading out the StopCircle overlay and eventually unmounts it to avoid extra work.
- **Other UI bindings**:
  - `ClickAndDragHint`, `FreeFlyJoystickOverlay`, `Navbar`, and `PresetSelector` already respect `USE_SPLINE_CAMERA` and read from either the spline or legacy camera stores.

### Recent Work (this branch)
- **Spline integration of StopCircleOverlay**:
  - All key text segments (Habib intro + cat segment) are now bound to **spline waypoint names** instead of the legacy `stop-*` names when `USE_SPLINE_CAMERA` is on.
- **Extended cat narrative window**:
  - Cat text, halo color, and paw trail now all use the **same extended spline segment**:
    - **Focus on the man 2 → Leaving the cat**.
- **Smooth visual polish**:
  - Halo color uses a smooth-step easing when entering and exiting the cat segment for non-abrupt transitions.
  - Hooks ordering in `StopCircleOverlay` is fixed so there are no React "rendered more hooks than during the previous render" errors.

### Known / Next Potential Steps
- **Spline narrative mapping**:
  - Map the remaining text segments (“Nature is all around us”, technology text, crystals narrative, etc.) explicitly onto spline waypoints.
- **Mobile / performance**:
  - Validate performance on lower-end mobile devices with `USE_SPLINE_CAMERA = true`, especially around rich overlay segments (text + paws + halo glow).
- **Content iteration**:
  - Finalize or expand the `"New 1"`, `"New 2"`, `"New 3"` segments with narrative and overlays to match the overall story arc.

