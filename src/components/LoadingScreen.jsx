import { useProgress } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

const STABILIZE_DURATION = 1000;
const FADE_DURATION = 2000;

export default function LoadingScreen() {
  const { active } = useProgress();
  const [isForestReady, setIsForestReady] = useState(false);
  const [isSceneSettled, setIsSceneSettled] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);

  const previousOverflowRef = useRef(null);

  // Reset the global flag on mount to prevent stale state from previous sessions
  useEffect(() => {
    window.__loadingScreenFinished = false;
  }, []);

  useEffect(() => {
    const handleForestReady = () => setIsForestReady(true);
    window.addEventListener("forest-ready", handleForestReady);
    return () => window.removeEventListener("forest-ready", handleForestReady);
  }, []);

  useEffect(() => {
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
  }, [active, isForestReady]);

  useEffect(() => {
    if (!isSceneSettled) {
      return undefined;
    }

    setIsFadingOut(true);
    const fadeTimeout = setTimeout(() => setIsRemoved(true), FADE_DURATION);

    return () => clearTimeout(fadeTimeout);
  }, [isSceneSettled]);

  // Fire event when fade STARTS so welcome overlay appears immediately
  // and covers the canvas before loading screen reveals it
  useEffect(() => {
    if (!isFadingOut) return undefined;

    window.__loadingScreenFinished = true;
    window.dispatchEvent(new Event("loading-screen-finished"));

    return undefined;
  }, [isFadingOut]);

  const overlayActive = !isRemoved;

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
            <p className="loading-screen__text">LOADING</p>
            <div className="loading-screen__spinner" aria-hidden="true">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="loading-screen__spinner-segment"
                  style={{ "--segment-index": i }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
