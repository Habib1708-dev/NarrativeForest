# Narrative Forest Exploration — Project Guidance

## Vision

A 3D interactive narrative built with React Three Fiber (R3F) where the user:

- Part 1 (Designed Environment): Starts with a guided story mode in a hand‑crafted scene (cabin, man, cat, trees, custom terrain)
- Part 2 (Procedural Exploration): Transitions into free exploration across an infinite, procedurally generated forest
- Can change seasons (Autumn, Summer, Winter, Spring) and day/night cycles dynamically
- Experiences immersive effects like fog, rain, snow, auroras, and dynamic skies

## Key Features

### A. Guided Narrative (Designed by hand)

- Fixed intro camera view with "Start Explore" button
- Camera animates to a cabin with characters (man + cat GLTF models)
- Overlay HTML shows story text
- Arrows on screen allow user to move from waypoint to waypoint

### B. Free Exploration (Procedural)

- At the end of waypoints, controls unlock → user can explore forest infinitely
- Movement restricted to X/Z plane (no flying upward)
- Procedural terrain ensures no boundaries and dynamic variation

### C. Environment Simulation

- Fog: Procedural, height-based, season‑dependent
- Rain/Snow: Particle systems, splashes on ground, and raindrop streaks
- Sky: HDRI or custom shader, dynamic for seasons and day/night

### D. Seasons (user can switch via UI)

- Autumn: Red/orange leaves, golden grass, fog + rain, cloudy muted sky
- Summer: Lush green trees, vibrant grass, bright sky with clouds
- Winter: Bare/white trees, snow system, cold fog, pale gray sky
- Spring: Mix of green & pink blossoms, fresh grass, blue skies

### E. Day/Night Cycle

- Day: Normal lighting
- Night: Dark forest silhouette, starry sky, auroras, glowing fog

## Technical Plan

### Frontend Stack

- React Three Fiber (R3F) for Three.js in React
- drei for helpers (OrbitControls, Html, Sky)
- zustand for global state (season, time, narrative step)
- react-spring / gsap for smooth camera animations
- postprocessing for rain-on-lens and fog effects

### Assets

- Models: Cabin/house, man, cat, tree variations (GLTF)
- Textures: Bark, leaves, terrain
- HDRIs: Day, sunset, cloudy, night

### Systems to Implement

#### Camera Control System

- Two modes: Guided (predefined waypoints, designed scene) + Free (procedural exploration)
- Smooth transitions between them

#### Narrative System

- Waypoint data structure: { position, lookAt, textOverlay }
- On arrow click → camera moves to next waypoint
- Overlay text updates accordingly

#### Terrain System

- Part 1: Designed terrain (set by hand)
- Part 2: Infinite procedural chunk loading
- Noise-based vertex displacement for hills
- Shader blends grass/dirt/rock based on height

#### Seasons System

- Central state season with values [summer, autumn, winter, spring]
- On change → update uniforms in shaders + particle systems + fog parameters

#### Day/Night System

- Central state timeOfDay with [day, night]
- Adjust ambient/directional lights
- Swap sky shader (HDRI → stars/aurora)
- Tree/terrain shaders tint accordingly

#### Weather/Effects

- Rain: GPU particles, with splash decals + screen droplets
- Snow: Similar to rain, with accumulation shader
- Fog: fogExp2 with noise distortion
- Aurora: Animated shader on large sky plane

## Project Architecture

```
src/
├─ assets/            # Models, textures, HDRIs
│  ├─ models/
│  ├─ textures/
│  └─ hdri/
│
├─ components/
│  ├─ Scene.jsx              # Main R3F scene
│  ├─ CameraController.jsx   # Handles guided/free camera
│  ├─ NarrativeOverlay.jsx   # HTML overlays
│  ├─ Terrain.jsx           # Procedural terrain with shader
│  ├─ Weather/
│  │  ├─ Fog.jsx
│  │  ├─ Rain.jsx
│  │  └─ Snow.jsx
│  └─ Skies/
│     ├─ DaySky.jsx
│     ├─ NightSky.jsx
│     └─ AuroraShader.js
│
├─ state/
│  ├─ useSeasonStore.js    # Zustand store for seasons
│  ├─ useNarrativeStore.js # Narrative progress
│  └─ useTimeStore.js      # Day/night state
│
├─ shaders/
│  ├─ terrainShader.js     # Vertex height + grass blend
│  ├─ treeLeafShader.js    # Seasonal leaf colors
│  └─ skyAuroraShader.js   # Northern lights effect
│
└─ App.jsx                  # R3F <Canvas> + UI controls
```

## Developer Checklist

1. Set up R3F project with Canvas and lighting
2. Implement camera system (guided → free)
3. Build narrative overlay system with waypoints
4. Create designed terrain + cabin scene
5. Add man + cat animated models with trees
6. Create procedural terrain shader with infinite chunks
7. Implement season system with material uniforms
8. Add day/night toggle with dynamic skies
9. Add fog + rain + snow particle systems
10. Add aurora + stars shader for night
11. Polish performance with instancing & LOD
