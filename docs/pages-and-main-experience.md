## Narrative Forest – Site & Experience Overview

This project is a Vite + React + React Three Fiber experience that presents a guided journey through a stylized forest, then hands control over to the visitor in a free‑flight exploration mode. The site wraps this core 3D experience in a small set of traditional pages.

---

## Pages & Routes

### Home (`/`)

- **Purpose**: The main immersive experience. It renders the 3D forest, the narrative camera path, audio soundscape, and all interactive overlays.
- **Key elements**:
  - A **loading screen** that waits for the forest and assets to be ready before revealing the scene.
  - A **welcome overlay** titled “Welcome To The Narrative Forest” with an **Explore** button that begins the journey.
  - A **navbar** with:
    - A “Skip to freeflight / Exit freeflight” control for jumping directly into or out of free‑flight mode.
    - Links to the secondary pages (About Me, Our Work, Contact Us).
    - A global **sound toggle**.
  - A full‑screen `<Canvas>` where the `Experience` component renders:
    - Cabin, man (Habib), cat, radio tower, crystals, forest, terrain, lake, volumetric fog, custom sky, and post‑processing effects.
  - A **Stop Circle Overlay** that anchors the main narrative text to a glowing circle in the center of the screen.
  - UI aids for interaction:
    - **Click & Drag Hint** overlay: a glassy modal that appears when you reach the end of the guided path, explaining that you can “Click & Drag” to “Navigate freely through the scene”.
    - **Free‑fly joystick overlay** on touch devices, showing a dynamic virtual joystick while the user drags.
    - **Preset selector** (“Atmosphere” chip) that opens a small panel of atmospheric presets (Default, White Dawn, Night, Stormy Night, Dawn, Purplish Evening, Sunset, Summer Day, Polar Night, Dawn In Lofoten).
  - Continuous **background audio**:
    - A forest soundscape.
    - Optional rain ambience that fades in automatically for the “Stormy Night” preset.

### About Me (`/about-me`)

- **Purpose**: A dedicated secondary scene reserved for a future About Me experience separate from the main forest journey.
- **Current content**: A standalone React Three Fiber `<Canvas>` with its own camera controls, lighting, and a placeholder sphere for the upcoming globe visualization.

### Our Work (`/our-work`)

- **Purpose**: A portfolio/overview page for projects and case studies.
- **Current content**: A centered layout with the heading “Our Work”, ready for future expansion with actual project listings.

### Contact Us (`/contact-us`)

- **Purpose**: A contact/engagement page for potential clients or collaborators.
- **Current content**: A centered layout with the heading “Contact Us” where contact details or a form can be added later.

### Internal Debug Page – Camera Debug

- **File**: `src/pages/CameraDebug.jsx` (not wired into the main router by default).
- **Purpose**: A developer‑facing tool for editing and visualizing the spline camera path:
  - Renders the full forest scene alongside a spline camera debug overlay.
  - Shows a dedicated **Camera Debug Sidebar** for capturing and editing waypoints.
  - Forces debug mode on to expose Leva controls and camera tooling.

---

## Main Page Narrative & Experience

### 1. Arrival & Welcome

1. **Loading phase**:
   - The visitor first sees a **LOADING** screen with a radial spinner while 3D assets (forest, terrain, lighting, etc.) are fetched.
   - Once the scene is ready and has rendered a few stable frames, the loading overlay fades out.

2. **Welcome overlay**:
   - Immediately after loading, a full‑screen glassmorphic panel appears with the title:
     - **“Welcome To The Narrative Forest”**
   - A single **Explore** button invites the visitor to continue.
   - The background is still, softly animated with radial gradients that respond to cursor position, hinting at depth and light.

3. **Entering the scene**:
   - Clicking **Explore** fades the welcome overlay away and reveals the forest at night (or the currently selected preset).
   - Ambient audio begins or continues fading in, placing the visitor in a quiet, atmospheric woodland soundscape.

### 2. Guided Narrative Along the Camera Path

Once the welcome has faded out, the visitor begins a **guided camera journey** along a spline path. As the camera moves through key waypoints, the **Stop Circle Overlay** appears: a glowing circular focus point in the center of the screen that anchors the text narration.

The story beats and text are:

- **Introduction of the creator**  
  - Text: **“Hello, this is me Habib.”**  
  - Visual context: The camera focuses on the **man** near the cabin, introducing Habib as an in‑scene avatar. The bright circle and halo draw attention to this character as the narrative voice.

- **Introducing the cat**  
  - Text: **“This is my cat Skye”**  
  - Visual context: The camera shifts to focus on the **cat**, while a playful trail of glowing **paw prints** animates along the bottom‑right of the screen. This gives the moment a warm, personal tone connecting the visitor to Habib’s companion.

- **Being surrounded by nature**  
  - Text: **“We are surrounded by nature...”**  
  - Visual context: As the camera leaves the cat and pulls out, the forest, trees, terrain, and distant elements come into view.  
  - **Animation style**: Each word pops into place one by one (a “wordPop” effect), with the final word “nature...” intentionally rendered on its own line. This emphasizes the word “nature” visually while avoiding any layout jump.

- **Connection through technology**  
  - Text: **“But, we are connected through technology”**  
  - Visual context: The camera glides toward and focuses on the **radio tower**, visually representing the technological connection that coexists with the natural setting.  
  - **Animation style**: A word‑by‑word carousel, where each word briefly becomes the focal point before the sentence settles, mirroring the idea of signals and connections moving through the air.

As the path continues beyond the tower toward crystalline formations, additional text elements reinforce the professional message:

- **Top‑center tagline**  
  - Text: **“I leverage creativity to build immersive digital experiences through code”**  
  - Behavior: Appears near the top‑center of the viewport, with each word smoothly drifting in and then out. This line explicitly states Habib’s craft: building immersive, interactive experiences like the one the visitor is currently inside.

- **Arch‑style statements**  
  - Text segments that animate vertically through the frame:
    - **“I create” / “immersive 3D & full-stack websites”**  
    - **“I Develop” / “AI models and software”**  
  - Visual context: These lines appear as large, gently moving headings in the middle of the screen, framed by the environment, explicitly tying the magical forest to concrete services and technical capabilities.

Overall, the guided portion tells a short, personal story:

> *Habib (and his cat Skye) live within a serene, natural forest, yet they are also connected to the wider world through technology. Habib uses that combination—nature’s calm and technology’s reach—to craft immersive digital experiences and advanced software/AI work for others.*

### 3. From Narrative to Free Exploration

Toward the end of the guided path:

- A **Click & Drag** overlay appears, prompting:
  - **Headline**: “Click & Drag”
  - **Subtext**: “Navigate freely through the scene”
  - Paired with a modern animated cursor + ring motif, it clearly signals that control is now handed to the visitor.

- On desktop:
  - The visitor can drag to look around and use standard input (mouse/keyboard) to move once free‑flight is active.

- On touch devices:
  - A **joystick overlay** appears, showing a circular pad that follows the user’s thumb/finger.
  - The inner disk responds to input, conveying direction and intensity of movement.

The **navbar** flight button now offers:

- **“Skip to freeflight”** while still on the guided path (to jump ahead).
- **“Exit freeflight”** when already in free‑flight (returning to the starting route/home state when clicked).

### 4. Atmospheres & Mood Presets

In free‑flight, an **“Atmosphere”** chip at the top‑center opens a preset panel:

- Each preset tweaks fog color, sky scattering, haze, tint, and sometimes lightning:
  - Examples: **Default**, **Night**, **Stormy Night**, **Dawn**, **Purplish Evening**, **Sunset**, **Summer Day**, **Polar Night**, **Dawn In Lofoten**.
- Some presets subtly change the feeling of the entire forest:
  - **Night / Stormy Night**: darker tones, heavier fog, and in “Stormy Night”, occasional lightning flashes plus layered rain audio.
  - **Dawn / Summer Day / Sunset**: brighter skies, higher saturation, and different sun positions that change the light’s angle through the trees.

The result is that, after the story has introduced Habib and his work, the visitor can **linger** in the forest and try different moods—almost like flipping through visual case studies of atmosphere design rather than static screenshots.

---

## What the Main Page Communicates

Taken together, the main page tells this story through its text and interactions:

- **Who**: Habib, introduced in‑scene alongside his cat Skye.
- **Where**: A richly rendered forest world that feels alive, with lighting, fog, water, and stars.
- **What**: The capability to design and implement **immersive 3D & full‑stack websites** and **AI‑driven software**.
- **How it feels**: Calm, atmospheric, and exploratory—more like walking into a digital art piece or interactive film than browsing a traditional portfolio site.

By the time the visitor reaches free‑flight and starts changing atmospheres, they’ve experienced a living demonstration of Habib’s approach to narrative, interaction design, technical depth, and visual polish.

