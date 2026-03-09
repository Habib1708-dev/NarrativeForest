import { Canvas } from "@react-three/fiber";
import AboutScene from "../components/about/AboutScene";
import "../styles/aboutMe.css";

export default function AboutMe() {
  return (
    <section className="about-me-page">
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }}>
        <AboutScene />
      </Canvas>

      <div className="about-me-overlay">
        <h1 className="about-me-title">About Me</h1>
      </div>
    </section>
  );
}
