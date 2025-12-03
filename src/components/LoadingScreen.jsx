import { useProgress } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";

export default function LoadingScreen() {
  const STABILIZE_DURATION = 1000;
  const FADE_DURATION = 600;
  const { active, progress } = useProgress();
  const [hasStarted, setHasStarted] = useState(false);
  const [isForestReady, setIsForestReady] = useState(false);
  const [isSceneSettled, setIsSceneSettled] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);
  const safeProgress = useMemo(
    () => Math.min(100, Math.max(0, progress || 0)),
    [progress]
  );

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

    setIsFadingOut(true);
    const fadeTimeout = setTimeout(() => setIsRemoved(true), FADE_DURATION);

    return () => clearTimeout(fadeTimeout);
  }, [isSceneSettled]);

  if (isRemoved) {
    return null;
  }

  return (
    <div
      className={`loading-screen ${
        isFadingOut ? "loading-screen--hidden" : ""
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="loading-screen__content">
        <p className="loading-screen__welcome">Welcome to Narrative Forest.</p>
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
  );
}
