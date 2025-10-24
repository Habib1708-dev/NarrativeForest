// App.jsx
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import Experience from "./Experience";
import FreeFlyJoystickOverlay from "./components/FreeFlyJoystickOverlay";

export default function App() {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current) {
      // Attempt to play the audio
      audioRef.current.play().catch((error) => {
        console.log(
          "Audio autoplay prevented. User interaction required:",
          error
        );
      });
    }
  }, []);

  return (
    <>
      <audio
        ref={audioRef}
        src="/audio/night-forest-soundscape-158701.mp3"
        loop
        autoPlay
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
