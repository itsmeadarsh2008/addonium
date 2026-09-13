// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Bun homepage server. Every spec section and every helpers module gets its
// own page; the landing page indexes them all. Code blocks are syntax
// highlighted server-side. React stays optional (hero shader + shadcn CTA
// upgrades only).
import { join } from "node:path";

const ROOT = import.meta.dir;
const PUBLIC = join(ROOT, "public");
const SPEC_PATH = join(ROOT, "..", "schema", "SCHEMA.md");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Titles/blurbs are extracted from already-serialized HTML, so entities like
// &#x26; must be decoded first - otherwise esc() double-escapes them.
function decodeEntities(s: string): string {
  return s
    .replace(/&#x26;/gi, "&")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

interface Section {
  id: string;
  title: string;
  html: string;
  blurb: string;
}

// Remark pipeline (unified). If any of it fails to load, pages fall back
// to static HTML instead of crashing.
type Processor = { process(md: string): Promise<{ toString(): string }> };
let mdProcessor: Processor | null = null;
try {
  const { unified } = await import("unified");
  const { default: remarkParse } = await import("remark-parse");
  const { default: remarkFrontmatter } = await import("remark-frontmatter");
  const { default: remarkGfm } = await import("remark-gfm");
  const { default: remarkEmoji } = await import("remark-emoji");
  // Installed but intentionally off: remark-toc (the spec ships a hand-written
  // TOC that doubles as the first section page) and remark-breaks (it would
  // turn every prose line-wrap into a <br>).
  const { default: remarkRehype } = await import("remark-rehype");
  const { default: rehypeRaw } = await import("rehype-raw");
  const { default: rehypeSlug } = await import("rehype-slug");
  const { default: rehypeAutolinkHeadings } = await import("rehype-autolink-headings");
  const { default: rehypeHighlight } = await import("rehype-highlight");
  const { default: rehypeExternalLinks } = await import("rehype-external-links");
  const { default: rehypeStringify } = await import("rehype-stringify");
  mdProcessor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkEmoji)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      properties: { className: ["anchor"], ariaHidden: "true", tabIndex: -1 },
      content: { type: "text", value: "#" },
    })
    .use(rehypeHighlight)
    .use(rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] })
    .use(rehypeStringify) as unknown as Processor;
} catch (err) {
  console.warn("markdown unavailable, serving static fallback:", (err as Error).message);
}

async function renderMarkdown(md: string): Promise<string> {
  if (!mdProcessor) throw new Error("markdown unavailable");
  return (await mdProcessor.process(md)).toString();
}

const helpersDoc = await import("./scripts/gen-helpers-doc").catch((err: Error) => {
  console.warn("helpers doc unavailable:", err.message);
  return null;
});

// Addonium's own button classes, rendered server-side so CTAs look right
// with JS off. Falls back to plain classes if the import ever fails.
let btnPrimary = "abtn abtn-primary abtn-lg";
let btnOutline = "abtn abtn-outline abtn-lg";
try {
  const { buttonClass } = await import("./src/components/button");
  btnPrimary = buttonClass("primary", "lg");
  btnOutline = buttonClass("outline", "lg");
} catch (err) {
  console.warn("button classes unavailable, using fallback:", (err as Error).message);
}

function blurbOf(html: string): string {
  const m = html.match(/<p>([\s\S]*?)<\/p>/);
  if (!m) return "";
  const text = m[1].replace(/<[^>]+>/g, "");
  return text.length > 160 ? text.slice(0, 157) + "..." : text;
}

export async function loadSections(): Promise<Section[] | null> {
  if (!mdProcessor) return null;
  try {
    const md = await Bun.file(SPEC_PATH).text();
    const article = await renderMarkdown(md);
    const parts = article.split(/(?=<h2 id=")/);
    const rawSections: Section[] = [];
    for (const part of parts) {
      const hm = part.match(/^<h2 id="([^"]+)">(?:<a[^>]*>.*?<\/a>)?([\s\S]*?)<\/h2>/);
      if (!hm) continue;
      rawSections.push({
        id: hm[1],
        title: decodeEntities(hm[2].replace(/<[^>]+>/g, "")),
        html: part,
        blurb: decodeEntities(blurbOf(part)),
      });
    }
    // Rewrite cross-section `#fragment` links to their pages. The heading's
    // own self-anchor (class="anchor") stays a same-page link.
    const ids = new Set(rawSections.map((s) => s.id));
    for (const s of rawSections) {
      s.html = s.html.replace(/<a\b[^>]*>/g, (tag) => {
        if (/\banchor\b/.test(tag)) return tag;
        return tag.replace(/href="#([a-z0-9-]+)"/, (m, frag: string) =>
          ids.has(frag) ? `href="/spec/${frag}"` : m,
        );
      });
    }
    return rawSections;
  } catch (err) {
    console.warn("spec render failed:", (err as Error).message);
    return null;
  }
}

interface HelperPage {
  id: string;
  file: string;
  html: string;
  count: number;
}

export async function loadHelperPages(): Promise<HelperPage[] | null> {
  if (!mdProcessor || !helpersDoc?.collectHelperDocs) return null;
  try {
    const modules = await helpersDoc.collectHelperDocs();
    return await Promise.all(
      modules.map(async (mod) => ({
        id: mod.file.replace(/\.ts$/, ""),
        file: mod.file,
        html: await renderMarkdown(helpersDoc.renderHelpersMarkdown([mod])),
        count: mod.entries.length,
      })),
    );
  } catch (err) {
    console.warn("helpers render failed:", (err as Error).message);
    return null;
  }
}

/* ---------- layout ---------- */

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=Roboto+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />`;

function head(title: string, canonicalPath = "/"): string {
  const site = (process.env["SITE_URL"] ?? "https://addonium.unified.dpdns.org").replace(/\/$/, "");
  return `<meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} - Addonium</title>
    <link rel="canonical" href="${esc(site + canonicalPath)}" />
    <meta property="og:title" content="${esc(title)} - Addonium" />
    <meta property="og:url" content="${esc(site + canonicalPath)}" />
    <meta property="og:type" content="website" />
    <link rel="stylesheet" href="/styles.css" />
    ${FONTS}`;
}

function layout(opts: {
  title: string;
  body: string;
  bundle?: boolean;
  canonical?: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>${head(opts.title, opts.canonical ?? "/")}</head>
  <body>
    ${opts.body}
    <footer><div class="wrap"><p>Author-sovereign · Zero mandatory infra · Progressive trust. Spec text CC0-1.0 · Code Apache-2.0. <a href="https://github.com/itsmeadarsh2008/addonium">GitHub</a></p></div></footer>
    ${opts.bundle === false ? "" : '<script type="module" src="/dist/main.js" onerror="void 0"></script>'}
  </body>
</html>`;
}

function sectionNav(sections: Section[], current: string): string {
  return `<nav class="sidenav" aria-label="Spec sections"><p class="nav-title">Spec</p><ul>${sections
    .map(
      (s) =>
        `<li${s.id === current ? ' class="active"' : ""}><a href="/spec/${s.id}">${esc(s.title)}</a></li>`,
    )
    .join("")}</ul></nav>`;
}

/* ---------- pages ---------- */

export function landing(sections: Section[] | null, helpers: HelperPage[] | null): string {
  const specRows = sections
    ? sections
        .map(
          (s) =>
            `<li><a class="sec-row" href="/spec/${s.id}"><span class="sec-body"><strong>${esc(s.title.replace(/^\d+\.\s*/, ""))}</strong><span class="sec-blurb">${esc(s.blurb)}</span></span><span class="sec-go" aria-hidden="true">→</span></a></li>`,
        )
        .join("")
    : `<li>Spec render unavailable. <a href="/spec.md">Read the raw markdown</a>.</li>`;
  const helperRows = helpers
    ? helpers
        .map(
          (h) =>
            `<li><a class="sec-row" href="/helpers/${h.id}"><span class="sec-no">◆</span><span class="sec-body"><span class="sec-kicker">Helper module · ${h.count} exports</span><strong><code>${esc(h.file)}</code></strong></span><span class="sec-go" aria-hidden="true">→</span></a></li>`,
        )
        .join("")
    : "";
  const body = `<header class="hero">
      <div id="hero-shader" aria-hidden="true"></div>
      <div class="wrap hero-inner">
        <p class="eyebrow">An open standard · v1.0.0-draft</p>
        <h1 class="site-title">Addonium</h1>
        <p class="lede">A freedom-first addon schema for music apps. If you can run a
          website or share a file, you can publish an addon. No accounts, no
          gatekeepers, no mandatory cloud.</p>
        <div class="hero-links">
          <a class="${btnPrimary}" href="#spec">Browse the spec</a>
          <a class="${btnOutline}" href="#helpers">Helpers API</a>
        </div>
        <p class="meta">Spec text CC0-1.0 · Code Apache-2.0 ·
          <a href="/api/info">API</a> · <a href="/spec.md">Raw spec</a> ·
          <a href="/schema/addonium.schema.json">JSON Schema</a> ·
          <a href="https://github.com/itsmeadarsh2008/addonium">GitHub</a></p>
      </div>
    </header>
    <div class="wrap landing-main">
      <section id="spec"><h2>Specification</h2>
        <p>Every section is its own page. Start anywhere.</p>
        <ol class="sec-list">${specRows}</ol>
      </section>
      <section id="helpers"><h2>Helpers API (<code>@addonium/helpers</code>)</h2>
        <p>Zero-dependency TypeScript helpers, generated from source. <code>bun add @addonium/helpers</code></p>
        <ol class="sec-list">${helperRows}</ol>
      </section>
    </div>`;
  return layout({ title: "freedom-first addon schema", body, canonical: "/" });
}

export function sectionPage(sections: Section[], current: string): string | null {
  const i = sections.findIndex((s) => s.id === current);
  if (i === -1) return null;
  const s = sections[i];
  const prev = sections[i - 1];
  const next = sections[i + 1];
  const body = `<div class="wrap layout">
      ${sectionNav(sections, current)}
      <main>
        <p class="back"><a href="/">← Addonium</a></p>
        <article class="spec">${s.html}</article>
        <nav class="prevnext">
          ${prev ? `<a class="${btnOutline}" href="/spec/${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}
          ${next ? `<a class="${btnPrimary}" href="/spec/${next.id}">${esc(next.title)} →</a>` : "<span></span>"}
        </nav>
      </main>
    </div>`;
  return layout({ title: s.title, body, canonical: `/spec/${s.id}` });
}

export function helpersIndex(pages: HelperPage[]): string {
  const rows = pages
    .map(
      (h) =>
        `<li><a class="sec-row" href="/helpers/${h.id}"><span class="sec-no">◆</span><span class="sec-body"><span class="sec-kicker">Helper module · ${h.count} exports</span><strong><code>${esc(h.file)}</code></strong></span><span class="sec-go" aria-hidden="true">→</span></a></li>`,
    )
    .join("");
  const body = `<div class="wrap landing-main">
      <p class="back"><a href="/">← Addonium</a></p>
      <section><h2>Helpers API (<code>@addonium/helpers</code>)</h2>
      <p>Zero runtime dependencies. Works under Bun, Node 18+, and browsers. <code>bun add @addonium/helpers</code></p>
      <ol class="sec-list">${rows}</ol></section>
    </div>`;
  return layout({ title: "Helpers API", body, canonical: "/helpers" });
}

export function helperPage(pages: HelperPage[], current: string): string | null {
  const i = pages.findIndex((h) => h.id === current);
  if (i === -1) return null;
  const h = pages[i];
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const body = `<div class="wrap layout">
      <nav class="sidenav" aria-label="Helper modules"><p class="nav-title">Helpers</p><ul>${pages
        .map(
          (p) =>
            `<li${p.id === current ? ' class="active"' : ""}><a href="/helpers/${p.id}"><code>${esc(p.file)}</code></a></li>`,
        )
        .join("")}</ul></nav>
      <main>
        <p class="back"><a href="/">← Addonium</a></p>
        <article class="spec helpers"><h2><code>${esc(h.file)}</code></h2>${h.html}</article>
        <nav class="prevnext">
          ${prev ? `<a class="${btnOutline}" href="/helpers/${prev.id}">← <code>${esc(prev.file)}</code></a>` : "<span></span>"}
          ${next ? `<a class="${btnPrimary}" href="/helpers/${next.id}"><code>${esc(next.file)}</code> →</a>` : "<span></span>"}
        </nav>
      </main>
    </div>`;
  return layout({ title: h.file, body, canonical: `/helpers/${h.id}` });
}

export function notFound(): string {
  return layout({
    title: "not found",
    body: `<div class="wrap landing-main"><h2>Nothing here</h2><p><a href="/">Back home</a></p></div>`,
    bundle: false,
  });
}

/* ---------- server ---------- */

async function serveFile(path: string): Promise<Response | null> {
  const f = Bun.file(path);
  if (!(await f.exists())) return null;
  const ext = path.slice(path.lastIndexOf("."));
  return new Response(f, {
    headers: { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" },
  });
}

const html = (s: string, status = 200) =>
  new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8" } });

export const server = import.meta.main
  ? Bun.serve({
  port: Number(process.env["PORT"] ?? 3000),
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/api/info") {
      const [sections, helpers] = await Promise.all([loadSections(), loadHelperPages()]);
      return Response.json({
        name: "Addonium",
        spec: "1.0.0-draft",
        sections: (sections ?? []).map((s) => `/spec/${s.id}`),
        helpers: (helpers ?? []).map((h) => `/helpers/${h.id}`),
        schema: "/schema/addonium.schema.json",
      });
    }
    if (path === "/" || path === "/index.html") {
      const [sections, helpers] = await Promise.all([loadSections(), loadHelperPages()]);
      if (sections || helpers) return html(landing(sections, helpers));
      const fallback = await serveFile(join(PUBLIC, "index.html"));
      if (fallback) return fallback;
      return html(landing(null, null));
    }
    if (path === "/spec.md" || path === "/spec") {
      const f = await serveFile(SPEC_PATH);
      if (f) return f;
    }
    const specMatch = path.match(/^\/spec\/([a-z0-9-]+)\/?$/);
    if (specMatch) {
      const sections = await loadSections();
      const pageHtml = sections ? sectionPage(sections, specMatch[1]) : null;
      if (pageHtml) return html(pageHtml);
      return html(notFound(), 404);
    }
    if (path === "/helpers") {
      const helpers = await loadHelperPages();
      if (helpers) return html(helpersIndex(helpers));
      return html(notFound(), 404);
    }
    const helperMatch = path.match(/^\/helpers\/([a-z0-9-]+)\/?$/);
    if (helperMatch) {
      const helpers = await loadHelperPages();
      const pageHtml = helpers ? helperPage(helpers, helperMatch[1]) : null;
      if (pageHtml) return html(pageHtml);
      return html(notFound(), 404);
    }
    if (path.startsWith("/schema/") || path.startsWith("/examples/")) {
      const f = await serveFile(join(ROOT, "..", path));
      if (f) return f;
    }
    const f = await serveFile(join(PUBLIC, path.slice(1)));
    if (f) return f;
    return html(notFound(), 404);
  },
}) : null;

if (import.meta.main && server) {
  console.log(`addonium homepage → http://localhost:${server.port}`);
}
