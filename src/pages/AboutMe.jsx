import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { useEffect } from "react";
import AboutScene from "../components/about/AboutScene";
import CanvasErrorBoundary from "../components/shared/CanvasErrorBoundary";
import "../styles/aboutMe.css";

export default function AboutMe() {
  useEffect(() => {
    document.body.classList.remove("user-mode");
    document.body.classList.add("debug-mode");
    return () => {
      document.body.classList.remove("debug-mode");
      document.body.classList.add("user-mode");
    };
  }, []);

  return (
    <section className="about-me-page">
      <Leva collapsed={false} oneLineLabels />
      <CanvasErrorBoundary>
        <Canvas
          dpr={[1, 1.5]}
          shadows={false}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <AboutScene />
        </Canvas>
      </CanvasErrorBoundary>

      <div className="about-me-overlay">
        <h1 className="about-me-title">About Me</h1>
      </div>
    </section>
  );
}
