import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/ui/Navbar";
import { Home, AboutUs, OurWork, ContactUs } from "./pages";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about-us" element={<AboutUs />} />
        <Route path="/our-work" element={<OurWork />} />
        <Route path="/contact-us" element={<ContactUs />} />

        {/* Back-compat redirects */}
        <Route path="/about" element={<Navigate to="/about-us" replace />} />
        <Route path="/work" element={<Navigate to="/our-work" replace />} />
        <Route
          path="/contact"
          element={<Navigate to="/contact-us" replace />}
        />
      </Routes>
    </>
  );
}
