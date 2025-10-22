// Atmospheric presets for the scene
export const PRESETS = {
  Default: {
    // Scene
    globalDarken: 0.0,

    // Atmosphere
    fogColor: "#585858",

    // Sky
    sunPosition: [5.0, -1.0, 30.0],
    rayleigh: 0.01,
    turbidity: 1.1,
    mieCoefficient: 0,
    mieDirectionalG: 0,
    skyDarken: 0.0,

    // Sky / Haze (from CustomSky - hazeColor)
    hazeColor: "#585858",

    // Sky / Color (from CustomSky)
    saturation: 1.0,
    tintStrength: 0.0,
    tintColor: "#ffffff",
    hueShift: 0,
  },

  "White Dawn": {
    globalDarken: 0.0,
    fogColor: "#4d4d4d",
    sunPosition: [5.0, -1.0, 30.0],
    rayleigh: 0.01,
    turbidity: 1.1,
    mieCoefficient: 0,
    mieDirectionalG: 0,
    skyDarken: 0.17,
    hazeColor: "#a6a6a6", // rgb(166, 166, 166)
  },

  Night: {
    globalDarken: 0.15,
    fogColor: "#4d4d4d",
    sunPosition: [5.0, -1.0, 30.0],
    rayleigh: 0.01,
    turbidity: 1.1,
    mieCoefficient: 0,
    mieDirectionalG: 0,
    skyDarken: 0.15,
    hazeColor: "#585858",
  },

  "Stormy Night": {
    globalDarken: 0.15,
    fogColor: "#4d4d4d",
    sunPosition: [5.0, -1.0, 30.0],
    rayleigh: 0.01,
    turbidity: 1.1,
    mieCoefficient: 0,
    mieDirectionalG: 0,
    skyDarken: 0.15,
    hazeColor: "#585858",
    lightningEnabled: true,
    flashPeakGain: 25.0,
  },

  Dawn: {
    globalDarken: 0.15,
    fogColor: "#4d4d4d",
    sunPosition: [5.0, 1.0, 30.0],
    rayleigh: 0.11,
    turbidity: 1.1,
    mieCoefficient: 0,
    mieDirectionalG: 0,
    skyDarken: 0.15,
    hazeColor: "#a2a2a2", // rgb(162, 162, 162)
    tintColor: "#475e85", // rgb(71, 94, 133)
    saturation: 1.91,
    tintStrength: 0.37,
    hueShift: 3,
  },

  "Purplish Evening": {
    globalDarken: 0.1,
    fogColor: "#4d4d4d",
    sunPosition: [5.0, 2.0, 40.0],
    rayleigh: 0.21,
    turbidity: 2.62,
    mieCoefficient: 0.037,
    mieDirectionalG: 0,
    skyDarken: 0.0,
    hazeColor: "#585858", // rgb(88, 88, 88)
    saturation: 1.59,
    tintStrength: 0.43,
    tintColor: "#facfcf", // rgb(250, 207, 207)
  },

  Sunset: {
    globalDarken: 0.03,
    fogColor: "#161616",
    sunPosition: [5.0, 3.0, 50.0],
    rayleigh: 0.28,
    turbidity: 2.97,
    mieCoefficient: 0.1,
    mieDirectionalG: 0.81,
    skyDarken: 0.93,
    hazeColor: "#ffffff", // Full white
    saturation: 1.86,
  },

  "Summer Day": {
    globalDarken: 0.0,
    fogColor: "#4d4d4d",
    sunPosition: [5.0, 10.0, 50.0],
    rayleigh: 4.0,
    turbidity: 1.1,
    mieCoefficient: 0.014,
    mieDirectionalG: 0,
    skyDarken: 0.86,
    hazeColor: "#ffffff", // Full white
    saturation: 2.5,
  },

  "Polar Night": {
    globalDarken: 0.0,
    fogColor: "#4d4d4d",
    sunPosition: [700.0, 60.0, 1000.0],
    rayleigh: 0.01,
    turbidity: 1.1,
    mieCoefficient: 0,
    mieDirectionalG: 0,
    skyDarken: 0.0,
    hazeColor: "#585858",
    saturation: 1.54,
    tintStrength: 0.0,
    tintColor: "#ffffff",
    hueShift: -12,
  },

  "Dawn In Lofoten": {
    globalDarken: 0.0,
    fogColor: "#4d4d4d",
    sunPosition: [-700.0, 60.0, 1600.0],
    rayleigh: 0.01,
    turbidity: 1.1,
    mieCoefficient: 0,
    mieDirectionalG: 0,
    skyDarken: 0.0,
    hazeColor: "#756471",
    saturation: 1.54,
    tintStrength: 0.0,
    tintColor: "#ffffff",
    hueShift: -12,
  },
};

// Get list of preset names
export const PRESET_NAMES = Object.keys(PRESETS);
