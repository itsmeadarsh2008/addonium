// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Entry point for the optional React bundle (`bun run build` in homepage/).
// Mounts the hero shader only; CTA anchors already carry shadcn classes
// from the server, so no client-side upgrade is needed.
import { createRoot } from "react-dom/client";
import { HeroShader } from "./components/HeroShader";

const hero = document.getElementById("hero-shader");
if (hero) {
  createRoot(hero).render(<HeroShader />);
}
