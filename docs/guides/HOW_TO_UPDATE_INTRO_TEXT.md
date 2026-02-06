# How to Update Intro Text

This guide explains how to modify the intro text, narrative overlays, and text animations in the Narrative Forest project.

## Overview

The text system consists of two main components:

| Component | Purpose | File |
|-----------|---------|------|
| **IntroText** | Initial title/subtitle shown after clicking "Explore" | `src/components/IntroText.jsx` |
| **StopCircleOverlay** | Narrative text that appears at camera waypoints | `src/components/StopCircleOverlay.jsx` |

---

## 1. Updating the Main Intro Text (Title & Subtitle)

### Location
`src/components/IntroText.jsx` (lines 14-15)

### Current Text
```javascript
const TITLE_TEXT = "Habib Khalaf";
const SUBTITLE_TEXT = "AI & Full Stack 3D Web Developer";
```

### How to Change
Simply edit these two constants:

```javascript
// Example: Change to your own name and title
const TITLE_TEXT = "Your Name Here";
const SUBTITLE_TEXT = "Your Professional Title";
```

### Animation Timing
The text animates character-by-character. To adjust timing:

```javascript
// Line 17: Delay between each character (in seconds)
const CHAR_DELAY = 0.028;  // 28ms per character

// Line 18: How far camera must move forward to complete animation
const ANIMATION_DISTANCE = 0.5;
```

---

## 2. Updating Narrative Text Segments

### Location
`src/components/StopCircleOverlay.jsx` (lines ~160-210)

### Current Text Segments
```javascript
const textSegments = [
  {
    text: "Hello, this is me Habib.",
    startIn: t4,      // When text starts fading in
    endIn: t5,        // When text is fully visible
    startOut: t5,     // When text starts fading out
    endOut: t6,       // When text is fully hidden
  },
  {
    text: "This is my cat Skye",
    startIn: t5,
    endIn: t6,
    startOut: t8,
    endOut: t9,
    delayIn: 0.5,     // Optional: delay before animation starts
  },
  {
    text: "Nature is all around us",
    startIn: t9,
    endIn: t12,
    startOut: t13 - 0.02,
    endOut: t13,
    type: "carousel", // Special animation: one word at a time
  },
  {
    text: "But, we are connected through technology",
    startIn: t13,
    endIn: t13b,
    startOut: t13b,
    endOut: t14,
    type: "carousel",
  },
];
```

### How to Change Text Content
Edit the `text` property of any segment:

```javascript
{
  text: "Your new narrative text here",
  startIn: t4,
  endIn: t5,
  startOut: t5,
  endOut: t6,
}
```

### Understanding Timing Variables
The `t` variables correspond to camera waypoints defined in `useCameraStore.js`:

| Variable | Waypoint Name | Description |
|----------|---------------|-------------|
| `t4` | "stop-4" | Fourth camera stop |
| `t5` | "stop-5" | Fifth camera stop |
| `t6` | "stop-6" | Sixth camera stop |
| ... | ... | ... |

To find waypoint values:
```javascript
// In StopCircleOverlay.jsx, waypoints are looked up like this:
const t4 = useMemo(() => lookupWaypointT("stop-4"), [lookupWaypointT]);
```

### Animation Types
- **Default**: Words animate in together with stagger effect
- **"carousel"**: Only one word visible at a time, rotates through words

---

## 3. Adding New Text Segments

### Step 1: Define the Waypoint Timing
First, find or create the waypoint in `src/state/useCameraStore.js`:

```javascript
// Example: Adding a new waypoint
{
  name: "stop-custom",
  position: [x, y, z],
  orientation: { yaw: 0, pitch: 0 },
  ease: { name: "sineInOut" },
}
```

### Step 2: Look Up the Waypoint
In `StopCircleOverlay.jsx`, add a lookup:

```javascript
const tCustom = useMemo(() => lookupWaypointT("stop-custom"), [lookupWaypointT]);
```

### Step 3: Add the Text Segment
Add to the `textSegments` array:

```javascript
{
  text: "Your new narrative text",
  startIn: tCustom,
  endIn: tCustom + 0.02,  // Adjust timing as needed
  startOut: tCustom + 0.05,
  endOut: tCustom + 0.07,
}
```

---

## 4. Updating Top Center Text

### Location
`src/components/StopCircleOverlay.jsx` (lines ~520-600)

### Current Text
```javascript
const topCenterText = "We craft the extraordinary with our creativity";
```

### How to Change
```javascript
const topCenterText = "Your new top center message here";
```

This text appears during the `t14` to `t15Spin` camera segment.

---

## 5. Updating Arch Texts

### Location
`src/components/StopCircleOverlay.jsx` (lines ~700-800)

### Current Texts
```javascript
// First arch text
"We make creative 3D & full-stack websites"

// Second arch text
"We Develop AI models & softwares"
```

### How to Change
Find the `<span>` elements in the arch text section and update the text content.

---

## 6. Styling Text

### Font & Colors
Edit the inline styles in each component or modify the CSS classes:

```jsx
// IntroText.jsx - Title styling
<h1 style={{
  fontFamily: "var(--display-font)",
  fontSize: "clamp(2rem, 8vw, 5rem)",
  color: "#ffffff",
  // ... more styles
}}>
```

### Animation Effects
The character animation uses these CSS properties:
- `opacity`: Fade in/out
- `transform`: translateY (vertical movement), scale
- `filter`: blur effect

```javascript
// In IntroText.jsx, animation calculations:
const opacity = progress < 0.6
  ? 1 - progress * (1 - 0.4) / 0.6  // 1 → 0.4
  : 0.4 - (progress - 0.6) * 0.4 / 0.4; // 0.4 → 0

const translateY = progress * 16; // 0 → 16px
const scale = 1 - progress * 0.02; // 1 → 0.98
const blur = progress < 0.6
  ? progress / 0.6  // 0 → 1px
  : 1 + (progress - 0.6) / 0.4; // 1 → 2px
```

---

## 7. Quick Reference: Common Changes

### Change intro name and title
```javascript
// src/components/IntroText.jsx
const TITLE_TEXT = "New Name";
const SUBTITLE_TEXT = "New Title";
```

### Change narrative greeting
```javascript
// src/components/StopCircleOverlay.jsx → textSegments[0]
text: "Hello, welcome to my portfolio.",
```

### Slow down character animation
```javascript
// src/components/IntroText.jsx
const CHAR_DELAY = 0.05; // Slower (50ms per char)
```

### Make text appear longer
```javascript
// Increase the gap between startOut and endOut
{
  text: "Stay visible longer",
  startIn: t4,
  endIn: t5,
  startOut: t8,  // Starts fading out later
  endOut: t9,
}
```

---

## 8. Testing Changes

1. Run the development server:
   ```bash
   npm run dev
   ```

2. Navigate through the experience to see text at different waypoints

3. Use debug mode (if available) to see current `t` value and waypoint names

4. Check browser console for any errors related to text rendering

---

## File Summary

| File | What to Edit |
|------|--------------|
| `src/components/IntroText.jsx` | Main title, subtitle, character animation |
| `src/components/StopCircleOverlay.jsx` | Narrative segments, top text, arch texts |
| `src/state/useCameraStore.js` | Waypoint positions and names (timing anchors) |
| `src/components/HelloText.jsx` | Example component (not used in production) |
