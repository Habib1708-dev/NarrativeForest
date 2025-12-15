import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAudioStore } from "../../state/useAudioStore";
import { useCameraStore } from "../../state/useCameraStore";
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

// Exit icon for "Exit Freeflight"
const ExitIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="navbar-icon"
    aria-hidden="true"
  >
    <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
  </svg>
);

// Burger menu icon
const BurgerIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="navbar-icon"
    aria-hidden="true"
  >
    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
  </svg>
);

// Close icon for drawer
const CloseIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="navbar-icon"
    aria-hidden="true"
  >
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isMuted = useAudioStore((state) => state.isMuted);
  const toggleMute = useAudioStore((state) => state.toggleMute);
  const skipToFreeFly = useCameraStore((state) => state.skipToFreeFly);
  const cameraMode = useCameraStore((state) => state.mode);

  const isHomePage = location.pathname === "/";
  const isInFreeFlight = isHomePage && cameraMode === "freeFly";
  const canSkipToFreeFlight = isHomePage && cameraMode === "path";

  const handleFlightButtonClick = () => {
    if (isInFreeFlight) {
      // Exit freeflight - reload to home page
      window.location.href = "/";
    } else if (canSkipToFreeFlight) {
      skipToFreeFly();
    }
  };

  const toggleDrawer = () => {
    setIsDrawerOpen(!isDrawerOpen);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  return (
    <>
      <nav className="navbar" role="navigation" aria-label="Main navigation">
        <div className="navbar-container">
          {/* Left side - Skip to Freeflight / Exit Freeflight toggle */}
          <div className="navbar-left">
            <button
              className={`navbar-skip-button ${
                !canSkipToFreeFlight && !isInFreeFlight
                  ? "navbar-skip-button--disabled"
                  : ""
              }`}
              type="button"
              aria-label={
                isInFreeFlight
                  ? "Exit freeflight mode"
                  : "Skip to freeflight mode"
              }
              onClick={handleFlightButtonClick}
              disabled={!canSkipToFreeFlight && !isInFreeFlight}
            >
              {isInFreeFlight ? <ExitIcon /> : <AirplaneIcon />}
              <span>
                {isInFreeFlight ? "Exit freeflight" : "Skip to freeflight"}
              </span>
            </button>
          </div>

          {/* Right side - Desktop navigation links */}
          <ul className="navbar-links navbar-links--desktop">
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

          {/* Right side - Mobile controls (speaker + burger) */}
          <div className="navbar-right-mobile">
            <button
              className="navbar-sound-button"
              type="button"
              aria-label={isMuted ? "Unmute sound" : "Mute sound"}
              onClick={toggleMute}
            >
              {isMuted ? <SoundOffIcon /> : <SoundOnIcon />}
            </button>
            <button
              className="navbar-burger-button"
              type="button"
              aria-label={isDrawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={isDrawerOpen}
              onClick={toggleDrawer}
            >
              {isDrawerOpen ? <CloseIcon /> : <BurgerIcon />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer overlay */}
      <div
        className={`navbar-drawer-overlay ${
          isDrawerOpen ? "navbar-drawer-overlay--open" : ""
        }`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <div
        className={`navbar-drawer ${isDrawerOpen ? "navbar-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="navbar-drawer-header">
          <button
            className="navbar-drawer-close"
            type="button"
            aria-label="Close menu"
            onClick={closeDrawer}
          >
            <CloseIcon />
          </button>
        </div>
        <ul className="navbar-drawer-links">
          <li>
            <Link
              to="/about"
              className={`navbar-drawer-link ${
                location.pathname === "/about" ? "active" : ""
              }`}
              onClick={closeDrawer}
            >
              About
            </Link>
          </li>
          <li>
            <Link
              to="/work"
              className={`navbar-drawer-link ${
                location.pathname === "/work" ? "active" : ""
              }`}
              onClick={closeDrawer}
            >
              Illustration
            </Link>
          </li>
          <li>
            <Link
              to="/work"
              className={`navbar-drawer-link ${
                location.pathname === "/work" ? "active" : ""
              }`}
              onClick={closeDrawer}
            >
              Design & Dev
            </Link>
          </li>
          <li>
            <Link
              to="/contact"
              className={`navbar-drawer-link ${
                location.pathname === "/contact" ? "active" : ""
              }`}
              onClick={closeDrawer}
            >
              Contact
            </Link>
          </li>
        </ul>
      </div>
    </>
  );
}

