import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";

// Prevent React DevTools from crashing if a renderer registers without a semver string.
if (typeof window !== "undefined") {
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (
    hook &&
    typeof hook.registerRenderer === "function" &&
    !hook.__patchedForEmptySemver
  ) {
    const originalRegisterRenderer = hook.registerRenderer;
    hook.registerRenderer = function registerRendererPatched(
      renderer,
      ...rest
    ) {
      if (
        renderer &&
        (typeof renderer.version !== "string" ||
          renderer.version.trim().length === 0)
      ) {
        renderer.version = "0.0.0";
      }
      return originalRegisterRenderer.call(this, renderer, ...rest);
    };
    hook.__patchedForEmptySemver = true;
  }
}

ReactDOM.createRoot(document.getElementById("app")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
