// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Auth attachment per §6.2. Describes HOW the token travels, never WHO may have one.
import type { AuthConfig, AuthRequirement, Manifest } from "./types.js";

export interface RequestShape {
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

/** Build headers/query for one request given the manifest auth block + token. */
export function authForRequest(
  manifest: Pick<Manifest, "type" | "auth">,
  token?: string,
): RequestShape {
  if (manifest.type === "open" || !manifest.auth) return {};
  const auth = manifest.auth as AuthConfig;
  switch (auth.method) {
    case "bearer": {
      if (!token) throw new Error("auth: bearer token required but none provided");
      const header = auth.header ?? "Authorization";
      const scheme = auth.scheme ?? "Bearer";
      return { headers: { [header]: `${scheme} ${token}` } };
    }
    case "api-key": {
      if (!token) throw new Error("auth: api key required but none provided");
      if (auth.header) return { headers: { [auth.header]: token } };
      return { query: { [auth.paramName ?? "api_key"]: token } };
    }
    case "url-token":
    case "signed":
    case "module-key":
      // url-token: credential already lives in baseUrl (§7) — nothing to attach.
      // signed: request signing is author-defined; host passes the secret
      // through out-of-band, helpers intentionally do not implement HMAC here.
      // module-key: handled by module unlock (§9), not HTTP.
      return {};
    default:
      return {};
  }
}

/** Human-readable grant hint (informational only, never enforced). */
export function grantHint(manifest: Pick<Manifest, "auth">): string | null {
  const auth = manifest.auth as AuthConfig | null | undefined;
  if (!auth) return null;
  if (auth.grantUrl) return auth.grantUrl;
  return auth.tokenGrant ?? null;
}

/**
 * Author-defined access conditions (§6.2 `requirements`), normalized to
 * objects. Display-only: hosts surface these at install time (§13) and
 * never enforce them — whatever the author demands (Discord membership,
 * supporter role, purchase, ...) stays between author and user (§6.3).
 */
export function accessRequirements(
  manifest: Pick<Manifest, "type" | "auth">,
): AuthRequirement[] {
  const auth = manifest.auth as AuthConfig | null | undefined;
  if (!auth || !Array.isArray(auth.requirements)) return [];
  return auth.requirements
    .map((r): AuthRequirement | null => {
      if (typeof r === "string") {
        const label = r.trim();
        return label ? { label } : null;
      }
      if (typeof r === "object" && r !== null && typeof r.label === "string" && r.label.trim()) {
        const out: AuthRequirement = { label: r.label.trim() };
        if (typeof r.url === "string" && r.url) out.url = r.url;
        if (typeof r.detail === "string" && r.detail) out.detail = r.detail;
        return out;
      }
      return null;
    })
    .filter((r): r is AuthRequirement => r !== null);
}
