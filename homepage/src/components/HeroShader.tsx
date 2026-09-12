// Licensed under the Apache License, Version 2.0 (see LICENSE).
import { Component, type ReactNode } from "react";
import { GrainGradient } from "@paper-design/shaders-react";

class ShaderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function HeroShader() {
  return (
    <ShaderBoundary>
      <GrainGradient
        width="100%"
        height="100%"
        colors={["#7300ff", "#eba8ff", "#00bfff", "#2b00ff"]}
        colorBack="#000000"
        softness={0.5}
        intensity={0.5}
        noise={0.25}
        shape="corners"
        speed={1}
        fit="cover"
      />
    </ShaderBoundary>
  );
}
