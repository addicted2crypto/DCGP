import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DCGPRuntime, createPlugin, dispatch } from "../src";
import { PruneIntensity } from "@dcgp/core";

function tempWorkspace(contents: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "dcgp-opencode-"));
  for (const [rel, body] of Object.entries(contents)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  return dir;
}

describe("DCGPRuntime end-to-end", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = tempWorkspace({
      "package.json": JSON.stringify({
        dependencies: { express: "^5.0.0", typescript: "^5.6.0" },
      }),
    });
  });

  it("classifies a Node.js workspace on first classify()", () => {
    const rt = new DCGPRuntime({ workspacePath: workspace });
    const result = rt.classify(0);
    expect(result.domain).toBe("nodejs");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("processes a clean turn and emits a PASSIVE directive", () => {
    const rt = new DCGPRuntime({ workspacePath: workspace });
    rt.classify(0);
    const result = rt.processTurn({
      turn: 1,
      assistantMessage: "const x = 1",
    });
    expect(result.directive.intensity).toBe(PruneIntensity.PASSIVE);
    expect(result.gateViolations).toHaveLength(0);
  });

  it("detects a gate violation and records it in SessionState", () => {
    const rt = new DCGPRuntime({ workspacePath: workspace });
    rt.classify(0);
    const result = rt.processTurn({
      turn: 1,
      assistantMessage: "var foo = 42",
    });
    expect(result.gateViolations.length).toBeGreaterThan(0);
    const state = rt.snapshotState();
    expect(state.stats.totalGateViolations).toBeGreaterThan(0);
  });

  it("detects cross-domain drift (pip install in a Node.js workspace)", () => {
    const rt = new DCGPRuntime({ workspacePath: workspace });
    rt.classify(0);
    const result = rt.processTurn({
      turn: 1,
      assistantMessage: "Run `pip install requests`",
    });
    expect(result.driftEvents.length).toBeGreaterThan(0);
    expect(result.driftEvents[0]!.sourceDomain).toBe("python");
  });
});

describe("Slash commands", () => {
  it("/dcgp help returns the command list", () => {
    const workspace = tempWorkspace();
    const rt = new DCGPRuntime({ workspacePath: workspace });
    const out = dispatch(rt, "/dcgp help");
    expect(out).toContain("DCGP slash commands");
    expect(out).toContain("status");
    expect(out).toContain("entropy");
  });

  it("/dcgp status renders an entropy bar and directive", () => {
    const workspace = tempWorkspace({
      "package.json": JSON.stringify({ dependencies: { express: "^5.0.0" } }),
    });
    const rt = new DCGPRuntime({ workspacePath: workspace });
    rt.classify(0);
    rt.processTurn({ turn: 1, assistantMessage: "healthy" });
    const out = dispatch(rt, "/dcgp status");
    expect(out).toContain("Domain");
    expect(out).toContain("Entropy");
    expect(out).toContain("Directive");
  });

  it("/dcgp paths lists all registered paths", () => {
    const rt = new DCGPRuntime({ workspacePath: tempWorkspace() });
    const out = dispatch(rt, "/dcgp paths");
    expect(out).toContain("nodejs");
    expect(out).toContain("python");
    expect(out).toContain("rust");
  });
});

describe("Plugin hooks lifecycle", () => {
  it("hooks refuse to run before onSessionStart", () => {
    const plugin = createPlugin();
    expect(() => plugin.onAssistantMessage("msg", 1)).toThrow(/onSessionStart/);
  });

  it("full lifecycle: start -> user -> assistant -> end", async () => {
    const workspace = tempWorkspace({
      "package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
    });
    const plugin = createPlugin();
    await plugin.onSessionStart(workspace, "test-session");
    plugin.onUserMessage("how do I use hooks?", 1);
    const result = plugin.onAssistantMessage(
      "use useState and useEffect in a function component",
      1,
    );
    expect(result).not.toBeNull();
    expect(result!.directive).toBeDefined();
    plugin.onTurnEnd(1);
  });
});
