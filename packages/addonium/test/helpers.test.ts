// Licensed under the Apache License, Version 2.0 (see LICENSE).
import { describe, expect, test } from "bun:test";
import { authForRequest, accessRequirements } from "../src/auth";
import { isClientAllowed, clientIdentity, denyResponse } from "../src/clients";
import { joinBase, redactUrl, withSettings } from "../src/urls";
import { errorFromStatus, shouldFailOver, shouldUninstall } from "../src/errors";
import { compareVersions, shouldCheckForUpdate } from "../src/update";
import { unlockModule, validateModuleShape } from "../src/module";

describe("urls (§7, §8.8)", () => {
  test("token segment is opaque — just prepended", () => {
    expect(joinBase("https://api.example.com/t/abc123", "/search")).toBe(
      "https://api.example.com/t/abc123/search",
    );
  });
  test("settings appended verbatim", () => {
    const u = withSettings("https://x.example/stream/1", { quality: "high", preferOpus: true });
    expect(u).toContain("quality=high");
    expect(u).toContain("preferOpus=true");
  });
  test("redactUrl hides long segments", () => {
    const r = redactUrl("https://api.example.com/t/eyJhbGciOiJIUzI1NiJ9abcdef/search?q=x");
    expect(r).not.toContain("eyJhbGci");
    expect(r).toContain("{token}");
  });
});

describe("auth (§6.2)", () => {
  test("bearer attaches header", () => {
    const out = authForRequest(
      { type: "locked", auth: { method: "bearer" } },
      "tok",
    );
    expect(out.headers?.["Authorization"]).toBe("Bearer tok");
  });
  test("url-token attaches nothing (credential is the URL)", () => {
    expect(authForRequest({ type: "locked", auth: { method: "url-token" } }, "tok")).toEqual({});
  });
  test("bearer without token throws", () => {
    expect(() => authForRequest({ type: "locked", auth: { method: "bearer" } })).toThrow();
  });
  test("requirements normalize + stay display-only (§6.2)", () => {
    expect(accessRequirements({ type: "open", auth: null })).toEqual([]);
    const out = accessRequirements({
      type: "locked",
      auth: {
        method: "url-token",
        tokenGrant: "manual",
        requirements: [
          {
            label: "Join the Example Discord to request a token",
            url: "https://discord.gg/example",
          },
          "Tokens are per-member — do not share your link.",
          "   ",
        ],
      },
    });
    expect(out).toEqual([
      {
        label: "Join the Example Discord to request a token",
        url: "https://discord.gg/example",
      },
      { label: "Tokens are per-member — do not share your link." },
    ]);
    // Requirements never affect request attachment.
    expect(
      authForRequest(
        { type: "locked", auth: { method: "url-token", requirements: ["Join x"] } },
        "tok",
      ),
    ).toEqual({});
  });
});

describe("allowlist (§10)", () => {
  const mod: { clients: { enforced: boolean; allow: string[]; identify: "header"; header: string } } = {
    clients: {
      enforced: true,
      allow: ["com.myplayer.official"],
      identify: "header",
      header: "X-Addonium-Client",
    },
  };
  test("denies unknown, allows listed", () => {
    expect(isClientAllowed(mod, "com.evil.fork")).toBe(false);
    expect(isClientAllowed(mod, "com.myplayer.official")).toBe(true);
  });
  test("off by default", () => {
    expect(isClientAllowed({ clients: null })).toBe(true);
    expect(isClientAllowed({})).toBe(true);
  });
  test("identity + deny shape", () => {
    expect(clientIdentity(mod, "com.myplayer.official")).toEqual({
      headers: { "X-Addonium-Client": "com.myplayer.official" },
    });
    expect(denyResponse(mod).status).toBe(403);
  });
});

describe("errors (§15)", () => {
  test("410 → uninstall, 429/5xx → failover", () => {
    expect(errorFromStatus(410).code).toBe("GONE");
    expect(shouldUninstall(410)).toBe(true);
    expect(shouldFailOver(503)).toBe(true);
    expect(shouldFailOver(200)).toBe(false);
  });
});

describe("updates (§12)", () => {
  test("compare + due logic", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    const m = { update: { manifestUrl: "https://x.example/manifest.json", checkInterval: 60 } };
    expect(shouldCheckForUpdate(m, null).due).toBe(true);
    expect(shouldCheckForUpdate(m, Date.now()).due).toBe(false);
  });
});

describe("module (§9)", () => {
  test("shape validation + unlock gating", async () => {
    const mod = {
      manifest: { addonium: "1.0", id: "com.x.y", name: "Y", version: "1.0.0", type: "locked" as const },
      unlock: async (k: string) => k === "good",
    };
    expect(validateModuleShape(mod)).toEqual([]);
    expect(await unlockModule(mod, "good")).toBe(true);
    expect(await unlockModule(mod, "bad")).toBe(false);
    expect(validateModuleShape({})).not.toEqual([]);
  });
});
