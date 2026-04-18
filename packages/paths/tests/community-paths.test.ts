import { describe, it, expect } from "vitest";
import { ALL_PATHS, PATH_CATEGORIES } from "../src";
import { definePath } from "@dcgp/core";

describe("@dcgp/paths - community path invariants (fail closed)", () => {
  it("ships exactly 16 paths", () => {
    expect(ALL_PATHS).toHaveLength(16);
  });

  it("every path has a unique id", () => {
    const ids = ALL_PATHS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every path id matches the lowercase-hyphen pattern", () => {
    for (const path of ALL_PATHS) {
      expect(path.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("every path declares at least one signal category", () => {
    for (const path of ALL_PATHS) {
      const s = path.signals;
      const hasAny =
        (s.packages?.length ?? 0) > 0 ||
        (s.files?.length ?? 0) > 0 ||
        (s.keywords?.length ?? 0) > 0 ||
        (s.tools?.length ?? 0) > 0 ||
        (s.env?.length ?? 0) > 0 ||
        (s.gitBranch?.length ?? 0) > 0;
      expect(hasAny, `path ${path.id} declares no signals`).toBe(true);
    }
  });

  it("every path has at least one anchor with priority >= 70", () => {
    for (const path of ALL_PATHS) {
      const hasHighPriorityAnchor = path.anchors.some((a) => a.priority >= 70);
      expect(hasHighPriorityAnchor, `path ${path.id} has no high-priority anchor`).toBe(true);
    }
  });

  it("every gate has a compiled RegExp pattern", () => {
    for (const path of ALL_PATHS) {
      for (const gate of path.gates) {
        expect(gate.pattern).toBeInstanceOf(RegExp);
      }
    }
  });

  it("every drift rule has a compiled RegExp pattern", () => {
    for (const path of ALL_PATHS) {
      for (const rule of path.driftRules) {
        expect(rule.pattern).toBeInstanceOf(RegExp);
      }
    }
  });

  it("every path can be re-validated through definePath (round-trip)", () => {
    for (const path of ALL_PATHS) {
      expect(() =>
        definePath({
          id: path.id,
          version: path.version,
          name: path.name,
          description: path.description,
          signals: path.signals,
          anchors: path.anchors,
          gates: path.gates,
          driftRules: path.driftRules,
          compression: path.compression,
        }),
      ).not.toThrow();
    }
  });

  it("PATH_CATEGORIES buckets cover every path exactly once", () => {
    const covered = new Set<string>();
    for (const bucket of Object.values(PATH_CATEGORIES)) {
      for (const path of bucket) {
        expect(covered.has(path.id), `path ${path.id} listed in multiple categories`).toBe(false);
        covered.add(path.id);
      }
    }
    expect(covered.size).toBe(ALL_PATHS.length);
  });

  it("every path provides compression.neverPrune or summarizeAs", () => {
    for (const path of ALL_PATHS) {
      const c = path.compression;
      const hasGuidance = (c.neverPrune?.length ?? 0) > 0 || c.summarizeAs !== undefined;
      expect(hasGuidance, `path ${path.id} lacks compression guidance`).toBe(true);
    }
  });
});
