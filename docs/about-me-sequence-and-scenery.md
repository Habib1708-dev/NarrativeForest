# About Me Page Sequence and Scenery

This document describes the intended narrative sequence and the exact scene staging for the About page (`AboutScene`), where `Earth2` transitions into particle data that funnels into the AI chip and motherboard circuit.

## Scene Setup (Spatial Baseline)

- **Camera**
  - Perspective camera at `position [0, 1.5, 6]`, `fov 50`.
  - Neutral, centered framing for a hero-object composition.

- **Background and mood**
  - Flat dark background color: `#1a1a1a`.
  - Northern-lights layer exists behind/around the globe and fades out as specular mode rises.
  - Bloom ramps in only when particle mode is active (soft sci-fi glow).

- **Globe block (`Earth2`)**
  - Centered at world origin, visible sphere scale `2`.
  - Atmosphere shell scale `2.08`.
  - Earth rotates slowly on Y when enabled (`+0.1 * delta`).

- **Data-funnel block (inside Earth2 group)**
  - Funnel guide group positioned at:
    - `x = funnelOffsetX` (default `0`)
    - `y = funnelOffsetY` (default `-0.81`)
    - `z = funnelOffsetZ` (default `0`)
  - Funnel group scale `2`.
  - Default funnel shape values:
    - Mouth radius `0.65`
    - Convergence tip `Y = -1.1` (local)
    - Bottom extent `Y = -2.19` (local)
  - With scale and offset, the exit reaches approximately world `Y = -5.19`.

- **Motherboard + chip block (`Motherboard`)**
  - Motherboard plane default position: `[0, -5.5, 0]`, rotation `[-90, 0, 0]`.
  - Chip cube sits just above the board, centered near world `Y = -5.35` with top surface near `Y ≈ -5.20`.
  - This places funnel exit and chip intake nearly aligned on Y (intended visual "data feed" connection).

## Narrative Sequence (Story Order)

## 1) Opening: Day/Night Earth Identity

- Start with the full globe in day/night rendering (clouds, atmosphere, night lights).
- Keep atmosphere colors cool and readable, with gentle earth rotation.
- The visual message: global origin, duality, and motion before specialization.

## 2) Origin Ripples: Lebanese, Iraqi, Danish

- Trigger radial point-ripple events from fixed map UV anchors:
  - Lebanon: `u=0.598969569444, v=0.688682352069`
  - Iraq: `u=0.623526212276, v=0.685228834652`
  - Denmark: `u=0.525630074093, v=0.814533702003`
- Ripple progression is timed (`RIPPLE_DURATION_SEC = 2.5`) and should read as origin pulses.
- Narrative meaning:
  - Lebanese + Iraqi = heritage roots.
  - Denmark = birthplace and upbringing.
- The ripples should be temporally staggered enough to be legible as three distinct identity beats.

## 3) Specular Language Reveal

- Transition to **specular view** (`specularViewMix -> 1`) so language overlays and material details become dominant.
- Reveal language clusters over the globe in this order or grouped cadence:
  - Scandinavian
  - Arabic
  - Turkish
  - Blue/English layer
- Keep the globe still readable while overlays emerge; this stage is "skills and communication" rather than geography only.

## 4) Globe Dissolve to Data Particles

- Begin globe-to-particle crossfade:
  - Crossfade starts near `0.02`, completes around `0.72` of transition progress.
  - Atmosphere fades independently (default `0.0 -> 0.5`) for a cleaner handoff.
- Particle shell appears from globe surface with:
  - Surface lift, drift, and shimmer
  - Bright cool-white tone (`#f8fbff`) and low-opacity precision points
- Intended reading: structured world knowledge transforming into machine-readable data.

## 5) Funnel Transport: Data Stream Downward

- Activate funnel guides and in-funnel particles.
- Particles are captured from the shell, spiral inward, converge at tip, then drop through the vertical exit.
- Default behavior cues:
  - Gravity-driven narrowing
  - Swirl while converging
  - Semi-transparent tunnel lines for directional flow
- Spatially, the stream terminates near the chip's vertical level, so the audience perceives direct transfer.

## 6) AI Chip + Circuit Ingestion

- Final beat: particle data visually feeds the AI chip cube and motherboard plane below.
- Chip top face functions as the "compute intake" surface.
- Motherboard acts as the circuit substrate receiving processed flow.
- Composition should communicate pipeline logic:
  - Human/global context -> language capability -> data abstraction -> AI compute on hardware.

## Scenic Precision Notes (for consistency)

- Preserve strong vertical composition: globe centered high, board centered low, funnel linking both.
- Keep funnel mouth under lower globe hemisphere; avoid lateral drift unless intentional.
- Keep funnel exit and chip top within a tight Y window (`~ -5.2`) to maintain believable intake.
- Maintain contrast hierarchy:
  - Globe = broad contextual object
  - Language/specular phase = informative detail phase
  - Funnel + particles = kinetic transfer phase
  - Chip/board = destination and resolution phase
- Bloom should support the particle/funnel climax without washing out map-language readability earlier.

## One-line Story Statement

The About scene starts with a living day/night Earth, marks Lebanese-Iraqi heritage and Danish upbringing through localized ripples, reveals multilingual capability in specular language mode, then transforms the globe into data particles that funnel into an AI chip and motherboard circuit as a visual metaphor for turning identity and language into intelligence systems.
