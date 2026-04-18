import { describe, it, expect } from "vitest";
import {
  DCPBridge,
  CONFIG_TRANSLATION,
  DCP_PACKAGE_NAME,
  DCP_PROJECT_CONFIG_PATH,
  type DcpConfigPatch,
} from "../src";
import { PruneIntensity, type RetentionDirective } from "@dcgp/core";

function dir(intensity: PruneIntensity): RetentionDirective {
  return {
    intensity,
    globalFloor: 0,
    protectedPaths: [],
    reason: "test",
    turn: 1,
    score: 0,
  };
}

describe("DCP bridge (DCGP -> @tarquinen/opencode-dcp translation)", () => {
  it("declares the verified DCP package name", () => {
    expect(DCP_PACKAGE_NAME).toBe("@tarquinen/opencode-dcp");
  });

  it("declares the verified DCP project config path", () => {
    expect(DCP_PROJECT_CONFIG_PATH).toBe(".opencode/dcp.jsonc");
  });

  it("maps every PruneIntensity to a DCP config patch", () => {
    for (const intensity of [
      PruneIntensity.PASSIVE,
      PruneIntensity.TIGHTEN,
      PruneIntensity.AGGRESSIVE,
      PruneIntensity.NUCLEAR,
    ]) {
      const patch = CONFIG_TRANSLATION[intensity];
      expect(patch).toBeDefined();
      expect(patch.turnProtection).toBeDefined();
    }
  });

  it("tightens turnProtection.recentTurns monotonically across intensities", () => {
    const passive = CONFIG_TRANSLATION[PruneIntensity.PASSIVE].turnProtection!.recentTurns!;
    const tighten = CONFIG_TRANSLATION[PruneIntensity.TIGHTEN].turnProtection!.recentTurns!;
    const aggressive = CONFIG_TRANSLATION[PruneIntensity.AGGRESSIVE].turnProtection!.recentTurns!;
    const nuclear = CONFIG_TRANSLATION[PruneIntensity.NUCLEAR].turnProtection!.recentTurns!;
    expect(passive).toBeGreaterThan(tighten);
    expect(tighten).toBeGreaterThan(aggressive);
    expect(aggressive).toBeGreaterThan(nuclear);
  });

  it("always keeps user turns (retained across all intensities)", () => {
    for (const intensity of [
      PruneIntensity.PASSIVE,
      PruneIntensity.TIGHTEN,
      PruneIntensity.AGGRESSIVE,
      PruneIntensity.NUCLEAR,
    ]) {
      expect(CONFIG_TRANSLATION[intensity].turnProtection!.keepUserTurns).toBe(true);
    }
  });

  it("forwards a patch to the registered observer on every directive", () => {
    const bridge = new DCPBridge();
    const received: DcpConfigPatch[] = [];
    bridge.onDirective((patch) => received.push(patch));

    bridge.forward(dir(PruneIntensity.PASSIVE));
    bridge.forward(dir(PruneIntensity.NUCLEAR));

    expect(received).toHaveLength(2);
    expect(received[0]!.turnProtection!.recentTurns).toBe(
      CONFIG_TRANSLATION[PruneIntensity.PASSIVE].turnProtection!.recentTurns,
    );
    expect(received[1]!.turnProtection!.recentTurns).toBe(
      CONFIG_TRANSLATION[PruneIntensity.NUCLEAR].turnProtection!.recentTurns,
    );
  });

  it("no-ops quietly when no observer is registered", () => {
    const bridge = new DCPBridge();
    expect(() => bridge.forward(dir(PruneIntensity.NUCLEAR))).not.toThrow();
  });

  it("absorbs observer exceptions to protect the DCGP loop", () => {
    const bridge = new DCPBridge();
    bridge.onDirective(() => {
      throw new Error("observer boom");
    });
    expect(() => bridge.forward(dir(PruneIntensity.TIGHTEN))).not.toThrow();
  });

  it("translate() returns the same patch for a given intensity", () => {
    const bridge = new DCPBridge();
    const a = bridge.translate(dir(PruneIntensity.AGGRESSIVE));
    const b = bridge.translate(dir(PruneIntensity.AGGRESSIVE));
    expect(a).toBe(b);
  });
});
