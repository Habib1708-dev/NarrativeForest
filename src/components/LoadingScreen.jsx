import { useProgress } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";

const STABILIZE_DURATION = 1000;
const FADE_DURATION = 1200;
const HERO_FADE_DURATION = 1200;

export default function LoadingScreen() {
  const { active, progress } = useProgress();
  const [hasStarted, setHasStarted] = useState(false);
  const [isForestReady, setIsForestReady] = useState(false);
  const [isSceneSettled, setIsSceneSettled] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);
  const [isIntroVisible, setIsIntroVisible] = useState(false);
  const [isIntroFading, setIsIntroFading] = useState(false);
  const [hideExploreChip, setHideExploreChip] = useState(false);
  const [showStickyTitle, setShowStickyTitle] = useState(false);
  const [stickyEvaporate, setStickyEvaporate] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const overlayRef = useRef(null);
  const fluidRef = useRef(null);
  const pointerTargetRef = useRef({ x: 50, y: 50 });
  const fluidPositionRef = useRef({ x: 50, y: 50 });
  const hueRef = useRef(200);
  const hueTargetRef = useRef(200);
  const animationFrameRef = useRef(null);
  const previousOverflowRef = useRef(null);
  const safeProgress = useMemo(
    () => Math.min(100, Math.max(0, progress || 0)),
    [progress]
  );
  const TITLE_TEXT = "Habib Khalaf";
  const SUBTITLE_TEXT = "AI & Full Stack 3D Web Developer";
  const EVAP_CHAR_DELAY = 28; // ms per char
  const EVAP_DURATION = 520; // ms animation per char
  const isHeroTitleVisible = isIntroVisible || showStickyTitle;

  useEffect(() => {
    const handleForestReady = () => setIsForestReady(true);
    window.addEventListener("forest-ready", handleForestReady);
    return () => window.removeEventListener("forest-ready", handleForestReady);
  }, []);

  useEffect(() => {
    if (active && !hasStarted) {
      setHasStarted(true);
    }
  }, [active, hasStarted]);

  useEffect(() => {
    if (!hasStarted) {
      return undefined;
    }

    let stabilizeTimeout;

    if (!active && isForestReady) {
      // Give the scene a short moment to render everything after loading
      stabilizeTimeout = setTimeout(() => {
        setIsSceneSettled(true);
      }, STABILIZE_DURATION);
    } else {
      setIsSceneSettled(false);
      setIsFadingOut(false);
      setIsRemoved(false);
    }

    return () => {
      if (stabilizeTimeout) {
        clearTimeout(stabilizeTimeout);
      }
    };
  }, [active, hasStarted, isForestReady]);

  useEffect(() => {
    if (!isSceneSettled) {
      return undefined;
    }

    setIsIntroVisible(true);
    setIsIntroFading(false);
    setIsFadingOut(true);
    const fadeTimeout = setTimeout(() => setIsRemoved(true), FADE_DURATION);

    return () => clearTimeout(fadeTimeout);
  }, [isSceneSettled]);

  useEffect(() => {
    if (!isIntroFading) {
      return undefined;
    }

    const hideTimeout = setTimeout(() => {
      setIsIntroVisible(false);
      setShowStickyTitle(true);
      setShowScrollHint(true);
    }, HERO_FADE_DURATION);

    return () => clearTimeout(hideTimeout);
  }, [isIntroFading]);

  useEffect(() => {
    if (active) {
      setIsIntroVisible(false);
      setIsIntroFading(false);
    }
  }, [active]);

  useEffect(() => {
    const animateFluid = () => {
      const current = fluidPositionRef.current;
      const target = pointerTargetRef.current;
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;

      hueRef.current += (hueTargetRef.current - hueRef.current) * 0.025;

      if (fluidRef.current) {
        fluidRef.current.style.setProperty("--fluid-x", `${current.x}%`);
        fluidRef.current.style.setProperty("--fluid-y", `${current.y}%`);
        fluidRef.current.style.setProperty(
          "--fluid-hue",
          `${(hueRef.current + 360) % 360}`
        );
      }

      animationFrameRef.current = requestAnimationFrame(animateFluid);
    };

    animationFrameRef.current = requestAnimationFrame(animateFluid);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const overlayActive = !isRemoved || isIntroVisible;

  useEffect(() => {
    if (!overlayActive) {
      if (previousOverflowRef.current !== null) {
        document.body.style.overflow = previousOverflowRef.current;
        previousOverflowRef.current = null;
      }
      return undefined;
    }

    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      if (previousOverflowRef.current !== null) {
        document.body.style.overflow = previousOverflowRef.current;
        previousOverflowRef.current = null;
      }
    };
  }, [overlayActive]);

  const updatePointerTarget = (event) => {
    if (!overlayRef.current) {
      return;
    }
    const rect = overlayRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    pointerTargetRef.current = {
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    };
    hueTargetRef.current = (pointerTargetRef.current.x / 100) * 360;
  };

  const handleExplore = () => {
    // Show sticky title immediately so text never disappears during fade
    setShowStickyTitle(true);
    setIsIntroFading(true);
    setHideExploreChip(true);
  };

  // Show hint until user scrolls/touches/keys to explore
  useEffect(() => {
    if (!showScrollHint) return undefined;

    const dismiss = () => setShowScrollHint(false);
    const keyDismiss = (e) => {
      const keys = ["ArrowDown", "PageDown", "Space", " "];
      if (keys.includes(e.key)) dismiss();
    };

    window.addEventListener("wheel", dismiss, { passive: true });
    window.addEventListener("touchstart", dismiss, { passive: true });
    window.addEventListener("touchmove", dismiss, { passive: true });
    window.addEventListener("keydown", keyDismiss, { passive: true });

    return () => {
      window.removeEventListener("wheel", dismiss);
      window.removeEventListener("touchstart", dismiss);
      window.removeEventListener("touchmove", dismiss);
      window.removeEventListener("keydown", keyDismiss);
    };
  }, [showScrollHint]);

  // Trigger evaporate on first scroll interaction
  useEffect(() => {
    if (!showScrollHint || !showStickyTitle) return undefined;

    const dismissAndEvaporate = () => {
      setShowScrollHint(false);
      setStickyEvaporate(true);
    };
    const keyDismiss = (e) => {
      const keys = ["ArrowDown", "PageDown", "Space", " "];
      if (keys.includes(e.key)) dismissAndEvaporate();
    };

    window.addEventListener("wheel", dismissAndEvaporate, { passive: true });
    window.addEventListener("touchstart", dismissAndEvaporate, {
      passive: true,
    });
    window.addEventListener("touchmove", dismissAndEvaporate, {
      passive: true,
    });
    window.addEventListener("keydown", keyDismiss, { passive: true });

    return () => {
      window.removeEventListener("wheel", dismissAndEvaporate);
      window.removeEventListener("touchstart", dismissAndEvaporate);
      window.removeEventListener("touchmove", dismissAndEvaporate);
      window.removeEventListener("keydown", keyDismiss);
    };
  }, [showScrollHint, showStickyTitle]);

  // Remove sticky title after evaporate finishes (compute based on text length)
  useEffect(() => {
    if (!stickyEvaporate) return undefined;
    const maxChars = Math.max(TITLE_TEXT.length, SUBTITLE_TEXT.length);
    const total = EVAP_DURATION + maxChars * EVAP_CHAR_DELAY + 120;
    const t = setTimeout(() => setShowStickyTitle(false), total);
    return () => clearTimeout(t);
  }, [stickyEvaporate]);

  return (
    <>
      {!isRemoved && (
        <div
          className={`loading-screen ${
            isFadingOut ? "loading-screen--hidden" : ""
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="loading-screen__content">
            <p className="loading-screen__welcome">
              Welcome to Narrative Forest.
            </p>
            <p className="loading-screen__instruction">
              Please wait till assets load.
            </p>
            <div
              className="loading-screen__progress"
              aria-label="Loading progress"
              aria-live="polite"
            >
              <div className="loading-screen__progress-track">
                <div
                  className="loading-screen__progress-fill"
                  style={{ width: `${safeProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isIntroVisible && (
        <div
          className={`hero-overlay ${
            isIntroFading ? "hero-overlay--hidden" : ""
          }`}
          ref={overlayRef}
          onPointerMove={updatePointerTarget}
        >
          <div className="hero-overlay__fluid" ref={fluidRef} />
        </div>
      )}

      {isHeroTitleVisible && (
        <>
          <div
            className={`hero-sticky ${
              stickyEvaporate ? "hero-sticky--evaporate" : ""
            } ${isIntroVisible ? "hero-sticky--overlay" : "hero-sticky--post"}`}
          >
            <div
              className="hero-sticky__line hero-sticky__title"
              aria-label={TITLE_TEXT}
            >
              {[...TITLE_TEXT].map((ch, i) => (
                <span
                  key={`t-${i}-${ch}`}
                  className="hero-sticky__char"
                  style={{ animationDelay: `${i * EVAP_CHAR_DELAY}ms` }}
                >
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </div>
            <div
              className="hero-sticky__line hero-sticky__subtitle"
              aria-label={SUBTITLE_TEXT}
            >
              {[...SUBTITLE_TEXT].map((ch, i) => (
                <span
                  key={`s-${i}-${ch}`}
                  className="hero-sticky__char"
                  style={{ animationDelay: `${i * EVAP_CHAR_DELAY}ms` }}
                >
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </div>
          </div>
          {!hideExploreChip && (
            <div className="hero-sticky-chip">
              <button
                type="button"
                className="hero-overlay__chip"
                onClick={handleExplore}
              >
                Explore
              </button>
            </div>
          )}
        </>
      )}

      {showStickyTitle && (
        <div
          className={`hero-sticky ${
            stickyEvaporate ? "hero-sticky--evaporate" : ""
          }`}
        >
          <div className="hero-sticky__line hero-sticky__title">
            {[...TITLE_TEXT].map((ch, i) => (
              <span
                key={`t-${i}-${ch}`}
                className="hero-sticky__char"
                style={{ animationDelay: `${i * EVAP_CHAR_DELAY}ms` }}
              >
                {ch === " " ? "\u00A0" : ch}
              </span>
            ))}
          </div>
          <div className="hero-sticky__line hero-sticky__subtitle">
            {[...SUBTITLE_TEXT].map((ch, i) => (
              <span
                key={`s-${i}-${ch}`}
                className="hero-sticky__char"
                style={{ animationDelay: `${i * EVAP_CHAR_DELAY}ms` }}
              >
                {ch === " " ? "\u00A0" : ch}
              </span>
            ))}
          </div>
        </div>
      )}

      {showScrollHint && (
        <div className="scroll-hint" role="status" aria-live="polite">
          <div className="scroll-hint__mouse" aria-hidden="true">
            <div className="scroll-hint__wheel" />
          </div>
          <div className="scroll-hint__text">Scroll to explore</div>
        </div>
      )}
    </>
  );
}
