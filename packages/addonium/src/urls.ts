// Licensed under the Apache License, Version 2.0 (see LICENSE).
// URL helpers for §7 (tokenized URLs) + §8.8 (settings as query params).
import type { SettingsValues } from "./types.js";

/** Join a baseUrl (which may embed an opaque token segment) with a path. */
export function joinBase(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export function manifestUrl(baseUrl: string): string {
  return joinBase(baseUrl, "/manifest.json");
}

export function searchUrl(baseUrl: string, q: string, limit?: number): string {
  const u = new URL(joinBase(baseUrl, "/search"));
  u.searchParams.set("q", q);
  if (limit !== undefined) u.searchParams.set("limit", String(limit));
  return u.toString();
}

export function streamUrl(baseUrl: string, id: string): string {
  return joinBase(baseUrl, `/stream/${encodeURIComponent(id)}`);
}

export function catalogUrl(baseUrl: string, rowId: string, skip = 0): string {
  const u = new URL(joinBase(baseUrl, `/catalog/${encodeURIComponent(rowId)}`));
  u.searchParams.set("skip", String(skip));
  return u.toString();
}

/** Append settings values as query params verbatim (§8.8). */
export function withSettings(url: string, settings?: SettingsValues): string {
  if (!settings) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(settings)) {
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/**
 * Redact a possibly-tokenized URL for logging (§13–§14: hosts must never
 * ship analytics/crash reports containing a Locked addon's token).
 */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    // Heuristic: token segments are long (>16 chars). Keep route shape.
    const redacted = segs.map((s) => (s.length > 16 ? "{token}" : s));
    u.pathname = "/" + redacted.join("/");
    return u.toString().replaceAll("%7Btoken%7D", "{token}");
  } catch {
    return "{unparseable-url}";
  }
}
