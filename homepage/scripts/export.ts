// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Static export for GitHub Pages: pre-renders every route to plain HTML.
// Run: BASE_PATH=/addonium bun run export  (OUT_DIR=./dist-static)
import { join } from "node:path";
import {
  helpersIndex,
  helperPage,
  landing,
  loadHelperPages,
  loadSections,
  notFound,
  sectionPage,
} from "../server";

const ROOT = join(import.meta.dir, "..");
const PUB = join(ROOT, "public");
const OUT = process.env["OUT_DIR"] ?? join(ROOT, "dist-static");
const BASE = (process.env["BASE_PATH"] ?? "").replace(/\/$/, "");

/** Rewrite root-absolute asset/page links for a project-pages base path. */
function based(html: string): string {
  // /api/info only exists on the live Bun server - drop it from static output.
  const noApi = html.replaceAll(`<a href="${BASE}/api/info">API</a> · `, "");
  if (!BASE) return noApi;
  return noApi
    .replaceAll('href="/', `href="${BASE}/`)
    .replaceAll('src="/', `src="${BASE}/`);
}

async function write(rel: string, content: string | globalThis.Response): Promise<void> {
  const dest = join(OUT, rel);
  await Bun.$`mkdir -p ${dest.slice(0, dest.lastIndexOf("/"))}`;
  if (typeof content === "string") {
    await Bun.write(dest, based(content));
  } else {
    await Bun.write(dest, content);
  }
  console.log("wrote", rel);
}

const sections = await loadSections();
const helpers = await loadHelperPages();
if (!sections || !helpers) throw new Error("render failed - nothing to export");

await write("index.html", landing(sections, helpers));
await write("404.html", notFound());
await write("helpers/index.html", helpersIndex(helpers));
for (const s of sections) {
  const html = sectionPage(sections, s.id);
  if (html) await write(`spec/${s.id}/index.html`, html);
}
for (const h of helpers) {
  const html = helperPage(helpers, h.id);
  if (html) await write(`helpers/${h.id}/index.html`, html);
}

// Static assets: stylesheet, client bundle, schemas, examples, raw spec.
for (const f of ["styles.css", "dist/main.js"]) {
  await write(f, await Bun.file(join(PUB, f)).arrayBuffer().then((b) => new Response(b)));
}
await write("spec.md", await Bun.file(join(ROOT, "..", "schema", "SCHEMA.md")).arrayBuffer().then((b) => new Response(b)));
for (const f of ["addonium.schema.json", "registry-entry.schema.json"]) {
  await write(`schema/${f}`, await Bun.file(join(ROOT, "..", "schema", f)).arrayBuffer().then((b) => new Response(b)));
}
const examples = new Bun.Glob("*.json");
for await (const f of examples.scan(join(ROOT, "..", "packages", "addonium", "examples"))) {
  await write(
    `examples/${f}`,
    await Bun.file(join(ROOT, "..", "packages", "addonium", "examples", f)).arrayBuffer().then((b) => new Response(b)),
  );
}
await Bun.write(join(OUT, ".nojekyll"), "");
console.log(`exported to ${OUT} (BASE_PATH=${BASE || "/"})`);
