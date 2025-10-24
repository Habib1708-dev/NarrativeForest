// App.jsx
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import Experience from "./Experience";
import FreeFlyJoystickOverlay from "./components/FreeFlyJoystickOverlay";

export default function App() {
  const audioRef = useRef(null);
  const rainAudioRef = useRef(null);
  const [currentPreset, setCurrentPreset] = useState("Default");

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
      <Canvas
        // World camera (OrbitControls drives this)
        camera={{ position: [-1.8, -4.8, -5], fov: 50, near: 0.05, far: 2000 }}
        shadows
        gl={{ antialias: true }}
        dpr={[1, 2]}
      >
        <Experience />
      </Canvas>
      <FreeFlyJoystickOverlay />
    </>
  );
}
