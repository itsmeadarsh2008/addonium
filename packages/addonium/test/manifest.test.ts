// Licensed under the Apache License, Version 2.0 (see LICENSE).
import { describe, expect, test } from "bun:test";
import {
  isLocked,
  isOpen,
  isSpecMajorCompatible,
  parseManifest,
  supportsResource,
  validateManifest,
} from "../src/manifest";
import openAddon from "../examples/open-addon.json";
import lockedUrlToken from "../examples/locked-url-token.json";
import lockedModule from "../examples/locked-module.json";

describe("manifest", () => {
  test("§17.1 open example validates", () => {
    expect(validateManifest(openAddon)).toEqual([]);
    const m = parseManifest(openAddon);
    expect(isOpen(m)).toBe(true);
    expect(isLocked(m)).toBe(false);
    expect(supportsResource(m, "search")).toBe(true);
    expect(supportsResource(m, "lyrics")).toBe(false);
  });

  test("§17.2 locked url-token example validates", () => {
    expect(validateManifest(lockedUrlToken)).toEqual([]);
    expect(isLocked(parseManifest(lockedUrlToken))).toBe(true);
  });

  test("§17.3 locked module example validates without baseUrl", () => {
    expect(validateManifest(lockedModule)).toEqual([]);
  });

  test("locked without auth is rejected (§16 allOf)", () => {
    const issues = validateManifest({
      addonium: "1.0",
      id: "com.example.x",
      name: "X",
      version: "1.0.0",
      type: "locked",
      auth: null,
    });
    expect(issues.some((i) => i.path === "auth")).toBe(true);
  });

  test("open with non-null auth is rejected", () => {
    const issues = validateManifest({
      ...(openAddon as object),
      auth: { method: "bearer" },
    });
    expect(issues.some((i) => i.path === "auth")).toBe(true);
  });

  test("http addon without baseUrl is rejected", () => {
    const { baseUrl: _omit, ...rest } = openAddon as Record<string, unknown>;
    void _omit;
    expect(validateManifest(rest).some((i) => i.path === "baseUrl")).toBe(true);
  });

  test("spec major compat (§12.1)", () => {
    expect(isSpecMajorCompatible("1.0")).toBe(true);
    expect(isSpecMajorCompatible("2.0")).toBe(false);
  });
});
