// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Generates Helpers API markdown from JSDoc in packages/addonium/src/*.ts,
// so the website documents the helpers without hand-maintained duplication.
import { join } from "node:path";

const SRC = join(import.meta.dir, "..", "..", "packages", "addonium", "src");

export interface DocEntry {
  kind: "function" | "interface" | "class" | "type";
  name: string;
  signature: string;
  doc: string;
}

export interface DocModule {
  file: string;
  entries: DocEntry[];
}

function cleanDoc(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n")
    .trim();
}

/** Balance parens/braces from `start` index; returns end index (exclusive). */
function balanced(src: string, start: number): number {
  let depth = 0;
  let i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i + 1;
    } else if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      for (; i < src.length && src[i] !== q; i++) {
        if (src[i] === "\\") i++;
      }
    }
  }
  return i;
}

export async function collectHelperDocs(): Promise<DocModule[]> {
  const glob = new Bun.Glob("*.ts");
  const files: string[] = [];
  for await (const f of glob.scan(SRC)) {
    if (f !== "index.ts") files.push(f);
  }
  files.sort();
  const modules: DocModule[] = [];
  for (const file of files) {
    const src = await Bun.file(join(SRC, file)).text();
    const entries: DocEntry[] = [];
    // export [doc] function|interface|class|type NAME...
    const re = /(?:\/\*\*([\s\S]*?)\*\/\s*)?export\s+(function|interface|class|type)\s+([A-Za-z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const kind = m[2] as DocEntry["kind"];
      const name = m[3];
      const doc = m[1] ? cleanDoc(m[1]) : "";
      let signature = name;
      if (kind === "function") {
        const paren = src.indexOf("(", m.index + m[0].length - name.length);
        const end = balanced(src, paren);
        let rest = src.slice(end, end + 120).split("\n")[0];
        if (rest.trim().startsWith(":")) rest = rest.trim();
        else rest = "";
        signature = `${name}${src
          .slice(paren, end)
          .replace(/\s+/g, " ")}${rest.replace(/\s*\{?\s*$/, "")}`;
      }
      entries.push({ kind, name, signature, doc });
    }
    if (entries.length > 0) modules.push({ file, entries });
  }
  return modules;
}

export function renderHelpersMarkdown(modules: DocModule[]): string {
  const out: string[] = [
    "Install with `bun add @addonium/helpers`. Zero runtime dependencies - works under Bun, Node 18+, and browsers.",
    "",
  ];
  for (const mod of modules) {
    out.push(`### \`${mod.file}\``, "");
    for (const e of mod.entries) {
      out.push(`#### \`${e.signature}\``, "");
      if (e.doc) {
        const first = e.doc.split("\n\n")[0];
        out.push(first, "");
      } else {
        out.push(`*${e.kind} ${e.name}.*`, "");
      }
    }
  }
  return out.join("\n");
}
