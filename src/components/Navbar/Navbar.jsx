import { Link, useLocation } from "react-router-dom";
import { useAudioStore } from "../../state/useAudioStore";
import "./Navbar.css";

// Airplane icon as inline SVG for "Skip to Freeflight"
const AirplaneIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="navbar-icon"
    aria-hidden="true"
  >
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
  </svg>
);

// Sound on icon
const SoundOnIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="navbar-icon"
  >
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

// Sound off (muted) icon
const SoundOffIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="navbar-icon"
  >
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
  </svg>
);

export default function Navbar() {
  const location = useLocation();
  const isMuted = useAudioStore((state) => state.isMuted);
  const toggleMute = useAudioStore((state) => state.toggleMute);

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="navbar-container">
        {/* Left side - Skip to Freeflight */}
        <div className="navbar-left">
          <button
            className="navbar-skip-button"
            type="button"
            aria-label="Skip to freeflight mode"
          >
            <AirplaneIcon />
            <span>Skip to freeflight</span>
          </button>
        </div>

        {/* Right side - Navigation links */}
        <ul className="navbar-links">
          <li>
            <Link
              to="/about"
              className={`navbar-link ${
                location.pathname === "/about" ? "active" : ""
              }`}
            >
              About
            </Link>
          </li>
          <li>
            <Link
              to="/work"
              className={`navbar-link ${
                location.pathname === "/work" ? "active" : ""
              }`}
            >
              Illustration
            </Link>
          </li>
          <li>
            <Link
              to="/work"
              className={`navbar-link ${
                location.pathname === "/work" ? "active" : ""
              }`}
            >
              Design & Dev
            </Link>
          </li>
          <li>
            <Link
              to="/contact"
              className={`navbar-link ${
                location.pathname === "/contact" ? "active" : ""
              }`}
            >
              Contact
            </Link>
          </li>
          <li>
            <button
              className="navbar-sound-button"
              type="button"
              aria-label={isMuted ? "Unmute sound" : "Mute sound"}
              onClick={toggleMute}
            >
              {isMuted ? <SoundOffIcon /> : <SoundOnIcon />}
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
