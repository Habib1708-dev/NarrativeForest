import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import { Home, AboutUs, OurWork, ContactUs } from "./pages";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/work" element={<OurWork />} />
        <Route path="/contact" element={<ContactUs />} />
      </Routes>
    </>
  );
}
