/**
 * FingerprintEngine - Step 1 of the 7-step loop.
 *
 * Synchronous workspace scan. Zero shell calls. 30s TTL cache.
 * Parses ecosystem manifests when present; reads .git/HEAD directly (no
 * shelling to git). DCGP-SPEC.md § 4 Step 1.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Directories always skipped during file walks. Exported as part of the
 * public API because third-party implementations must replicate this list
 * to match classification behavior.
 */
export const ALWAYS_IGNORE: readonly string[] = [
  "node_modules",
  "dist",
  ".turbo",
  ".next",
  ".git",
  "build",
  "out",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".gradle",
  ".idea",
  ".vscode",
];

const DEFAULT_TTL_MS = 30_000;
const MAX_FILE_SCAN_DEPTH = 4;
const MAX_FILES_SCANNED = 2000;

export interface Fingerprint {
  readonly workspacePath: string;
  readonly packages: ReadonlySet<string>;
  readonly files: ReadonlySet<string>;
  readonly envVars: ReadonlySet<string>;
  readonly gitBranch: string | null;
  readonly tools: ReadonlySet<string>;
  readonly generatedAt: number;
}

export interface FingerprintEngineOptions {
  readonly ttlMs?: number;
}

export class FingerprintEngine {
  private readonly workspacePath: string;
  private readonly ttlMs: number;
  private cached: Fingerprint | null = null;

  constructor(workspacePath: string, options: FingerprintEngineOptions = {}) {
    this.workspacePath = workspacePath;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  fingerprint(force = false): Fingerprint {
    const now = Date.now();
    if (!force && this.cached !== null && now - this.cached.generatedAt < this.ttlMs) {
      return this.cached;
    }
    this.cached = this.scan();
    return this.cached;
  }

  invalidate(): void {
    this.cached = null;
  }

  /* ── Internal scan ──────────────────────────────────────────────────── */

  private scan(): Fingerprint {
    const packages = new Set<string>();
    const files = new Set<string>();
    const envVars = new Set<string>();
    const tools = new Set<string>();

    this.scanPackageJson(this.workspacePath, packages);
    this.scanPyprojectToml(this.workspacePath, packages);
    this.scanCargoToml(this.workspacePath, packages);
    this.scanGoMod(this.workspacePath, packages);
    this.scanDotnetCsproj(this.workspacePath, packages);
    this.scanPodfile(this.workspacePath, packages);
    this.scanBuildGradle(this.workspacePath, packages);

    this.scanEnvFilenames(this.workspacePath, envVars);

    this.walkFiles(this.workspacePath, this.workspacePath, files, 0);

    const gitBranch = this.readGitBranch(this.workspacePath);

    return {
      workspacePath: this.workspacePath,
      packages,
      files,
      envVars,
      gitBranch,
      tools,
      generatedAt: Date.now(),
    };
  }

  private safeReadFile(path: string): string | null {
    try {
      if (!existsSync(path)) return null;
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  }

  private scanPackageJson(dir: string, out: Set<string>): void {
    const content = this.safeReadFile(join(dir, "package.json"));
    if (content === null) return;
    try {
      const parsed = JSON.parse(content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
        const deps = parsed[field];
        if (deps) {
          for (const name of Object.keys(deps)) out.add(name);
        }
      }
    } catch {
      // Corrupt package.json - ignore rather than throw. Classifier will
      // simply see fewer signals.
    }
  }

  private scanPyprojectToml(dir: string, out: Set<string>): void {
    const content = this.safeReadFile(join(dir, "pyproject.toml"));
    if (content === null) return;
    // Extract names from [project.dependencies] and tool.poetry.dependencies.
    // Minimal TOML parsing - we're looking for "name = " or "name" as a key.
    const depLines = content.match(/^(?:\s*)([A-Za-z0-9_.-]+)\s*[=>~<]/gm);
    if (depLines) {
      for (const line of depLines) {
        const match = line.match(/([A-Za-z0-9_.-]+)/);
        if (match && match[1] && !["python", "name", "version", "description"].includes(match[1])) {
          out.add(match[1]);
        }
      }
    }
  }

  private scanCargoToml(dir: string, out: Set<string>): void {
    const content = this.safeReadFile(join(dir, "Cargo.toml"));
    if (content === null) return;
    const depSections = content.match(/\[dependencies\][\s\S]*?(?=\n\[|$)/g);
    if (!depSections) return;
    for (const section of depSections) {
      const names = section.match(/^([a-zA-Z0-9_-]+)\s*=/gm);
      if (names) {
        for (const n of names) {
          const match = n.match(/^([a-zA-Z0-9_-]+)/);
          if (match && match[1]) out.add(match[1]);
        }
      }
    }
  }

  private scanGoMod(dir: string, out: Set<string>): void {
    const content = this.safeReadFile(join(dir, "go.mod"));
    if (content === null) return;
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([a-zA-Z0-9./_-]+)\s+v\d/);
      if (match && match[1]) out.add(match[1]);
    }
  }

  private scanDotnetCsproj(dir: string, out: Set<string>): void {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (!entry.endsWith(".csproj")) continue;
        const content = this.safeReadFile(join(dir, entry));
        if (content === null) continue;
        const refs = content.match(/PackageReference\s+Include="([^"]+)"/g);
        if (refs) {
          for (const ref of refs) {
            const m = ref.match(/Include="([^"]+)"/);
            if (m && m[1]) out.add(m[1]);
          }
        }
      }
    } catch {
      /* directory unreadable - ignore */
    }
  }

  private scanPodfile(dir: string, out: Set<string>): void {
    const content = this.safeReadFile(join(dir, "Podfile"));
    if (content === null) return;
    const pods = content.match(/^\s*pod\s+['"]([^'"]+)['"]/gm);
    if (pods) {
      for (const p of pods) {
        const m = p.match(/['"]([^'"]+)['"]/);
        if (m && m[1]) out.add(m[1]);
      }
    }
  }

  private scanBuildGradle(dir: string, out: Set<string>): void {
    for (const file of ["build.gradle", "build.gradle.kts"]) {
      const content = this.safeReadFile(join(dir, file));
      if (content === null) continue;
      const deps = content.match(/(?:implementation|api|testImplementation)[\s(]+['"]([^'"]+)['"]/g);
      if (deps) {
        for (const d of deps) {
          const m = d.match(/['"]([^'"]+)['"]/);
          if (m && m[1]) out.add(m[1]);
        }
      }
    }
  }

  private scanEnvFilenames(dir: string, out: Set<string>): void {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry === ".env" || entry.startsWith(".env.")) {
          out.add(entry);
        }
      }
    } catch {
      /* ignore */
    }
  }

  private readGitBranch(dir: string): string | null {
    const head = this.safeReadFile(join(dir, ".git", "HEAD"));
    if (head === null) return null;
    const trimmed = head.trim();
    // Common: "ref: refs/heads/main"
    const match = trimmed.match(/^ref:\s+refs\/heads\/(.+)$/);
    if (match) return match[1] ?? null;
    // Detached HEAD - return first 8 chars of SHA as a branch-like label.
    if (/^[0-9a-f]{40}$/.test(trimmed)) return trimmed.slice(0, 8);
    return null;
  }

  private walkFiles(
    root: string,
    dir: string,
    out: Set<string>,
    depth: number,
  ): void {
    if (depth > MAX_FILE_SCAN_DEPTH) return;
    if (out.size >= MAX_FILES_SCANNED) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (out.size >= MAX_FILES_SCANNED) return;
      if (ALWAYS_IGNORE.includes(entry)) continue;
      const abs = join(dir, entry);
      let info;
      try {
        info = statSync(abs);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        this.walkFiles(root, abs, out, depth + 1);
      } else if (info.isFile()) {
        const rel = abs.slice(root.length + 1).replace(/\\/g, "/");
        out.add(rel);
      }
    }
  }
}
