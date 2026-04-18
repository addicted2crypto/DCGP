import { describe, it, expect } from "vitest";
import {
  DomainClassifier,
  COLLISION_DELTA,
  definePath,
  type ContextPath,
} from "../src";
import type { Fingerprint } from "../src/classifier/FingerprintEngine";

function fingerprint(over: Partial<Fingerprint> = {}): Fingerprint {
  return {
    workspacePath: "/tmp/test",
    packages: new Set<string>(),
    files: new Set<string>(),
    envVars: new Set<string>(),
    gitBranch: null,
    tools: new Set<string>(),
    generatedAt: Date.now(),
    ...over,
  };
}

function path(id: string, signals: Partial<ContextPath["signals"]>): ContextPath {
  return definePath({
    id,
    name: id,
    signals: signals as ContextPath["signals"],
  });
}

describe("DomainClassifier collision detection (Failure Mode #1)", () => {
  it("COLLISION_DELTA is 0.10", () => {
    expect(COLLISION_DELTA).toBe(0.1);
  });

  it("flags collision when top two confidences differ by < COLLISION_DELTA", () => {
    const classifier = new DomainClassifier();
    classifier.register(path("alpha", { packages: ["alpha"] }));
    classifier.register(path("beta", { packages: ["alpha"] })); // same signal, same score
    const fp = fingerprint({ packages: new Set(["alpha"]) });
    const result = classifier.classify(fp);
    expect(result.collision).toBe(true);
  });

  it("does NOT flag collision when the top is clearly dominant", () => {
    const classifier = new DomainClassifier();
    classifier.register(
      path("dominant", {
        packages: ["lib-a", "lib-b", "lib-c"],
        files: ["src/dominant.ts"],
      }),
    );
    classifier.register(path("weak", { keywords: ["only-keyword"] }));
    const fp = fingerprint({
      packages: new Set(["lib-a", "lib-b", "lib-c"]),
      files: new Set(["src/dominant.ts"]),
    });
    const result = classifier.classify(fp);
    expect(result.collision).toBe(false);
  });

  it("returns confidence -1 when no path clears threshold", () => {
    const classifier = new DomainClassifier();
    classifier.register(path("unused", { packages: ["never-fires"] }));
    const fp = fingerprint();
    const result = classifier.classify(fp);
    expect(result.domain).toBeNull();
    expect(result.confidence).toBe(-1);
  });
});
