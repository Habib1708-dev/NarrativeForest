import { useMemo } from "react";
import { useCameraStore } from "../state/useCameraStore";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const normalizeName = (value) => (value || "").trim().toLowerCase();

const getStopWindow = (waypoints, startName, endName) => {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return null;
  }

  const segmentCount = waypoints.length - 1;
  if (segmentCount <= 0) {
    return null;
  }

  const findIndex = (target) =>
    waypoints.findIndex((wp) => normalizeName(wp?.name) === target);

  const startIndex = findIndex(normalizeName(startName));
  const endIndex = findIndex(normalizeName(endName));

  if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) {
    return null;
  }

  const startT = startIndex / segmentCount;
  const endT = endIndex / segmentCount;

  if (!Number.isFinite(startT) || !Number.isFinite(endT)) {
    return null;
  }

  return startT < endT
    ? { start: startT, end: endT }
    : { start: endT, end: startT };
};

export default function StopCircleOverlay() {
  const t = useCameraStore((state) => state.t ?? 0);
  const waypoints = useCameraStore((state) => state.waypoints || []);

  // Helper to get t for a stop
  const getStopT = (name) => {
    if (!waypoints.length) return null;
    const idx = waypoints.findIndex((wp) => normalizeName(wp?.name) === name);
    if (idx < 0) return null;
    return idx / (waypoints.length - 1);
  };

  const t4 = getStopT("stop-4");
  const t5 = getStopT("stop-5");
  const t6 = getStopT("stop-6");
  const t8 = getStopT("stop-8");
  const t9 = getStopT("stop-9");
  const t10 = getStopT("stop-10");
  const t12 = getStopT("stop-12");
  const t13 = getStopT("stop-13");
  const t13b = getStopT("stop-13b");
  const t13bLeft = getStopT("stop-13b-left-1");
  const t14 = getStopT("stop-14"); // For fading out the new text

  if (t4 === null || t5 === null) {
    return null;
  }

  const EPS = 1e-4;
  if (t < t4 - EPS) {
    return null;
  }

  // --- Circle & Backdrop Logic ---
  // Fade in from stop-4 to stop-5
  const span45 = t5 - t4;
  const progress45 = clamp01((t - t4) / span45);

  let circleOpacity = progress45;
  let backdropOpacity = 0.8 * progress45;
  let glowStrength = 0.25 + 0.45 * progress45;

  // Size Logic (Scale)
  // Default scale 1.0. From stop-9 to stop-10, scale to 2.0.
  let circleScale = 1.0;
  if (t9 !== null && t10 !== null && t > t9) {
    const span910 = t10 - t9;
    const p910 = clamp01((t - t9) / span910);
    circleScale = 1.0 + 1.0 * p910; // 1.0 -> 2.0
  }

  // Collapse Logic (after stop-13b-left-1)
  // "Immediately but gradually" -> very short duration
  if (t13bLeft !== null && t > t13bLeft) {
    const collapseDuration = 0.015; // Fast transition
    const pCollapse = clamp01((t - t13bLeft) / collapseDuration);
    const collapseFactor = 1.0 - pCollapse;

    circleScale *= collapseFactor;
    circleOpacity *= collapseFactor;
    backdropOpacity *= collapseFactor;
    glowStrength *= collapseFactor;
  }

  // Halo Color Logic
  // Yellow up to stop-5, then transition to Orange by stop-6
  // Then Orange up to stop-9, then transition to Green by stop-10
  // Then Green up to stop-10, then transition to White by stop-13
  let haloColor = "255, 220, 100"; // Yellow

  if (t6 !== null && t > t5 && t <= t9) {
    // Transition Yellow -> Orange (5->6)
    const span56 = t6 - t5;
    const p56 = clamp01((t - t5) / span56);
    // Lerp from Yellow (255, 220, 100) to Orange (255, 140, 50)
    const r = Math.round(255 + (255 - 255) * p56);
    const g = Math.round(220 + (140 - 220) * p56);
    const b = Math.round(100 + (50 - 100) * p56);
    haloColor = `${r}, ${g}, ${b}`;
  } else if (t9 !== null && t10 !== null && t > t9 && t <= t10) {
    // Transition Orange -> Green (9->10)
    const span910 = t10 - t9;
    const p910 = clamp01((t - t9) / span910);
    // Lerp from Orange (255, 140, 50) to Green (100, 255, 100)
    const r = Math.round(255 + (100 - 255) * p910);
    const g = Math.round(140 + (255 - 140) * p910);
    const b = Math.round(50 + (100 - 50) * p910);
    haloColor = `${r}, ${g}, ${b}`;
  } else if (t10 !== null && t13 !== null && t > t10) {
    // Transition Green -> White (10->13)
    const span1013 = t13 - t10;
    const p1013 = clamp01((t - t10) / span1013);
    // Lerp from Green (100, 255, 100) to White (255, 255, 255)
    const r = Math.round(100 + (255 - 100) * p1013);
    const g = Math.round(255 + (255 - 255) * p1013);
    const b = Math.round(100 + (255 - 100) * p1013);
    haloColor = `${r}, ${g}, ${b}`;
  }

  // --- Text Logic ---
  // We have four text segments:
  // 1. "Hello, this is me Habib." (In: 4->5, Out: 5->6)
  // 2. "This is my cat Skye" (In: 5->6, Out: 8->9)
  // 3. "Nature is all around us" (In: 9->10, Out: just before 13)
  // 4. "But, we are connected through technology" (In: 13->13.5, Out: 14)

  const textSegments = [
    {
      text: "Hello, this is me Habib.",
      startIn: t4,
      endIn: t5,
      startOut: t5,
      endOut: t6,
    },
    {
      text: "This is my cat Skye",
      startIn: t5,
      endIn: t6,
      startOut: t8,
      endOut: t9,
      delayIn: 0.5,
    },
    {
      text: "Nature is all around us",
      startIn: t9,
      endIn: t12 || t10, // Complete processing by stop 12
      startOut: t13 ? t13 - 0.02 : t10 + 0.5, // Fade out just before stop 13
      endOut: t13 || t10 + 1.0,
      delayIn: 0.0,
      type: "carousel",
    },
    {
      text: "But, we are connected through technology",
      startIn: t13,
      // Carousel finishes (last word appears) at 80% of the way to 13b
      endIn: t13b
        ? t13 + (t13b - t13) * 0.8
        : t14
        ? t13 + (t14 - t13) * 0.3
        : t13 + 0.06,
      // Start fading out immediately after carousel finishes
      startOut: t13b ? t13 + (t13b - t13) * 0.8 : t14 || t13 + 0.2,
      // Completely faded out by 13b
      endOut: t13b || (t14 ? t14 + 0.1 : t13 + 0.3),
      delayIn: 0.0,
      type: "carousel",
    },
  ];

  // Find active segment or transitioning segment
  // We render all segments that have > 0 opacity
  // But to keep it simple, let's just map over them and render them absolutely on top of each other
  // (CSS grid handles the stacking)

  const renderText = (segment, index) => {
    const {
      text,
      startIn,
      endIn,
      startOut,
      endOut,
      delayIn = 0,
      type,
    } = segment;
    const words = text.split(" ");

    // Calculate global progress for In and Out phases
    const spanIn = endIn - startIn;
    const spanOut = endOut ? endOut - startOut : 0.1;

    // Determine if we are in the "In" phase, "Hold" phase, or "Out" phase
    let phase = "hidden";
    let localP = 0; // 0..1 progress within the phase

    if (t < startIn) phase = "hidden";
    else if (t <= endIn) {
      phase = "in";
      localP = clamp01((t - startIn) / spanIn);
    } else if (!endOut || t < startOut) {
      phase = "hold";
      localP = 1;
    } else if (t <= endOut) {
      phase = "out";
      localP = clamp01((t - startOut) / spanOut);
    } else {
      phase = "hidden"; // or "done"
    }

    if (phase === "hidden") return null;

    // Special Carousel Logic for "Nature is all around us"
    if (type === "carousel") {
      // Only render if we are in "in" phase or "hold" phase (showing last word)
      // If "out", we can just fade out the last word or hide it.

      // Map localP (0..1) to the sequence of words.
      // If phase is "hold" or "out", we show the last word (or handle out animation).

      let activeIndex = -1;
      let wordP = 0; // Progress for the active word (0..1)

      if (phase === "in") {
        const totalWords = words.length;
        // Divide 0..1 into slots
        const slotSize = 1 / totalWords;
        activeIndex = Math.floor(localP / slotSize);
        if (activeIndex >= totalWords) activeIndex = totalWords - 1;

        // Progress within the slot
        const slotStart = activeIndex * slotSize;
        wordP = (localP - slotStart) / slotSize;
      } else {
        // Hold/Out: Show last word
        activeIndex = words.length - 1;
        wordP = 0.5; // Stable
      }

      return (
        <div
          key={index}
          className="stop-overlay-text"
          style={{
            gridArea: "1/1",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            width: "max-content",
            // Inverse scale to counteract parent scaling
            // Use transform-origin left center to stay attached to the circle edge
            transformOrigin: "left center",
            // Note: We need to combine translateY(-50%) with scale.
            // Order matters: translate then scale? Or scale then translate?
            // If we use scale(0.5), the element shrinks.
            // Let's apply scale via a wrapper or just combine them.
            transform: `translateY(-50%) scale(${1 / circleScale})`,
          }}
        >
          {words.map((word, i) => {
            // Only animate the active word
            if (i !== activeIndex) return null;

            let opacity = 0;
            let translateY = 0;

            if (phase === "in") {
              // Slide In (0.0 - 0.2)
              if (wordP < 0.2) {
                const p = wordP / 0.2;
                opacity = p;
                translateY = -20 * (1 - p);
              }
              // Slide Out (0.8 - 1.0) -> UNLESS it's the very last word
              else if (wordP > 0.8 && i < words.length - 1) {
                const p = (wordP - 0.8) / 0.2;
                opacity = 1 - p;
                translateY = 20 * p;
              }
              // Hold
              else {
                opacity = 1;
                translateY = 0;
              }
            } else if (phase === "out") {
              // Fade out the last word
              opacity = 1 - localP;
              translateY = 20 * localP;
            } else {
              // Hold
              opacity = 1;
              translateY = 0;
            }

            return (
              <span
                key={i}
                style={{
                  opacity,
                  transform: `translateY(${translateY}px)`,
                  display: "inline-block",
                  // No margin needed since only one word shows at a time
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      );
    }

    // Standard Animation (Word by Word Stagger)
    return (
      <div
        key={index}
        className="stop-overlay-text"
        style={{
          gridArea: "1/1", // Stack them
          transform: "translateY(-50%)",
          pointerEvents: "none",
          width: "max-content", // Ensure width fits content
          // Inverse scale for standard text too, if it overlaps with scaling phase
          transformOrigin: "left center",
          transform: `translateY(-50%) scale(${1 / circleScale})`,
        }}
      >
        {words.map((word, i) => {
          let opacity = 0;
          let translateY = 0;

          if (phase === "in") {
            // Slide in from above (-150px)
            // Stagger: 0.2 to 0.8 (or adjusted by delayIn)
            // If delayIn is 0.5, we map 0.5..1.0 of the window to the animation
            const effectiveStart = 0.2 + delayIn * 0.5 + i * 0.1;
            const duration = 0.3;
            const p = clamp01((localP - effectiveStart) / duration);
            opacity = p;
            translateY = -150 * (1 - p);
          } else if (phase === "hold") {
            opacity = 1;
            translateY = 0;
          } else if (phase === "out") {
            // Slide down (+150px)
            const start = i * 0.08;
            const duration = 0.3;
            const p = clamp01((localP - start) / duration);
            opacity = 1 - p;
            translateY = 150 * p;
          }

          return (
            <span
              key={i}
              style={{
                opacity,
                transform: `translateY(${translateY}px)`,
                display: "inline-block",
                marginRight: "0.25em",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="stop-overlay-container"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {/* Wrapper for Circle + Text */}
      <div
        className="stop-circle-wrapper"
        style={{
          width: "clamp(180px, 45vw, 420px)",
          height: "clamp(180px, 45vw, 420px)",
          transform: `scale(${circleScale})`,
          // Removed transition to prevent fighting with frame-by-frame updates
        }}
      >
        {/* Backdrop with hole */}
        <div
          aria-hidden="true"
          style={{
            gridArea: "1/1",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            boxShadow: `0 0 0 200vmax rgba(30, 30, 30, ${backdropOpacity})`,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            gridArea: "1/1",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            border: "2px solid rgba(255, 255, 255, 0.9)",
            opacity: circleOpacity,
            // Removed transition
            boxShadow: `0 0 55px rgba(${haloColor}, ${glowStrength})`,
            backdropFilter: "blur(2px)",
            mixBlendMode: "screen",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            gridArea: "1/1",
            width: "140%", // Scaled up relative to wrapper
            height: "120%",
            borderRadius: "50%",
            opacity: circleOpacity * 0.55,
            filter: "blur(45px)",
            boxShadow: `0 0 120px rgba(${haloColor}, ${glowStrength})`,
            transform: "scaleX(1.1)",
            // Removed transition
            mixBlendMode: "screen",
          }}
        />

        {/* Text Container - Absolute positioned relative to wrapper */}
        <div
          style={{
            position: "absolute",
            left: "100%",
            top: "50%",
            marginLeft: "60px",
            display: "grid", // To stack multiple text segments
            placeItems: "center start", // Align left
          }}
          className="stop-overlay-text-container" // Add class for media query targeting
        >
          {textSegments.map(renderText)}
        </div>
      </div>
    </div>
  );
}
