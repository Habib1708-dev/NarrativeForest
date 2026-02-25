import { useMemo, useEffect, useState } from "react";
import { useCameraStore } from "../../state/useCameraStore";
import { useSplineCameraStore } from "../../state/useSplineCameraStore";
import { USE_SPLINE_CAMERA } from "../../config";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothStep = (x) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const normalizeName = (value) => (value || "").trim().toLowerCase();
const safeSpan = (a, b) => Math.max(1e-6, (b ?? 0) - (a ?? 0));
const NAVBAR_SAFE_GAP_PX = 10;

// CC0 paw icon (Wikimedia Commons)
const PAW_ICON_URL =
  "https://upload.wikimedia.org/wikipedia/commons/5/51/Paw_icon.svg";

export default function StopCircleOverlay() {
  const cameraT = useCameraStore((state) => state.t ?? 0);
  const cameraWaypoints = useCameraStore((state) => state.waypoints || []);
  const cameraModeRaw = useCameraStore((state) => state.mode);
  const cameraSetEnabled = useCameraStore((state) => state.setEnabled);
  const splineT = useSplineCameraStore((state) => state.t ?? 0);
  const splineWaypoints = useSplineCameraStore((state) => state.waypoints || []);
  const splineModeRaw = useSplineCameraStore((state) => state.mode);

  const t = USE_SPLINE_CAMERA ? splineT : cameraT;
  const waypoints = USE_SPLINE_CAMERA ? splineWaypoints : cameraWaypoints;
  const cameraMode = USE_SPLINE_CAMERA ? splineModeRaw : cameraModeRaw;
  const setEnabled = USE_SPLINE_CAMERA
    ? (v) => useSplineCameraStore.getState().setEnabled(v)
    : cameraSetEnabled;

  const [isMobile, setIsMobile] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 0
  );
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);
  const [isWelcomeFadingOut, setIsWelcomeFadingOut] = useState(false);
  const [isBackgroundFadingOut, setIsBackgroundFadingOut] = useState(false);
  const [welcomeOverlayFinished, setWelcomeOverlayFinished] = useState(true);
  const [habibTextVisible, setHabibTextVisible] = useState(false);
  const [hasEnteredFreeFly, setHasEnteredFreeFly] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [shouldUnmount, setShouldUnmount] = useState(false);
  useEffect(() => {
    const updateViewport = () => {
      setIsMobile(window.innerWidth <= 900);
      setViewportHeight(window.innerHeight);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  // Measure navbar height so we can keep circles out of its area without shifting their position.
  const [navbarOffsetTop, setNavbarOffsetTop] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const nav = document.querySelector(".navbar");
    if (!nav) {
      setNavbarOffsetTop(0);
      return undefined;
    }

    const measure = () => {
      const rect = nav.getBoundingClientRect();
      const h = Number.isFinite(rect.height) ? rect.height : 0;
      setNavbarOffsetTop(Math.max(0, Math.ceil(h)));
    };

    measure();

    const ro =
      typeof window.ResizeObserver !== "undefined"
        ? new window.ResizeObserver(measure)
        : null;
    if (ro) ro.observe(nav);
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      if (ro) ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleLoadingFinished = () => {
      setShowWelcomeOverlay(true);
      setIsWelcomeFadingOut(false);
      setIsBackgroundFadingOut(false);
      setWelcomeOverlayFinished(false);
    };

    window.addEventListener("loading-screen-finished", handleLoadingFinished);

    // Check after a small delay to let LoadingScreen reset the flag first
    // This prevents race conditions on page refresh
    const checkTimeout = setTimeout(() => {
      if (typeof window !== "undefined" && window.__loadingScreenFinished) {
        handleLoadingFinished();
      }
    }, 100);

    return () => {
      clearTimeout(checkTimeout);
      window.removeEventListener(
        "loading-screen-finished",
        handleLoadingFinished
      );
    };
  }, []);

  // If user skips straight to freeflight via navbar, fade out everything and unmount
  useEffect(() => {
    if (cameraMode !== "freeFly") return;

    setHasEnteredFreeFly(true);
    setHabibTextVisible(false);
    setIsFadingOut(true);

    // Fade out welcome overlay if it's showing
    if (showWelcomeOverlay && !isWelcomeFadingOut) {
      setIsWelcomeFadingOut(true);
    }

    // Unmount the entire component after fade-out completes
    const unmountTimeout = setTimeout(() => {
      setShouldUnmount(true);
    }, 900); // Wait for both content and background fade-outs to complete (400ms + 500ms)

    return () => clearTimeout(unmountTimeout);
  }, [cameraMode, showWelcomeOverlay, isWelcomeFadingOut]);

  // First phase: content fades out, then trigger background fade
  useEffect(() => {
    if (!isWelcomeFadingOut) return undefined;
    const timeout = setTimeout(() => {
      setIsBackgroundFadingOut(true);
    }, 400); // Content fade duration
    return () => clearTimeout(timeout);
  }, [isWelcomeFadingOut]);

  // Second phase: background fades out, then finish
  useEffect(() => {
    if (!isBackgroundFadingOut) return undefined;
    const timeout = setTimeout(() => {
      setShowWelcomeOverlay(false);
      setWelcomeOverlayFinished(true);
    }, 500); // Background fade duration
    return () => clearTimeout(timeout);
  }, [isBackgroundFadingOut]);

  // Fade in Habib text after welcome overlay has completely faded
  useEffect(() => {
    if (!welcomeOverlayFinished || hasEnteredFreeFly) {
      setHabibTextVisible(false);
      return undefined;
    }
    // Small delay to ensure smooth transition after welcome overlay is gone
    const timeout = setTimeout(() => {
      setHabibTextVisible(true);
    }, 50);
    return () => clearTimeout(timeout);
  }, [welcomeOverlayFinished, hasEnteredFreeFly]);

  // Memoized lookup: name -> normalized t (0..1)
  const stopT = useMemo(() => {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return () => null;
    }

    const segmentCount = waypoints.length - 1;
    const map = new Map();

    waypoints.forEach((wp, i) => {
      const key = normalizeName(wp?.name);
      if (!key) return;
      map.set(key, i / segmentCount);
    });

    return (name) => map.get(normalizeName(name)) ?? null;
  }, [waypoints]);

  const t4 = stopT("stop-4");
  const t5 = stopT("stop-5");
  const t6 = stopT("stop-6");
  // Spline sequence: man1 → man2 (Habib), man2 → Focus on the cat (cat text & paws)
  const tFocusMan1 = stopT("Focus on the man");
  const tFocusMan2 = stopT("Focus on the man 2");
  const tFocusCat = stopT("Focus on the cat");
  const tLeavingCat = stopT("Leaving the cat");
  const t8 = stopT("stop-8");
  const t9 = stopT("stop-9");
  const t10 = stopT("stop-10");
  const t12 = stopT("stop-12");
  const t13 = stopT("stop-13");
  const t13b = stopT("stop-13b");
  const t13bLeft = stopT("stop-13b-left-1");
  const t14 = stopT("stop-14");
  const t15Spin = stopT("stop-15-spin-360");
  const tRing4b = stopT("ring-4b");
  const tRingClose = stopT("ring-close");
  const tSeqArch1 = stopT("seq-arch-1");
  const tSeqArch2 = stopT("seq-arch-2");
  const tSeqArch3 = stopT("seq-arch-3");
  const tSeqArch4 = stopT("seq-arch-4");

  // ✅ Paw trail hook MUST be called every render (before any return)
  const pawTrail = useMemo(() => {
    const count = isMobile ? 8 : 11;
    const insetPct = 10;
    const span = 100 - insetPct * 2;
    const step = count > 1 ? span / (count - 1) : 0;

    // ✅ Double the spacing for opposite left/right along diagonal
    const basePerpPx = isMobile ? 5 : 7;
    const perpPx = basePerpPx * 3;

    return {
      items: Array.from({ length: count }, (_, i) => {
        const xPct = insetPct + i * step;
        const yPct = insetPct + (count - 1 - i) * step;

        const sign = i % 2 === 0 ? -1 : 1;
        const dx = sign * perpPx;
        const dy = sign * perpPx;

        const rot = 45 + sign * 8;

        return { i, xPct, yPct, dx, dy, rot };
      }),
    };
  }, [isMobile]);

  // --- Text segment config (hooks: must run before any return) ---
  // Spline: Habib = man1→man2, Cat = man2→cat. Legacy: unchanged.
  const habibSegment = useMemo(() => {
    if (USE_SPLINE_CAMERA && tFocusMan1 != null && tFocusMan2 != null) {
      const span = safeSpan(tFocusMan1, tFocusMan2);
      return [
        {
          text: "Hello, this is me Habib.",
          startIn: tFocusMan1,
          endIn: tFocusMan1 + span * 0.65,
          startOut: tFocusMan1 + span * 0.65,
          endOut: tFocusMan2,
        },
      ];
    }
    if (t4 != null && t5 != null && t6 != null) {
      return [
        {
          text: "Hello, this is me Habib.",
          startIn: t4,
          endIn: t5,
          startOut: t5,
          endOut: t6,
        },
      ];
    }
    return [];
  }, [
    USE_SPLINE_CAMERA,
    tFocusMan1,
    tFocusMan2,
    t4,
    t5,
    t6,
  ]);

  const catSegmentSpline = useMemo(() => {
    if (
      !USE_SPLINE_CAMERA ||
      tFocusMan2 == null ||
      tFocusCat == null
    )
      return [];
    const span = safeSpan(tFocusMan2, tFocusCat);
    return [
      {
        text: "This is my cat Skye",
        startIn: tFocusMan2,
        endIn: tFocusMan2 + span * 0.65,
        startOut: tFocusMan2 + span * 0.65,
        endOut: tFocusCat,
        delayIn: 0.5,
      },
    ];
  }, [USE_SPLINE_CAMERA, tFocusMan2, tFocusCat]);

  const textSegments = useMemo(() => {
    if (USE_SPLINE_CAMERA) return [...habibSegment, ...catSegmentSpline];
    return [
      ...habibSegment,
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
        endIn: t12 || t10,
        startOut: t13 ? t13 - 0.02 : (t10 ?? 0) + 0.5,
        endOut: t13 || (t10 ?? 0) + 1.0,
        delayIn: 0.0,
        type: "carousel",
      },
      {
        text: "But, we are connected through technology",
        startIn: t13,
        endIn: t13b
          ? t13 + (t13b - t13) * 0.8
          : t14
            ? t13 + (t14 - t13) * 0.8
            : t13 + 0.06,
        startOut: t13b ? t13 + (t13b - t13) * 0.8 : t14 ? t14 - 0.02 : t13 + 0.2,
        endOut: t13b || t14 || t13 + 0.3,
        delayIn: 0.0,
        type: "carousel",
      },
    ];
  }, [
    USE_SPLINE_CAMERA,
    habibSegment,
    catSegmentSpline,
    t5,
    t6,
    t8,
    t9,
    t10,
    t12,
    t13,
    t13b,
    t14,
  ]);

  // ✅ Now it’s safe to early-return (after hooks)
  const EPS = 1e-4;
  const habibSegmentStart = USE_SPLINE_CAMERA ? tFocusMan1 : t4;
  const habibSegmentEnd = USE_SPLINE_CAMERA ? tFocusMan2 : t5;
  const shouldRender =
    (habibSegmentStart != null &&
      typeof habibSegmentStart === "number" &&
      t >= habibSegmentStart - EPS) ||
    (t4 !== null && t5 !== null && typeof t4 === "number" && t >= t4 - EPS);

  // Unmount completely if fade-out is complete
  if (shouldUnmount) return null;

  if (!shouldRender && !showWelcomeOverlay) return null;

  // --- Circle & Backdrop Logic ---
  // Spline: grow circle over man1→man2, then keep full through man2→cat
  const progress45 =
    habibSegmentStart != null && habibSegmentEnd != null
      ? t <= habibSegmentEnd
        ? clamp01((t - habibSegmentStart) / safeSpan(habibSegmentStart, habibSegmentEnd))
        : 1
      : 0;

  let circleOpacity = progress45;
  let backdropOpacity = 0.8 * progress45;
  let glowStrength = 0.25 + 0.45 * progress45;

  let circleScale = isMobile ? 2.0 : 1.0;
  if (t9 !== null && t10 !== null && t > t9) {
    const p910 = clamp01((t - t9) / safeSpan(t9, t10));
    if (!isMobile) circleScale = 1.0 + 1.0 * p910;
    else circleScale = 2.0;
  }

  if (t13bLeft !== null && t > t13bLeft) {
    const collapseDuration = 0.015;
    const pCollapse = clamp01(
      (t - t13bLeft) / safeSpan(t13bLeft, t13bLeft + collapseDuration)
    );
    const collapseFactor = 1.0 - pCollapse;

    circleScale *= collapseFactor;
    circleOpacity *= collapseFactor;
    backdropOpacity *= collapseFactor;
    glowStrength *= collapseFactor;
  }

  // --- Layout-safe circle sizing ---
  // Keep the circle vertically centered (equal top/bottom margins), but cap its size so it never
  // extends into the navbar area.
  const BASE_CIRCLE_MAX_PX = 420;
  const navbarSafeTopPx = navbarOffsetTop + NAVBAR_SAFE_GAP_PX;
  const maxCircleDiameterPx = Math.max(
    0,
    (viewportHeight || 0) - 2 * navbarSafeTopPx
  );
  const maxAllowedScale =
    maxCircleDiameterPx > 0 ? maxCircleDiameterPx / BASE_CIRCLE_MAX_PX : 1;
  const layoutCircleScale = !isMobile
    ? Math.max(Math.min(circleScale, maxAllowedScale), 0)
    : 1;
  const circleScaleForLayout = Math.max(
    0,
    Math.min(circleScale, maxAllowedScale)
  );

  // Halo Color Logic — smooth transition to orange on cat segment
  const HALO_DEFAULT = [255, 220, 100];
  const HALO_ORANGE = [255, 140, 0];
  const CAT_TRANSITION_FRAC = 0.25; // use first/last 25% of segment for blend in/out
  let haloColor = "255, 220, 100";

  const catStart =
    USE_SPLINE_CAMERA && tFocusMan2 != null ? tFocusMan2 : t5;
  const catEnd =
    USE_SPLINE_CAMERA && tFocusCat != null ? tFocusCat : t6;
  const hasCatSegment =
    (USE_SPLINE_CAMERA && tFocusMan2 != null && tFocusCat != null) ||
    (t5 != null && t6 != null);

  if (hasCatSegment && catStart != null && catEnd != null && t >= catStart && t <= catEnd) {
    const span = safeSpan(catStart, catEnd);
    const blendInEnd = catStart + span * CAT_TRANSITION_FRAC;
    const blendOutStart = catEnd - span * CAT_TRANSITION_FRAC;
    let p = 1;
    if (t < blendInEnd) {
      p = smoothStep((t - catStart) / safeSpan(catStart, blendInEnd));
    } else if (t > blendOutStart) {
      p = smoothStep((catEnd - t) / safeSpan(blendOutStart, catEnd));
    }
    const r = Math.round(HALO_DEFAULT[0] + (HALO_ORANGE[0] - HALO_DEFAULT[0]) * p);
    const g = Math.round(HALO_DEFAULT[1] + (HALO_ORANGE[1] - HALO_DEFAULT[1]) * p);
    const b = Math.round(HALO_DEFAULT[2] + (HALO_ORANGE[2] - HALO_DEFAULT[2]) * p);
    haloColor = `${r}, ${g}, ${b}`;
  } else if (t6 !== null && t5 !== null && t9 !== null && t > t5 && t <= t9) {
    const p56 = clamp01((t - t5) / safeSpan(t5, t6));
    const r = Math.round(255 + (255 - 255) * p56);
    const g = Math.round(220 + (140 - 220) * p56);
    const b = Math.round(100 + (50 - 100) * p56);
    haloColor = `${r}, ${g}, ${b}`;
  } else if (t9 !== null && t10 !== null && t > t9 && t <= t10) {
    const p910 = clamp01((t - t9) / safeSpan(t9, t10));
    const r = Math.round(255 + (100 - 255) * p910);
    const g = Math.round(140 + (255 - 140) * p910);
    const b = Math.round(50 + (100 - 50) * p910);
    haloColor = `${r}, ${g}, ${b}`;
  } else if (t10 !== null && t13 !== null && t > t10) {
    const p1013 = clamp01((t - t10) / safeSpan(t10, t13));
    const r = Math.round(100 + (255 - 100) * p1013);
    const g = Math.round(255 + (255 - 255) * p1013);
    const b = Math.round(100 + (255 - 100) * p1013);
    haloColor = `${r}, ${g}, ${b}`;
  }

  // ✅ Paw trail: runs in "This is my cat Skye" segment
  //    - legacy: t5→t6
  //    - spline: from "Focus on the man 2" → "Focus on the cat"
  // Start paws 15% into the segment (after cat text starts appearing)
  const PAW_DELAY = 0.15;
  let pawAnimProgress = 0;
  let pawLayerActive = false;
  if (USE_SPLINE_CAMERA && tFocusMan2 != null && tFocusCat != null) {
    const pawStartT = tFocusMan2 + safeSpan(tFocusMan2, tFocusCat) * PAW_DELAY;
    if (t >= pawStartT && t <= tFocusCat) {
      pawAnimProgress = clamp01((t - pawStartT) / safeSpan(pawStartT, tFocusCat));
      pawLayerActive = true;
    }
  } else if (
    t5 !== null &&
    t6 !== null &&
    Number.isFinite(t5) &&
    Number.isFinite(t6)
  ) {
    const pawStartT = t5 + safeSpan(t5, t6) * PAW_DELAY;
    if (t >= pawStartT && t <= t6) {
      pawAnimProgress = clamp01((t - pawStartT) / safeSpan(pawStartT, t6));
      pawLayerActive = true;
    }
  }

  // Calculate individual paw opacities for sequential animation with fading tail
  const getPawOpacity = (pawIndex, totalPaws) => {
    if (!pawLayerActive) return 0;

    const tailLength = 0.35; // How long each paw stays visible (as fraction of animation)
    const pawStart = pawIndex / totalPaws; // When this paw starts appearing
    const pawPeak = pawStart + 0.08; // Quick fade-in
    const pawEnd = pawStart + tailLength; // When paw fully fades out

    if (pawAnimProgress < pawStart) return 0;
    if (pawAnimProgress < pawPeak) {
      // Fade in
      return clamp01((pawAnimProgress - pawStart) / (pawPeak - pawStart));
    }
    if (pawAnimProgress < pawEnd) {
      // Fade out (tail effect)
      return clamp01(1 - (pawAnimProgress - pawPeak) / (pawEnd - pawPeak));
    }
    return 0;
  };

  const pawLayerOpacity = clamp01(circleOpacity);

  // x3 size (kept)
  const pawSize = isMobile ? 48 : 60;

  // --- Text Logic ---
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

    if (!Number.isFinite(startIn) || !Number.isFinite(endIn)) return null;

    const words = text.split(" ");
    const spanIn = safeSpan(startIn, endIn);
    const spanOut = endOut ? safeSpan(startOut, endOut) : 0.1;

    let phase = "hidden";
    let localP = 0;

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
    } else phase = "hidden";

    if (phase === "hidden") return null;

    if (type === "carousel") {
      let activeIndex = -1;
      let wordP = 0;

      if (phase === "in") {
        const totalWords = words.length;
        const slotSize = 1 / totalWords;
        activeIndex = Math.floor(localP / slotSize);
        if (activeIndex >= totalWords) activeIndex = totalWords - 1;

        const slotStart = activeIndex * slotSize;
        wordP = (localP - slotStart) / slotSize;
      } else {
        activeIndex = words.length - 1;
        wordP = 0.5;
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
            transformOrigin: "left center",
          }}
        >
          {words.map((word, i) => {
            if (i !== activeIndex) return null;

            let opacity = 0;
            let translateY = 0;

            if (phase === "in") {
              if (wordP < 0.2) {
                const p = wordP / 0.2;
                opacity = p;
                translateY = -20 * (1 - p);
              } else if (wordP > 0.8 && i < words.length - 1) {
                const p = (wordP - 0.8) / 0.2;
                opacity = 1 - p;
                translateY = 20 * p;
              } else {
                opacity = 1;
                translateY = 0;
              }
            } else if (phase === "out") {
              opacity = 1 - localP;
              translateY = 20 * localP;
            } else {
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
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      );
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
          transformOrigin: "left center",
        }}
      >
        {words.map((word, i) => {
          let opacity = 0;
          let translateY = 0;

          if (phase === "in") {
            const effectiveStart = 0.2 + delayIn * 0.5 + i * 0.1;
            const duration = 0.3;
            const p = clamp01((localP - effectiveStart) / duration);
            opacity = p;
            translateY = -150 * (1 - p);
          } else if (phase === "hold") {
            opacity = 1;
            translateY = 0;
          } else if (phase === "out") {
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

  const renderTopCenterText = () => {
    if (t14 === null || t15Spin === null || tRing4b === null) return null;

    const text = "We craft the extraordinary with our creativity";
    const words = text.split(" ");

    const startIn = t14;
    const endIn = t15Spin;
    const startOut = t15Spin;
    const endOut = tRing4b;

    let phase = "hidden";
    let localP = 0;

    if (t < startIn) phase = "hidden";
    else if (t <= endIn) {
      phase = "in";
      localP = clamp01((t - startIn) / safeSpan(startIn, endIn));
    } else if (t <= endOut) {
      phase = "out";
      localP = clamp01((t - startOut) / safeSpan(startOut, endOut));
    } else phase = "hidden";

    if (phase === "hidden") return null;

    return (
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "0.3em",
          pointerEvents: "none",
          zIndex: 60,
          fontFamily: "system-ui, Avenir, Helvetica, Arial, sans-serif",
          fontSize: "1.5rem",
          color: "white",
          textShadow: "0 2px 4px rgba(0,0,0,0.5)",
          whiteSpace: "normal",
          width: "90%",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {words.map((word, i) => {
          const wordCount = words.length;
          const step = 1 / (wordCount + 2);
          const wordStart = i * step;
          const wordEnd = wordStart + 3 * step;

          let wordProgress = 0;
          if (localP >= wordStart) {
            wordProgress = clamp01(
              (localP - wordStart) / safeSpan(wordStart, wordEnd)
            );
          }

          let opacity = 0;
          let translateY = 0;

          if (phase === "in") {
            opacity = wordProgress;
            translateY = 10 * (1 - wordProgress);
          } else {
            opacity = 1 - wordProgress;
            translateY = -10 * wordProgress;
          }

          return (
            <span
              key={i}
              style={{
                opacity,
                transform: `translateY(${translateY}px)`,
                display: "inline-block",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  const renderArchTexts = () => {
    if (
      tSeqArch1 === null ||
      tSeqArch2 === null ||
      tSeqArch3 === null ||
      tSeqArch4 === null
    ) {
      return null;
    }

    const segments = [
      {
        lines: ["We make", "creative 3D & full-stack websites"],
        start: tSeqArch1,
        end: tSeqArch2,
      },
      {
        lines: ["We Develop", "AI models & softwares"],
        start: tSeqArch3,
        end: tSeqArch4,
      },
    ];

    const activeSegment = segments.find((s) => t >= s.start && t <= s.end);
    if (!activeSegment) return null;

    const { lines, start, end } = activeSegment;
    const localP = clamp01((t - start) / safeSpan(start, end));

    const topPos = 10 + localP * 80;

    let opacity = 1;
    if (localP < 0.25) opacity = localP / 0.25;
    else if (localP > 0.75) opacity = 1 - (localP - 0.75) / 0.25;

    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: `${topPos}%`,
          transform: "translate(-50%, -50%)",
          width: "90%",
          maxWidth: "1200px",
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 60,
          fontFamily: "system-ui, Avenir, Helvetica, Arial, sans-serif",
          fontOpticalSizing: "auto",
          fontSize: "clamp(2rem, 5vw, 4.5rem)",
          fontWeight: "300",
          letterSpacing: "0.02em",
          lineHeight: "1.1",
          color: "#ffffff",
          textShadow: "0 2px 12px rgba(0,0,0,0.5)",
          whiteSpace: "normal",
          opacity,
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="stop-overlay-container"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        top: 0,
        pointerEvents: "none",
        zIndex: 50,
        opacity: isFadingOut ? 0 : 1,
        transition: "opacity 800ms ease-out",
      }}
    >
      {showWelcomeOverlay && (
        <div
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setMousePos({ x, y });
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? "1.5rem" : "2.5rem",
            pointerEvents: isWelcomeFadingOut ? "none" : "auto",
            opacity: isBackgroundFadingOut ? 0 : 1,
            transition: "opacity 450ms ease",
            background: `
              radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, rgba(80, 160, 255, 0.25), rgba(100, 180, 255, 0.1) 25%, transparent 50%),
              radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 40%),
              radial-gradient(circle at 80% 30%, rgba(120,190,255,0.12), transparent 45%),
              rgba(8, 12, 18, 0.65)
            `,
            backdropFilter: "blur(14px) saturate(140%)",
            WebkitBackdropFilter: "blur(14px) saturate(140%)",
          }}
        >
          <div
            style={{
              maxWidth: "720px",
              width: "min(90vw, 720px)",
              padding: isMobile ? "1.2rem" : "1.6rem",
              color: "#f5f7fb",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: isMobile ? "1rem" : "1.5rem",
              opacity: isWelcomeFadingOut ? 0 : 1,
              transition: "opacity 350ms ease",
            }}
          >
            <div
              style={{
                fontFamily: "system-ui, Avenir, Helvetica, Arial, sans-serif",
                fontSize: isMobile
                  ? "clamp(1.75rem, 6vw, 2.6rem)"
                  : "clamp(2rem, 4vw, 3rem)",
                fontWeight: 600,
                letterSpacing: "0.02em",
                lineHeight: 1.15,
                textShadow: "0 8px 28px rgba(0,0,0,0.45)",
              }}
            >
              Welcome To The Narrative Forest
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (!showWelcomeOverlay) return;
                  setIsWelcomeFadingOut(true);
                  // Enable scrolling when Explore button is clicked
                  setEnabled(true);
                  // Dispatch event to signal that Explore button was clicked
                  window.__exploreButtonClicked = true;
                  window.dispatchEvent(new Event("explore-button-clicked"));
                }}
                style={{
                  border: "1px solid rgba(255,255,255,0.35)",
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))",
                  color: "#ffffff",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "0.65rem 1.6rem",
                  borderRadius: "999px",
                  cursor: "pointer",
                  boxShadow:
                    "0 12px 28px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.65)",
                  transition:
                    "transform 200ms ease, box-shadow 200ms ease, background 200ms ease",
                  fontSize: isMobile ? "1rem" : "1.05rem",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 16px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.85)";
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, rgba(255,255,255,0.28), rgba(255,255,255,0.12))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 12px 28px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.65)";
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))";
                }}
              >
                Explore
              </button>
            </div>
          </div>
        </div>
      )}

      {shouldRender && (
        <>
          {renderTopCenterText()}
          {renderArchTexts()}

          {/* Paw trail overlay (bottom-right quarter) - sequential with fading tail */}
          {pawLayerActive && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: "50%",
                height: "50%",
                pointerEvents: "none",
                zIndex: 55,
                opacity: pawLayerOpacity,
              }}
            >
              {pawTrail.items.map((p) => {
                const individualOpacity = getPawOpacity(
                  p.i,
                  pawTrail.items.length
                );
                if (individualOpacity <= 0) return null;

                return (
                  <div
                    key={p.i}
                    style={{
                      position: "absolute",
                      left: `${p.xPct}%`,
                      top: `${p.yPct}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <img
                      src={PAW_ICON_URL}
                      alt=""
                      draggable={false}
                      style={{
                        width: pawSize,
                        height: pawSize,
                        display: "block",
                        opacity: individualOpacity,
                        transform: `translate(${p.dx}px, ${p.dy}px) rotate(${p.rot}deg)`,
                        transformOrigin: "center",
                        // white paws
                        filter:
                          "invert(1) brightness(2) drop-shadow(0 2px 8px rgba(0,0,0,0.35))",
                        userSelect: "none",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Wrapper for Circle */}
          <div
            className="stop-circle-wrapper"
            style={{
              width: "clamp(180px, 45vw, 420px)",
              height: "clamp(180px, 45vw, 420px)",
              transform: `scale(${circleScaleForLayout})`,
            }}
          >
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
                boxShadow: `0 0 55px rgba(${haloColor}, ${glowStrength})`,
                backdropFilter: "blur(2px)",
                mixBlendMode: "screen",
              }}
            />
            <div
              aria-hidden="true"
              style={{
                gridArea: "1/1",
                width: "140%",
                height: "120%",
                borderRadius: "50%",
                opacity: circleOpacity * 0.55,
                filter: "blur(45px)",
                boxShadow: `0 0 120px rgba(${haloColor}, ${glowStrength})`,
                transform: "scaleX(1.1)",
                mixBlendMode: "screen",
              }}
            />
          </div>

          {/* Text Container */}
          <div
            style={{
              position: "absolute",
              opacity: habibTextVisible ? 1 : 0,
              transition: "opacity 600ms ease",
              ...(isMobile
                ? {
                  left: "50%",
                  top: `calc(75% + clamp(180px, 45vw, 420px) * ${circleScaleForLayout * 0.25
                    })`,
                  transform: "translate(-50%, -50%)",
                  width: "80%",
                  textAlign: "center",
                  display: "grid",
                  placeItems: "center",
                }
                : {
                  left: `calc(50% + clamp(180px, 45vw, 420px) * 0.5 * ${layoutCircleScale} + 60px)`,
                  top: "50%",
                  transform: "translateY(-50%)",
                  marginLeft: "0",
                  display: "grid",
                  placeItems: "center start",
                }),
            }}
            className="stop-overlay-text-container"
          >
            {welcomeOverlayFinished && textSegments.map(renderText)}
          </div>
        </>
      )}
    </div>
  );
}
