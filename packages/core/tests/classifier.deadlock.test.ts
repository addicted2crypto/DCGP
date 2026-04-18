import { describe, it, expect } from "vitest";
import {
  DomainClassifier,
  SHIFT_COOLDOWN_TURNS,
  definePath,
  type ContextPath,
} from "../src";
import type { Fingerprint } from "../src/classifier/FingerprintEngine";

function fingerprint(pkgs: string[] = []): Fingerprint {
  return {
    workspacePath: "/tmp/test",
    packages: new Set(pkgs),
    files: new Set<string>(),
    envVars: new Set<string>(),
    gitBranch: null,
    tools: new Set<string>(),
    generatedAt: Date.now(),
  };
}

function path(id: string, pkgs: string[]): ContextPath {
  return definePath({
    id,
    name: id,
    signals: { packages: pkgs },
  });
}

describe("DomainClassifier deadlock suppression (Failure Mode #4)", () => {
  it("SHIFT_COOLDOWN_TURNS is 3", () => {
    expect(SHIFT_COOLDOWN_TURNS).toBe(3);
  });

  it("allows a one-way shift A -> B", () => {
    const classifier = new DomainClassifier();
    classifier.register(path("alpha", ["alpha-lib"]));
    classifier.register(path("beta", ["beta-lib"]));

    // Turn 1: classify as alpha.
    const r1 = classifier.classify(fingerprint(["alpha-lib"]), 1);
    expect(r1.domain).toBe("alpha");
    expect(r1.shiftSuppressed).toBe(false);

    // Turn 2: classify as beta.
    const r2 = classifier.classify(fingerprint(["beta-lib"]), 2);
    expect(r2.domain).toBe("beta");
    expect(r2.shiftSuppressed).toBe(false);
  });

  it("suppresses A -> B -> A oscillation within cooldown", () => {
    const classifier = new DomainClassifier();
    classifier.register(path("alpha", ["alpha-lib"]));
    classifier.register(path("beta", ["beta-lib"]));

    classifier.classify(fingerprint(["alpha-lib"]), 1);   // -> alpha
    classifier.classify(fingerprint(["beta-lib"]), 2);    // -> beta
    const back = classifier.classify(fingerprint(["alpha-lib"]), 3); // would be -> alpha

    expect(back.shiftSuppressed).toBe(true);
    expect(back.domain).toBe("beta");
  });

  it("allows A -> B -> A after cooldown expires", () => {
    const classifier = new DomainClassifier();
    classifier.register(path("alpha", ["alpha-lib"]));
    classifier.register(path("beta", ["beta-lib"]));

    classifier.classify(fingerprint(["alpha-lib"]), 1);
    classifier.classify(fingerprint(["beta-lib"]), 2);
    const back = classifier.classify(
      fingerprint(["alpha-lib"]),
      2 + SHIFT_COOLDOWN_TURNS + 1,
    );

    expect(back.shiftSuppressed).toBe(false);
    expect(back.domain).toBe("alpha");
  });
});
