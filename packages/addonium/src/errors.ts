// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Error taxonomy per §15.

export type AddoniumErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "GONE"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "UNLOCK_FAILED";

export class AddoniumError extends Error {
  code: AddoniumErrorCode;
  status?: number;
  retryAfter?: number;

  constructor(code: AddoniumErrorCode, message: string, opts?: { status?: number; retryAfter?: number }) {
    super(message);
    this.name = "AddoniumError";
    this.code = code;
    this.status = opts?.status;
    this.retryAfter = opts?.retryAfter;
  }
}

export function errorFromStatus(
  status: number,
  message?: string,
  retryAfter?: number,
): AddoniumError {
  const msg = message ?? `request failed with status ${status}`;
  if (status === 400) return new AddoniumError("BAD_REQUEST", msg, { status });
  if (status === 401) return new AddoniumError("UNAUTHORIZED", msg, { status });
  if (status === 403) return new AddoniumError("FORBIDDEN", msg, { status });
  if (status === 404) return new AddoniumError("NOT_FOUND", msg, { status });
  if (status === 410)
    return new AddoniumError("GONE", msg || "addon discontinued", { status });
  if (status === 429)
    return new AddoniumError("RATE_LIMITED", msg, { status, retryAfter });
  if (status >= 500) return new AddoniumError("SERVER_ERROR", msg, { status });
  return new AddoniumError("SERVER_ERROR", msg, { status });
}

/** Compiled modules throw { code, message } instead of HTTP statuses (§15). */
export function errorFromModuleCode(
  code: "UNLOCK_FAILED" | "NOT_FOUND" | "RATE_LIMITED" | string,
  message?: string,
): AddoniumError {
  if (code === "UNLOCK_FAILED")
    return new AddoniumError("UNLOCK_FAILED", message ?? "module unlock failed");
  if (code === "NOT_FOUND")
    return new AddoniumError("NOT_FOUND", message ?? "not found", { status: 404 });
  if (code === "RATE_LIMITED")
    return new AddoniumError("RATE_LIMITED", message ?? "rate limited", { status: 429 });
  return new AddoniumError("SERVER_ERROR", message ?? String(code));
}

/** 410 means "uninstall/hide"; 5xx/429 mean "fail over to another source". */
export function shouldUninstall(status: number): boolean {
  return status === 410;
}

export function shouldFailOver(status: number): boolean {
  return status === 429 || status >= 500;
}
