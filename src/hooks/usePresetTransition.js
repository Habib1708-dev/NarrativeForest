import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useControls } from "leva";

/**
 * Custom hook to smoothly transition between preset values
 * Handles the animation loop for transitioning Leva controls
 */
export function usePresetTransition(transitionRef) {
  // Interpolate between two colors (hex strings)
  const lerpColor = (colorA, colorB, t) => {
    const c1 = new THREE.Color(colorA);
    const c2 = new THREE.Color(colorB);
    return "#" + c1.lerp(c2, t).getHexString();
  };

  // Interpolate between two values
  const lerp = (a, b, t) => {
    return a + (b - a) * t;
  };

  // Interpolate between two arrays (e.g., sunPosition)
  const lerpArray = (arrA, arrB, t) => {
    return arrA.map((val, idx) => lerp(val, arrB[idx], t));
  };

  // Smooth easing function (ease-in-out cubic)
  const easeInOutCubic = (t) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Update transition on every frame
  useFrame(({ set }) => {
    const transition = transitionRef.current;
    if (!transition.isTransitioning) return;

    const currentTime = performance.now() / 1000;
    const elapsed = currentTime - transition.startTime;
    const rawProgress = Math.min(elapsed / transition.duration, 1.0);
    const progress = easeInOutCubic(rawProgress);

    const { startValues, targetValues, levaSet } = transition;
    const newValues = {};

    // Interpolate each property
    Object.keys(targetValues).forEach((key) => {
      const startVal = startValues[key];
      const targetVal = targetValues[key];

      if (startVal === undefined || targetVal === undefined) {
        // Property doesn't exist in start values, use target directly
        newValues[key] = targetVal;
        return;
      }

      // Handle different types
      if (typeof startVal === "string" && startVal.startsWith("#")) {
        // Color (hex string)
        newValues[key] = lerpColor(startVal, targetVal, progress);
      } else if (Array.isArray(startVal)) {
        // Array (e.g., sunPosition)
        newValues[key] = lerpArray(startVal, targetVal, progress);
      } else if (typeof startVal === "number") {
        // Number
        newValues[key] = lerp(startVal, targetVal, progress);
      } else {
        // Other types - just use target value
        newValues[key] = targetVal;
      }
    });

    // Apply the interpolated values using Leva's set function
    if (levaSet) {
      Object.keys(newValues).forEach((key) => {
        try {
          levaSet({ [key]: newValues[key] });
        } catch (e) {
          // Ignore errors for keys that don't exist in controls
        }
      });
    }

    // Check if transition is complete
    if (rawProgress >= 1.0) {
      transition.isTransitioning = false;
    }
  });
}
