// App.jsx
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import Experience from "./Experience";
import FreeFlyJoystickOverlay from "./components/FreeFlyJoystickOverlay";
import DebugModeIndicator from "./components/DebugModeIndicator";
import { useDebugStore } from "./state/useDebugStore";

export default function App() {
  const isDebugMode = useDebugStore((state) => state.isDebugMode);
  const toggleDebugMode = useDebugStore((state) => state.toggleDebugMode);
  const audioRef = useRef(null);
  const rainAudioRef = useRef(null);
  const [currentPreset, setCurrentPreset] = useState("Default");

  // Toggle body class based on debug mode (for hiding Leva controls)
  useEffect(() => {
    if (isDebugMode) {
      document.body.classList.remove("user-mode");
      document.body.classList.add("debug-mode");
    } else {
      document.body.classList.remove("debug-mode");
      document.body.classList.add("user-mode");
    }
  }, [isDebugMode]);

  // Keyboard shortcut to toggle debug mode (Ctrl+D)
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check for Ctrl+D (or Cmd+D on Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === "d") {
        event.preventDefault(); // Prevent browser bookmark dialog
        toggleDebugMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleDebugMode]);

  // Listen for preset changes from Experience
  useEffect(() => {
    const handlePresetChange = (event) => {
      setCurrentPreset(event.detail.preset);
    };

    window.addEventListener("presetChanged", handlePresetChange);
    return () => {
      window.removeEventListener("presetChanged", handlePresetChange);
    };
  }, []);

  // Handle rain audio based on preset
  useEffect(() => {
    const rainAudio = rainAudioRef.current;
    if (!rainAudio) return;

    if (currentPreset === "Stormy Night") {
      // Fade in rain audio
      rainAudio.volume = 0;
      rainAudio.play().catch(() => {
        // Autoplay blocked
      });

      // Fade in over 1 second
      let vol = 0;
      const fadeIn = setInterval(() => {
        vol += 0.05;
        if (vol >= 0.4) {
          vol = 0.4;
          clearInterval(fadeIn);
        }
        rainAudio.volume = vol;
      }, 50);

      return () => clearInterval(fadeIn);
    } else {
      // Fade out rain audio
      let vol = rainAudio.volume;
      const fadeOut = setInterval(() => {
        vol -= 0.05;
        if (vol <= 0) {
          vol = 0;
          clearInterval(fadeOut);
          rainAudio.pause();
        }
        rainAudio.volume = Math.max(0, vol);
      }, 50);

      return () => clearInterval(fadeOut);
    }
  }, [currentPreset]);

  // Handle main background audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Set volume
    audio.volume = 0.5;

    // Try to play immediately
    const playAudio = () => {
      audio.play().catch(() => {
        // Autoplay blocked, will play on user interaction
      });
    };

    playAudio();

    // If autoplay fails, play on first user interaction
    const handleInteraction = () => {
      audio.play();
      // Remove listeners after first interaction
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
    };

    document.addEventListener("click", handleInteraction);
    document.addEventListener("keydown", handleInteraction);
    document.addEventListener("touchstart", handleInteraction);

    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
    };
  }, []);

  return (
    <>
      <audio
        ref={audioRef}
        src="/audio/night-forest-soundscape-158701.mp3"
        loop
        preload="auto"
      />
      <audio
        ref={rainAudioRef}
        src="/audio/calming-rain-257596.mp3"
        loop
        preload="auto"
      />

      {/* Debug mode indicator badge */}
      <DebugModeIndicator />

      <Canvas
        // World camera (OrbitControls drives this)
        camera={{ position: [-1.8, -4.8, -5], fov: 50, near: 0.05, far: 2000 }}
        shadows
        gl={{ antialias: true }}
        dpr={[1, 2]}
      >
        <Experience />
      </Canvas>

      {/* Joystick overlay - always visible for user navigation */}
      <FreeFlyJoystickOverlay />
    </>
  );
}
