import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FingerprintEngine } from "../src";

describe("Security: symlink escape guard in FingerprintEngine", () => {
  it("does not follow a symlink pointing outside the workspace", () => {
    const workspace = mkdtempSync(join(tmpdir(), "dcgp-ws-"));
    const outside = mkdtempSync(join(tmpdir(), "dcgp-outside-"));
    // Seed the outside with a sentinel file the classifier should never see.
    writeFileSync(join(outside, "SECRET-LEAK.txt"), "should not be scanned", "utf8");

    // Also seed the workspace with a legit file so classification still works.
    writeFileSync(join(workspace, "package.json"), JSON.stringify({ dependencies: { express: "^5.0.0" } }), "utf8");

    // Create a symlink inside the workspace that targets the outside dir.
    const linkPath = join(workspace, "sneaky-link");
    try {
      symlinkSync(outside, linkPath, "dir");
    } catch {
      // Symlink creation requires admin on Windows; skip if unsupported.
      return;
    }

    const fp = new FingerprintEngine(workspace).fingerprint();

    // The sentinel must NOT appear in the scanned files.
    const sentinelSeen = [...fp.files].some((f) => f.includes("SECRET-LEAK"));
    expect(sentinelSeen).toBe(false);

    // And the symlink entry itself should not be iterated as a directory.
    const linkAsDirEntries = [...fp.files].filter((f) => f.startsWith("sneaky-link/"));
    expect(linkAsDirEntries).toHaveLength(0);

    // Legit workspace file is still scanned.
    expect([...fp.files].some((f) => f === "package.json")).toBe(true);
  });

  it("does not include a symlink FILE in the scan output", () => {
    const workspace = mkdtempSync(join(tmpdir(), "dcgp-ws-"));
    writeFileSync(join(workspace, "real.ts"), "// real", "utf8");
    try {
      symlinkSync(join(workspace, "real.ts"), join(workspace, "link.ts"), "file");
    } catch {
      return; // skip on Windows without symlink privilege
    }

    const fp = new FingerprintEngine(workspace).fingerprint();
    const files = [...fp.files];
    expect(files).toContain("real.ts");
    expect(files).not.toContain("link.ts");
  });
});
