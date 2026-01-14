import { Component } from "react";

class CanvasErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Silently handle WebGL context errors and EffectComposer errors
    if (
      error?.message?.includes("WebGL") ||
      error?.message?.includes("context") ||
      error?.message?.includes("alpha") ||
      error?.message?.includes("Cannot read properties of null") ||
      error?.stack?.includes("EffectComposer") ||
      error?.stack?.includes("addPass")
    ) {
      // Don't show error UI for WebGL/EffectComposer issues
      this.setState({ hasError: false });
      return;
    }
    
    // Log other errors to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Canvas Error Boundary caught an error:", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // Silently handle WebGL/EffectComposer errors
      if (
        this.state.error?.message?.includes("WebGL") ||
        this.state.error?.message?.includes("context") ||
        this.state.error?.message?.includes("alpha") ||
        this.state.error?.message?.includes("Cannot read properties of null") ||
        this.state.error?.stack?.includes("EffectComposer") ||
        this.state.error?.stack?.includes("addPass")
      ) {
        // Silently return null for WebGL/EffectComposer errors
        return null;
      }
      
      // For other errors, you could show a fallback UI
      return null;
    }

    return this.props.children;
  }
}

export default CanvasErrorBoundary;
