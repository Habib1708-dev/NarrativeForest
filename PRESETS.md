# Atmospheric Presets

This document contains atmospheric and lighting presets for the Narrative Forest scene. Each preset creates a distinct mood and time-of-day ambiance.

## Available Presets

### White Dawn

A soft, misty morning atmosphere with neutral tones.

**Settings:**

- **Atmosphere**
  - `fogColor`: `#4d4d4d`
- **Sky**
  - `skyDarken`: `0.17`
- **Sky / Haze**
  - `hazeColor`: `rgb(166, 166, 166)`

---

### Night

A darkened nighttime scene with subdued visibility.

**Settings:**

- **Scene**
  - `globalDarken`: `0.15`
- **Atmosphere**
  - `fogColor`: `#4d4d4d`
- **Sky**
  - `skyDarken`: `0.15`

---

### Dawn

Early morning with cool blue tints and low sun position.

**Settings:**

- **Scene**
  - `globalDarken`: `0.15`
- **Atmosphere**
  - `fogColor`: `#4d4d4d`
- **Sky**
  - `sunPosition`: `[5, 1, 30]`
  - `rayleigh`: `0.11`
  - `skyDarken`: `0.15`
- **Sky / Haze**
  - `hazeColor`: `rgb(162, 162, 162)`
- **Sky / Color**
  - `tintColor`: `rgb(71, 94, 133)`
  - `saturation`: `1.91`
  - `tintStrength`: `0.37`
  - `hueShift`: `3`

---

### Purplish Evening

A romantic evening atmosphere with purple and pink tones.

**Settings:**

- **Scene**
  - `globalDarken`: `0.1`
- **Atmosphere**
  - `fogColor`: `#4d4d4d`
- **Sky**
  - `sunPosition`: `[5, 2, 40]`
  - `rayleigh`: `0.21`
  - `turbidity`: `2.62`
  - `mieCoefficient`: `0.037`
- **Sky / Haze**
  - `hazeColor`: `rgb(88, 88, 88)`
- **Sky / Color**
  - `saturation`: `1.59`
  - `tintStrength`: `0.43`
  - `tintColor`: `rgb(250, 207, 207)`

---

### Sunset

Dramatic sunset with warm orange and red hues.

**Settings:**

- **Scene**
  - `globalDarken`: `0.03`
- **Atmosphere**
  - `fogColor`: `#161616`
- **Sky**
  - `sunPosition`: `[5, 3, 50]`
  - `rayleigh`: `0.28`
  - `turbidity`: `2.97`
  - `mieCoefficient`: `0.1`
  - `mieDirectionalG`: `0.81`
  - `skyDarken`: `0.93`
- **Sky / Haze**
  - `hazeColor`: `rgb(0, 0, 0)`
- **Sky / Color**
  - `saturation`: `1.86`

---

### Summer Day

Bright, vibrant daytime scene with strong sunlight.

**Settings:**

- **Scene**
  - `globalDarken`: `0`
- **Atmosphere**
  - `fogColor`: `#4d4d4d`
- **Sun**
  - `sunPosition`: `[5, 10, 50]`
  - `rayleigh`: `4`
  - `mieCoefficient`: `0.014`
  - `skyDarken`: `0.86`
- **Sky / Color**
  - `saturation`: `2.5`

---

## Parameter Descriptions

### Scene Parameters

- **globalDarken**: Overall scene darkness multiplier (0 = no darkening, higher values = darker)

### Atmosphere Parameters

- **fogColor**: Hex color of the atmospheric fog

### Sky Parameters

- **sunPosition**: `[x, y, z]` position vector of the sun
- **rayleigh**: Rayleigh scattering coefficient (affects sky blue color)
- **turbidity**: Atmospheric turbidity (haze/particle density)
- **mieCoefficient**: Mie scattering coefficient (affects haze appearance)
- **mieDirectionalG**: Directionality of Mie scattering
- **skyDarken**: Sky brightness reduction factor

### Sky / Haze Parameters

- **hazeColor**: RGB color of the atmospheric haze

### Sky / Color Parameters

- **tintColor**: RGB color overlay for the sky
- **saturation**: Color saturation multiplier
- **tintStrength**: Intensity of the tint effect (0-1)
- **hueShift**: Hue rotation offset in degrees

---

## Usage

### Dynamic Preset Switching

The scene now includes a dynamic preset system with smooth transitions. You can switch between presets on-the-fly using the Leva controls panel.

#### How to Use:

1. **Open the Leva Panel**: When you run the development server, you'll see the Leva controls panel in the top-right corner of the screen.

2. **Find the Presets Section**: Look for the "Presets" folder in the Leva panel.

3. **Select a Preset**: Use the dropdown menu labeled "Select Preset" to choose from:

   - Default
   - White Dawn
   - Night
   - Dawn
   - Purplish Evening
   - Sunset
   - Summer Day

4. **Adjust Transition Duration** (optional): Use the "Transition Duration (s)" slider to control how long the transition takes (0.1 to 10 seconds, default is 2 seconds).

5. **Watch the Magic**: When you select a preset, all atmospheric settings will smoothly interpolate from the current state to the new preset values over the specified duration.

#### Technical Details:

- **Smooth Interpolation**: All values (colors, numbers, arrays) are smoothly interpolated using an ease-in-out cubic easing function for natural transitions.
- **Color Transitions**: Colors smoothly blend in RGB color space.
- **Array Transitions**: Vector values like sun position smoothly interpolate component-wise.
- **Real-time**: Transitions happen in real-time and don't block the scene rendering.

#### Example Workflow:

```
1. Start with "Default" preset
2. Set transition duration to 3 seconds
3. Select "Sunset" - watch as the scene gradually transforms into a dramatic sunset
4. Select "Night" - see the sky darken and atmosphere shift
5. Select "Summer Day" - brighten up to a vibrant daytime scene
```

### Manual Control

You can still manually adjust individual parameters in the Scene, Atmosphere, Sky, and Unified Fog folders. The preset system will capture your current manual settings as the starting point for the next preset transition.
