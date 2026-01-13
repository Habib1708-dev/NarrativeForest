# Loading and Overlay Components

This document describes the behavior of the loading screen and overlay components in the Narrative Forest project.

## LoadingScreen Component

**Location:** `src/components/LoadingScreen.jsx`

### Purpose
The `LoadingScreen` component provides a visual loading indicator that displays immediately when the application starts, preventing users from seeing a blank white screen during initialization.

### Behavior

#### Initial Display
- **Shows immediately** on component mount (no delay)
- Displays a dark background (`#2a2a2a`) with a centered "LOADING" text and animated spinner
- Uses `position: fixed` with `z-index: 9999` to cover the entire viewport
- Prevents body scrolling while active

#### Loading States

The component monitors two key conditions before hiding:

1. **Asset Loading (`active` from `useProgress`):**
   - Uses `@react-three/drei`'s `useProgress` hook to track when 3D assets (models, textures, etc.) finish loading
   - `active` becomes `false` when all assets are loaded

2. **Forest Ready (`forest-ready` event):**
   - Listens for a custom `forest-ready` window event
   - This event is dispatched by `ForestDynamicSampled`'s `onInitialReady` callback
   - Ensures that initial tree chunks have been built and rendered before proceeding

#### Hiding Sequence

Once both conditions are met (`!active && isForestReady`):

1. **Stabilization Period (1000ms):**
   - Waits 1 second for the scene to fully settle and render
   - Prevents premature removal while trees are still rendering

2. **Fade Out (2000ms):**
   - Applies the `loading-screen--hidden` CSS class (slides up animation)
   - Duration: 2 seconds
   - During fade, dispatches `loading-screen-finished` event

3. **Removal:**
   - Component is removed from DOM after fade completes
   - Restores body overflow behavior
   - Sets `window.__loadingScreenFinished = true` flag

### Events

#### Dispatches:
- `loading-screen-finished`: Fired when the fade-out animation begins (not when it completes)

#### Listens for:
- `forest-ready`: Custom event indicating that the forest scene is ready

### Configuration

```javascript
const STABILIZE_DURATION = 1000;  // ms - time to wait after assets are ready
const FADE_DURATION = 2000;       // ms - fade out animation duration
```

---

## StopCircleOverlay Component

**Location:** `src/components/StopCircleOverlay.jsx`

### Purpose
A multi-purpose overlay component that provides:
1. A welcome overlay that appears after the loading screen
2. Interactive stop circles and text segments synchronized with the camera path
3. Author signature text display

### Behavior

#### Welcome Overlay

**Trigger:**
- Listens for the `loading-screen-finished` event from `LoadingScreen`
- Also checks `window.__loadingScreenFinished` flag (for page refresh scenarios)

**Display:**
- Full-screen overlay with blur effect and radial gradient background
- Background follows mouse movement (interactive gradient)
- Responsive padding (1.5rem mobile, 2.5rem desktop)
- Uses `backdrop-filter: blur(14px)` for glassmorphism effect

**Fade Out Conditions:**
1. User enters free fly mode (via navbar or interaction)
2. Two-phase fade:
   - **Phase 1 (400ms):** Content fades out
   - **Phase 2 (500ms):** Background fades out
   - Total: ~900ms transition

**After Welcome Overlay:**
- Shows "Habib" signature text (fades in 50ms after welcome overlay finishes)
- Only shows if user hasn't entered free fly mode

#### Stop Circles and Text Segments

**Visibility:**
- Only renders when camera timeline (`t`) reaches `stop-4` waypoint
- Circles and text segments are synchronized with camera path waypoints
- Uses normalized timeline values (0-1) mapped from waypoint names

**Circle Behavior:**
- Progressively appears as camera moves through waypoints
- Scales and animates based on timeline position
- Includes backdrop glow and opacity animations
- Respects navbar boundaries (keeps circles below navbar area)
- Responsive sizing (larger on mobile)

**Text Segments:**
- Supports multiple text display types:
  - **Standard text:** Fades in/out at specific waypoints
  - **Carousel text:** Word-by-word display with transitions
- Text segments have configurable timing:
  - `startIn` / `endIn`: Fade in period
  - `startOut` / `endOut`: Fade out period (optional)
  - `delayIn`: Initial delay before fade in

**Special Effects:**
- Paw trail animation (diagonal trail of paw icons)
- Circle collapse animation at specific waypoints
- Sequential arch animations
- Ring close animations

### Camera Mode Integration

- Automatically hides welcome overlay when entering free fly mode
- Circles and text segments remain visible during guided camera mode
- Respects camera state from `useCameraStore`

---

## FreeFlyJoystickOverlay Component

**Location:** `src/components/FreeFlyJoystickOverlay.jsx`

### Purpose
Displays a virtual joystick control overlay when the user is in free fly camera mode and actively dragging/controlling the camera.

### Behavior

#### Visibility
- **Only shows when:**
  - Camera mode is `"freeFly"`
  - User is actively dragging (`dragging === true`)
  - Joystick origin and input data are available

#### Display
- **Outer Ring:**
  - Fixed position based on touch/pointer origin
  - Semi-transparent background with blur effect
  - Border: `2px solid rgba(255,255,255,0.65)`
  - Background: `rgba(20, 24, 32, 0.35)`

- **Inner Dot:**
  - Positioned based on user input (joystick position)
  - Glowing blue dot: `rgba(95, 189, 255, 0.6)`
  - Box shadow for glow effect
  - Moves within the outer ring bounds

#### Responsive Sizing
- **Desktop:** Full size (base radius)
- **Tablet (768px-480px):** 80% of base radius
- **Small phones (<480px):** 65% of base radius

#### Fade Animation
- Fades in when dragging starts: 220ms
- Fades out when dragging stops: 220ms
- Uses timeout-based state management to handle rapid state changes

### Configuration

```javascript
const FADE_MS = 220;  // Fade in/out duration
```

Joystick radius and inner scale are configurable via camera store:
- `freeFlyJoystickRadius` (default: 80)
- `freeFlyJoystickInnerScale` (default: 0.35)

---

## Component Interaction Flow

```
Application Start
    ↓
LoadingScreen appears (immediately)
    ↓
Assets loading (useProgress tracks this)
    ↓
Forest rendering (ForestDynamicSampled builds trees)
    ↓
ForestDynamicSampled.onInitialReady() fires
    ↓
"forest-ready" event dispatched
    ↓
LoadingScreen: Both conditions met (!active && isForestReady)
    ↓
Stabilize for 1000ms
    ↓
LoadingScreen begins fade out (2000ms)
    ↓
"loading-screen-finished" event dispatched
    ↓
StopCircleOverlay: Welcome overlay appears
    ↓
User interaction OR free fly mode entered
    ↓
Welcome overlay fades out (900ms total)
    ↓
"Habib" text appears (if not in free fly)
    ↓
Stop circles/text segments appear (when camera reaches stop-4)
```

---

## Z-Index Hierarchy

To understand overlay layering:

- **LoadingScreen:** `z-index: 9999` (highest - covers everything)
- **Welcome Overlay (StopCircleOverlay):** `z-index: 120`
- **StopCircleOverlay container:** `z-index: 50`
- **FreeFlyJoystickOverlay:** `z-index: 1000`

---

## Notes

- The loading screen was specifically designed to show immediately to prevent white screen flash
- The `forest-ready` event timing was moved from `Experience` mount to `ForestDynamicSampled.onInitialReady` to ensure trees are actually rendered before hiding the loading screen
- All overlays use CSS transitions for smooth animations
- The welcome overlay's interactive background (mouse-following gradient) provides visual feedback
- Overlays are designed to be non-intrusive and respect user interactions
