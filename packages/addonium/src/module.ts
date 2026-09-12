// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Compiled-module contract per §9. Helpers validate shape + gate order;
// actual sandboxing is host-specific (§9.3/§9.5) and intentionally NOT here.
import type { AddoniumModule, ModuleUnlockContext, Resource } from "./types.js";

const RESOURCE_TO_METHODS: Record<Resource, string[]> = {
  search: ["searchTracks"],
  stream: ["getTrackStreamUrl"],
  catalog: ["getAlbum", "getArtist", "getPlaylist"],
  lyrics: ["getLyrics"],
  library: ["syncLibrary"],
  isrc: ["resolveByIsrc"],
  resolve: ["resolve"],
  settings: [],
  video: [],
};

export function moduleCapabilities(mod: AddoniumModule): Resource[] {
  const declared = mod.manifest.resources ?? [];
  return declared.filter((r) => {
    const methods = RESOURCE_TO_METHODS[r] ?? [];
    // settings/video are flags without a single required method.
    if (methods.length === 0) return true;
    return methods.some((m) => typeof (mod as Record<string, unknown>)[m] === "function");
  });
}

export function moduleHasCapability(mod: AddoniumModule, r: Resource): boolean {
  return moduleCapabilities(mod).includes(r);
}

export function validateModuleShape(input: unknown): string[] {
  const issues: string[] = [];
  if (typeof input !== "object" || input === null) return ["module must be an object"];
  const m = input as Record<string, unknown>;
  const manifest = m["manifest"] as Record<string, unknown> | undefined;
  if (!manifest) return ["module.manifest is required"];
  for (const k of ["addonium", "id", "name", "version"]) {
    if (!manifest[k]) issues.push(`manifest.${k} is required`);
  }
  if (manifest["type"] !== "locked") issues.push('module manifest.type must be "locked" (§9)');
  if (typeof m["unlock"] !== "function") issues.push("module.unlock(key, context) is required (§9.2)");
  return issues;
}

/**
 * Call unlock() and normalize to boolean. Hosts must call this first and
 * treat falsy/throw as "not installed" (§9.3 step 4) — never skip it.
 */
export async function unlockModule(
  mod: AddoniumModule,
  key: string,
  context?: ModuleUnlockContext,
): Promise<boolean> {
  const ok = await mod.unlock(key, context);
  return ok === true;
}
