import { describe, it, expect } from "vitest";
import { CascadeResolver, type ContextPathInput } from "../src";

describe("CascadeResolver 5-level merge (DCGP-SPEC.md § 5)", () => {
  it("scalars: deeper level wins", () => {
    const resolver = new CascadeResolver();
    const result = resolver.resolve([
      {
        level: 0,
        source: "global",
        path: { id: "p", name: "Global name", signals: {} },
      },
      {
        level: 3,
        source: "project",
        path: { id: "p", name: "Project name", signals: {} },
      },
    ]);
    expect(result.name).toBe("Project name");
  });

  it("anchors: deep-merged by id (overlay fields override base fields)", () => {
    const resolver = new CascadeResolver();
    const base: ContextPathInput = {
      id: "p",
      name: "p",
      signals: {},
      anchors: [
        { id: "a1", label: "base label", priority: 10, content: "base content" },
      ],
    };
    const overlay: ContextPathInput = {
      id: "p",
      name: "p",
      signals: {},
      anchors: [{ id: "a1", label: "override", priority: 90, content: "override content" }],
    };
    const merged = resolver.resolve([
      { level: 0, source: "base", path: base },
      { level: 4, source: "overlay", path: overlay },
    ]);
    expect(merged.anchors).toHaveLength(1);
    expect(merged.anchors[0]!.label).toBe("override");
    expect(merged.anchors[0]!.priority).toBe(90);
  });

  it("anchors: distinct ids are concatenated", () => {
    const resolver = new CascadeResolver();
    const base: ContextPathInput = {
      id: "p",
      name: "p",
      signals: {},
      anchors: [{ id: "a", label: "A", priority: 10, content: "A" }],
    };
    const overlay: ContextPathInput = {
      id: "p",
      name: "p",
      signals: {},
      anchors: [{ id: "b", label: "B", priority: 20, content: "B" }],
    };
    const merged = resolver.resolve([
      { level: 0, source: "base", path: base },
      { level: 4, source: "overlay", path: overlay },
    ]);
    expect(merged.anchors).toHaveLength(2);
  });

  it("drift rules: concatenated and deduplicated by JSON identity", () => {
    const resolver = new CascadeResolver();
    const rule = {
      sourceDomain: "python",
      pattern: "pip install",
      severity: "error" as const,
      correction: "use npm",
    };
    const base: ContextPathInput = { id: "p", name: "p", signals: {}, driftRules: [rule] };
    const overlay: ContextPathInput = { id: "p", name: "p", signals: {}, driftRules: [rule] };
    const merged = resolver.resolve([
      { level: 0, source: "base", path: base },
      { level: 4, source: "overlay", path: overlay },
    ]);
    expect(merged.driftRules).toHaveLength(1);
  });

  it("throws on empty cascade", () => {
    const resolver = new CascadeResolver();
    expect(() => resolver.resolve([])).toThrow(/empty cascade/);
  });

  it("resolves extends from the registered pool", () => {
    const resolver = new CascadeResolver();
    const parent = resolver.resolve([
      {
        level: 0,
        source: "parent",
        path: {
          id: "parent-id",
          name: "Parent",
          signals: { packages: ["parent-pkg"] },
        },
      },
    ]);
    const registered = new Map([["parent-id", parent]]);
    const child = resolver.resolve(
      [
        {
          level: 3,
          source: "child",
          path: {
            id: "child-id",
            name: "Child",
            extends: "parent-id",
            signals: { packages: ["child-pkg"] },
          },
        },
      ],
      registered,
    );
    // Child wins for its own keys but inherits parent's package signal.
    expect(child.id).toBe("child-id");
    expect(child.signals.packages).toContain("parent-pkg");
  });
});
