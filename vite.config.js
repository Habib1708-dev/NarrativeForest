import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";
import restart from "vite-plugin-restart";

export default defineConfig({
  root: "./src",
  publicDir: "../public",
  base: "./",
  plugins: [
    // React support with fast refresh
    react(),

    // GLSL shader imports
    glsl(),

    // Restart server on changes in public files
    restart({
      restart: ["../public/**"],
    }),
  ],
  server: {
    host: true, // LAN access
    open: true, // auto-open browser
    allowedHosts: true, // allow tunneling domains like ngrok
    port: 5173, // keep a deterministic port so Vite does not hop and break HMR fetches
    strictPort: true, // fail fast instead of switching ports (prevents ERR_NETWORK_CHANGED spam)
  },
});
