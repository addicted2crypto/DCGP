// @dcgp-audit-ignore-file * - this file's prose / fixtures intentionally contain patterns the audit rules detect.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  hardcodedCredentialsRule,
  commandInjectionRule,
  predictableRandomnessRule,
  testTheaterRule,
  typeSafetyBypassesRule,
  regexRedosRiskRule,
  stubMarkersRule,
  commentDensityRule,
} from "../src/rules";
import type { Rule, RuleContext } from "../src/types";

const FIXTURE_DIR = join(__dirname, "fixtures");

function loadFixture(category: "bad" | "good", name: string): string {
  return readFileSync(join(FIXTURE_DIR, category, name), "utf8");
}

function runRegex(rule: Rule, file: string, source: string) {
  const ctx: RuleContext = {
    file,
    source,
    tsAst: null,
    ignoreDirectives: [],
  };
  return rule.regex(ctx);
}

describe("Rule fixtures (bad/) trigger their target rule", () => {
  it("stub-markers fires on TODO/FIXME/throw not implemented", () => {
    const findings = runRegex(stubMarkersRule, "src/x.ts", loadFixture("bad", "stub-markers.ts.txt"));
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.every((f) => f.ruleId === "stub-markers")).toBe(true);
    expect(findings.some((f) => f.message.includes("TODO"))).toBe(true);
    expect(findings.some((f) => f.message.includes("FIXME"))).toBe(true);
  });

  it("hardcoded-credentials fires on multiple key shapes", () => {
    const findings = runRegex(
      hardcodedCredentialsRule,
      "src/x.ts",
      loadFixture("bad", "hardcoded-credentials.ts.txt"),
    );
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.every((f) => f.severity === "critical")).toBe(true);
    const ids = findings.map((f) => f.message);
    expect(ids.some((m) => m.includes("openai-key"))).toBe(true);
    expect(ids.some((m) => m.includes("aws-access-key"))).toBe(true);
  });

  it("command-injection fires on interpolated execSync calls", () => {
    const findings = runRegex(
      commandInjectionRule,
      "src/x.ts",
      loadFixture("bad", "command-injection.ts.txt"),
    );
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.every((f) => f.ruleId === "command-injection")).toBe(true);
  });

  it("test-theater fires on literal-tautology + skip + todo", () => {
    const findings = runRegex(
      testTheaterRule,
      "src/x.test.ts",
      loadFixture("bad", "test-theater.test.ts.txt"),
    );
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.some((f) => f.message.includes("literal"))).toBe(true);
    expect(findings.some((f) => f.message.includes(".skip"))).toBe(true);
  });

  it("type-safety-bypasses fires on as any / @ts-ignore / : any", () => {
    const findings = runRegex(
      typeSafetyBypassesRule,
      "src/x.ts",
      loadFixture("bad", "type-safety-bypasses.ts.txt"),
    );
    expect(findings.length).toBeGreaterThanOrEqual(4);
    expect(findings.every((f) => f.ruleId === "type-safety-bypasses")).toBe(true);
  });

  it("predictable-randomness fires on Math.random() in security context", () => {
    const findings = runRegex(
      predictableRandomnessRule,
      "src/x.ts",
      loadFixture("bad", "predictable-randomness.ts.txt"),
    );
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.every((f) => f.severity === "error")).toBe(true);
  });

  it("regex-redos-risk fires on uncapped new RegExp + nested-quantifier literal", () => {
    const findings = runRegex(
      regexRedosRiskRule,
      "src/x.ts",
      loadFixture("bad", "regex-redos.ts.txt"),
    );
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.every((f) => f.ruleId === "regex-redos-risk")).toBe(true);
  });

  it("comment-density fires on >30% comment ratio", () => {
    const findings = runRegex(
      commentDensityRule,
      "src/x.ts",
      loadFixture("bad", "comment-density.ts.txt"),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]!.severity).toBe("info");
  });
});

describe("Rule fixtures (good/clean.ts) do not trigger any rule", () => {
  const cleanSource = loadFixture("good", "clean.ts.txt");
  const allRules: Rule[] = [
    hardcodedCredentialsRule,
    commandInjectionRule,
    predictableRandomnessRule,
    typeSafetyBypassesRule,
    regexRedosRiskRule,
    stubMarkersRule,
    commentDensityRule,
  ];
  // test-theater excluded - it requires a *.test.* filename, and clean.ts isn't one.

  for (const rule of allRules) {
    it(`${rule.id} produces zero findings on clean source`, () => {
      const findings = runRegex(rule, "src/clean.ts", cleanSource);
      expect(findings).toHaveLength(0);
    });
  }
});
