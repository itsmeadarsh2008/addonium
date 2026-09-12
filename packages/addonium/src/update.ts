// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Updates + versioning per §12.1–§12.2. Polling pointer, deliberately boring.
import type { Manifest } from "./types.js";

export function parseSemver(v: string): [number, number, number] | null {
  const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** -1 | 0 | 1 comparing SemVer triples; null when unparseable. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

export interface UpdateCheck {
  due: boolean;
  manifestUrl?: string;
}

/** True when now - lastChecked >= checkInterval (default: check on launch). */
export function shouldCheckForUpdate(
  manifest: Pick<Manifest, "update">,
  lastCheckedAtMs: number | null,
  nowMs = Date.now(),
): UpdateCheck {
  const pointer = manifest.update;
  if (!pointer?.manifestUrl) return { due: false };
  if (lastCheckedAtMs === null) return { due: true, manifestUrl: pointer.manifestUrl };
  const interval = (pointer.checkInterval ?? 0) * 1000;
  return {
    due: nowMs - lastCheckedAtMs >= interval,
    manifestUrl: pointer.manifestUrl,
  };
}

/** Hosts MAY warn (never silently block) on downgrade / skipped major (§12.1). */
export function describeVersionChange(
  from: string,
  to: string,
): "upgrade" | "downgrade" | "same" | "unknown" {
  const c = compareVersions(from, to);
  if (c === null) return "unknown";
  if (c < 0) return "upgrade";
  if (c > 0) return "downgrade";
  return "same";
}
