import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import Experience from "../Experience";
import LoadingScreen from "../components/LoadingScreen";
import FreeFlyJoystickOverlay from "../components/FreeFlyJoystickOverlay";
import DebugModeIndicator from "../components/DebugModeIndicator";
import ClickAndDragHint from "../components/ClickAndDragHint";
import PresetSelector from "../components/PresetSelector";
import StopCircleOverlay from "../components/StopCircleOverlay";
import PerformanceMetricsDisplay from "../components/PerformanceMetricsDisplay";
import CanvasErrorBoundary from "../components/CanvasErrorBoundary";
import { useDebugStore } from "../state/useDebugStore";
import { useAudioStore } from "../state/useAudioStore";
import { PRESET_NAMES } from "../utils/presets";

export default function Home() {
  const isDebugMode = useDebugStore((state) => state.isDebugMode);
  const toggleDebugMode = useDebugStore((state) => state.toggleDebugMode);
  const isMuted = useAudioStore((state) => state.isMuted);
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
      if ((event.ctrlKey || event.metaKey) && event.key === "d") {
        event.preventDefault();
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

  const handlePresetChange = (presetName) => {
    setCurrentPreset(presetName);
    window.dispatchEvent(
      new CustomEvent("userPresetChange", {
        detail: { preset: presetName },
      })
    );
  };

  // Handle rain audio based on preset
  useEffect(() => {
    const rainAudio = rainAudioRef.current;
    if (!rainAudio) return;

    if (currentPreset === "Stormy Night") {
      rainAudio.volume = 0;
      rainAudio.play().catch(() => {
        // Autoplay blocked
      });

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
    }

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
  }, [currentPreset]);

  // Handle mute state for all audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
    if (rainAudioRef.current) {
      rainAudioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Handle main background audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = 0.5;

    const playAudio = () => {
      audio.play().catch(() => {
        // Autoplay blocked, will play on user interaction
      });
    };

    playAudio();

    const handleInteraction = () => {
      audio.play();
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
      document.removeEventListener("pointerdown", handleInteraction);
    };

    document.addEventListener("click", handleInteraction);
    document.addEventListener("keydown", handleInteraction);
    document.addEventListener("touchstart", handleInteraction);
    document.addEventListener("pointerdown", handleInteraction, {
      passive: true,
    });

    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
      document.removeEventListener("pointerdown", handleInteraction);
    };
  }, []);

  return (
    <>
      <LoadingScreen />
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

      <DebugModeIndicator />
      <ClickAndDragHint />
      <StopCircleOverlay />
      <PresetSelector
        presets={PRESET_NAMES}
        currentPreset={currentPreset}
        onPresetChange={handlePresetChange}
      />

      <CanvasErrorBoundary>
        <Canvas
          camera={{ position: [-1.8, -4.8, -5], fov: 50, near: 0.05, far: 2000 }}
          gl={{ 
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false
          }}
          dpr={[1, 2]}
          onCreated={({ gl }) => {
            // Handle WebGL context loss
            const canvas = gl.domElement;
            const handleContextLost = (event) => {
              event.preventDefault();
              // Context loss is handled gracefully
            };
            const handleContextRestored = () => {
              // Context restored, app will recover automatically
            };
            canvas.addEventListener('webglcontextlost', handleContextLost);
            canvas.addEventListener('webglcontextrestored', handleContextRestored);
          }}
        >
          <Experience />
        </Canvas>
      </CanvasErrorBoundary>

      <PerformanceMetricsDisplay />
      <FreeFlyJoystickOverlay />
    </>
  );
}

