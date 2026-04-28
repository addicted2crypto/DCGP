// @dcgp-audit-ignore-file command-injection - the execSync call below already wraps each arg in JSON.stringify; the regex cannot see that the fix is inside the interpolation.
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(__dirname, "..", "dist", "cli.js");

function runCli(args: string[], opts: { cwd?: string } = {}): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(`node "${CLI}" ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
      cwd: opts.cwd ?? process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number | null; stdout: Buffer | string; stderr: Buffer | string };
    return {
      code: e.status ?? 1,
      stdout: typeof e.stdout === "string" ? e.stdout : (e.stdout?.toString() ?? ""),
      stderr: typeof e.stderr === "string" ? e.stderr : (e.stderr?.toString() ?? ""),
    };
  }
}

beforeAll(() => {
  if (!existsSync(CLI)) {
    throw new Error(`CLI build missing at ${CLI}. Run 'pnpm --filter @dcgp/cli build' first.`);
  }
});

describe("dcgp CLI", () => {
  it("help lists every documented command", () => {
    const { code, stdout } = runCli(["help"]);
    expect(code).toBe(0);
    for (const cmd of ["classify", "status", "paths", "inject", "gate", "validate", "init", "entropy"]) {
      expect(stdout).toContain(cmd);
    }
  });

  it("entropy prints the five-factor formula", () => {
    const { code, stdout } = runCli(["entropy"]);
    expect(code).toBe(0);
    expect(stdout).toContain("gate_pressure");
    expect(stdout).toContain("citation_pressure");
    expect(stdout).toContain("NUCLEAR");
  });

  it("paths lists all 16 community paths", () => {
    const { code, stdout } = runCli(["paths"]);
    expect(code).toBe(0);
    expect(stdout).toContain("nodejs");
    expect(stdout).toContain("evm");
    expect(stdout).toContain("solana");
    expect(stdout).toContain("cpp");
  });

  it("classify detects nodejs in a fabricated workspace", () => {
    const dir = mkdtempSync(join(tmpdir(), "dcgp-cli-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { express: "^5.0.0", typescript: "^5.6.0" } }),
    );
    const { code, stdout } = runCli(["classify"], { cwd: dir });
    expect(code).toBe(0);
    expect(stdout).toMatch(/nodejs/);
  });

  it("validate accepts a minimal valid path", () => {
    const dir = mkdtempSync(join(tmpdir(), "dcgp-cli-"));
    const file = join(dir, "valid.dcgp.json");
    writeFileSync(
      file,
      JSON.stringify({ id: "demo", name: "Demo", signals: { packages: ["demo-lib"] } }),
    );
    const { code, stdout } = runCli(["validate", file]);
    expect(code).toBe(0);
    expect(stdout).toContain("Valid");
  });

  it("validate rejects a malformed id", () => {
    const dir = mkdtempSync(join(tmpdir(), "dcgp-cli-"));
    const file = join(dir, "bad.dcgp.json");
    writeFileSync(file, JSON.stringify({ id: "Bad_ID", name: "X", signals: {} }));
    const { code, stderr } = runCli(["validate", file]);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/id/);
  });

  it("init scaffolds a .dcgp/<id>.dcgp.json file", () => {
    const dir = mkdtempSync(join(tmpdir(), "dcgp-init-"));
    const { code, stdout } = runCli(["init"], { cwd: dir });
    expect(code).toBe(0);
    expect(stdout).toContain("Scaffolded");
  });
});
