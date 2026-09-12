// Licensed under the Apache License, Version 2.0 (see LICENSE).
import type { Manifest, Resource } from "./types.js";

const SPEC_MAJOR = "1";
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+/;
const SPEC_RE = /^[0-9]+\.[0-9]+$/;
const ID_RE = /^[a-z0-9.-]+$/;

export interface ManifestIssue {
  path: string;
  message: string;
}

export function isOpen(m: Pick<Manifest, "type">): boolean {
  return m.type === "open";
}

export function isLocked(m: Pick<Manifest, "type">): boolean {
  return m.type === "locked";
}

export function supportsResource(
  m: Pick<Manifest, "resources">,
  r: Resource,
): boolean {
  return Array.isArray(m.resources) && m.resources.includes(r);
}

/** Structural validation mirroring §5.1 + §16 (not a full JSON-Schema engine). */
export function validateManifest(input: unknown): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  if (typeof input !== "object" || input === null) {
    return [{ path: "", message: "manifest must be an object" }];
  }
  const m = input as Record<string, unknown>;
  const req = ["addonium", "id", "name", "version", "type"] as const;
  for (const k of req) {
    if (m[k] === undefined || m[k] === null || m[k] === "") {
      issues.push({ path: k, message: `${k} is required` });
    }
  }
  if (typeof m["addonium"] === "string" && !SPEC_RE.test(m["addonium"])) {
    issues.push({ path: "addonium", message: "addonium must match MAJOR.MINOR" });
  }
  if (typeof m["id"] === "string" && !ID_RE.test(m["id"])) {
    issues.push({ path: "id", message: "id must match ^[a-z0-9.-]+$" });
  }
  if (typeof m["name"] === "string" && (m["name"].length < 1 || m["name"].length > 80)) {
    issues.push({ path: "name", message: "name must be 1..80 chars" });
  }
  if (typeof m["version"] === "string" && !SEMVER_RE.test(m["version"])) {
    issues.push({ path: "version", message: "version must be SemVer MAJOR.MINOR.PATCH" });
  }
  if (m["type"] !== "open" && m["type"] !== "locked") {
    issues.push({ path: "type", message: 'type must be "open" or "locked"' });
  }
  // §16 allOf: locked requires non-null auth; open requires null/absent auth.
  if (m["type"] === "locked") {
    const auth = m["auth"] as Record<string, unknown> | null | undefined;
    if (auth === null || auth === undefined) {
      issues.push({ path: "auth", message: 'locked addons require a non-null auth block' });
    } else if (typeof auth["method"] !== "string") {
      issues.push({ path: "auth.method", message: "auth.method is required" });
    }
  }
  if (m["type"] === "open" && m["auth"] !== null && m["auth"] !== undefined) {
    issues.push({ path: "auth", message: 'open addons must use auth: null (or omit it)' });
  }
  // baseUrl required unless distribution is ["module"] only (§5.1).
  const dist = m["distribution"];
  const moduleOnly =
    Array.isArray(dist) && dist.length === 1 && dist[0] === "module";
  if (!moduleOnly && typeof m["baseUrl"] !== "string") {
    issues.push({
      path: "baseUrl",
      message: 'baseUrl is required unless distribution is ["module"] only',
    });
  }
  if (
    typeof m["description"] === "string" &&
    m["description"].length > 300
  ) {
    issues.push({ path: "description", message: "description must be ≤300 chars" });
  }
  return issues;
}

/** Parse + validate; throws an Error listing all issues. */
export function parseManifest(input: unknown): Manifest {
  const issues = validateManifest(input);
  if (issues.length > 0) {
    throw new Error(
      `invalid manifest: ${issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("; ")}`,
    );
  }
  return input as Manifest;
}

/** Hosts should refuse manifests whose spec major they don't implement (§12.1). */
export function isSpecMajorCompatible(manifestVersion: string): boolean {
  const major = manifestVersion.split(".")[0];
  return major === SPEC_MAJOR;
}

export function defaultDistribution(m: Pick<Manifest, "distribution">): Array<"manifest" | "module"> {
  return m.distribution ?? ["manifest"];
}

export function storesData(m: Pick<Manifest, "storesData">): boolean {
  return m.storesData === true;
}
