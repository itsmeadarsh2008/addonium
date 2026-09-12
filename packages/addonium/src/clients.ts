// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Client allowlisting per §10. Courtesy contract, not a crypto guarantee (§14).
import type { ClientsConfig, Manifest } from "./types.js";

export function allowlistEnforced(m: Pick<Manifest, "clients">): boolean {
  const c = m.clients as ClientsConfig | null | undefined;
  return c?.enforced === true;
}

/** Server-side check: is this clientId permitted? Defaults to allow when off. */
export function isClientAllowed(
  manifest: Pick<Manifest, "clients">,
  clientId?: string,
): boolean {
  const c = manifest.clients as ClientsConfig | null | undefined;
  if (!c || c.enforced !== true) return true;
  if (!clientId) return false;
  return Array.isArray(c.allow) && c.allow.includes(clientId);
}

/** Client-side: header/query fragment identifying this host build. */
export function clientIdentity(
  manifest: Pick<Manifest, "clients">,
  clientId: string,
): { headers?: Record<string, string>; query?: Record<string, string> } {
  const c = (manifest.clients ?? {}) as ClientsConfig;
  const mode = c.identify ?? "header";
  if (mode === "queryParam") return { query: { client: clientId } };
  if (mode === "userAgent") return {}; // conveyed via User-Agent by the HTTP layer
  return { headers: { [c.header ?? "X-Addonium-Client"]: clientId } };
}

export function denyResponse(manifest: Pick<Manifest, "clients">): {
  status: number;
  message: string;
} {
  const c = (manifest.clients ?? {}) as ClientsConfig;
  return {
    status: c.onDeny?.status ?? 403,
    message:
      c.onDeny?.message ?? "This client is not permitted to use this addon.",
  };
}
