/**
 * @dcgp/cli - command-line entry point. Hand-rolled argument parsing to
 * keep the CLI zero-external-dep and portable.
 *
 * Commands:
 *   dcgp classify [dir]       Classify workspace + show confidence
 *   dcgp classify --verbose   Include full signal breakdown
 *   dcgp status [dir]         Active domain, gate stats, entropy bar
 *   dcgp paths [dir]          All registered paths with cascade levels
 *   dcgp inject [dir]         Print system prompt injection (pipe-safe)
 *   dcgp gate <file>          Run text through HallucinationGate
 *   dcgp validate <file>      Validate .dcgp.json against schema
 *   dcgp init [dir]           Scaffold .dcgp/ with starter template
 *   dcgp entropy              Explain EntropyMonitor scoring model
 *   dcgp audit [dir]          Static-analysis audit for vibe-coded flaws
 *   dcgp help                 Show this help
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";

import {
  ContextInjector,
  DomainClassifier,
  EntropyMonitor,
  FingerprintEngine,
  HallucinationGate,
  definePath,
  DCGPValidationError,
  DEFAULT_ENTROPY_WEIGHTS,
  type ContextPath,
} from "@dcgp/core";
import { ALL_PATHS } from "@dcgp/paths";
import {
  auditWorkspace,
  BUILTIN_RULES,
  formatJson,
  formatTty,
  formatMarkdown,
  formatSarif,
  type RuleId,
  type Severity,
} from "@dcgp/vibe-audit";

async function run(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  const verbose = args.includes("--verbose") || args.includes("-v");
  const positional = args.filter((a) => !a.startsWith("-"));

  switch (command) {
    case "classify":
      return cmdClassify(positional[0], verbose);
    case "status":
      return cmdStatus(positional[0]);
    case "paths":
      return cmdPaths(positional[0]);
    case "inject":
      return cmdInject(positional[0]);
    case "gate":
      return cmdGate(positional[0]);
    case "validate":
      return cmdValidate(positional[0]);
    case "init":
      return cmdInit(positional[0]);
    case "entropy":
      return cmdEntropy();
    case "audit":
      return cmdAudit(positional[0], args);
    case "help":
    case "-h":
    case "--help":
    case undefined:
      return cmdHelp();
    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      return cmdHelp(1);
  }
}

function resolveDir(dir?: string): string {
  return dir === undefined ? process.cwd() : resolve(dir);
}

function cmdClassify(dir: string | undefined, verbose: boolean): number {
  const root = resolveDir(dir);
  const fp = new FingerprintEngine(root).fingerprint();
  const classifier = new DomainClassifier();
  classifier.registerMany(ALL_PATHS);
  const result = classifier.classify(fp);

  process.stdout.write(`Workspace : ${root}\n`);
  process.stdout.write(
    `Domain    : ${result.domain ?? "(unclassified)"}  confidence=${formatConf(result.confidence)}\n`,
  );
  if (result.collision) process.stdout.write(`Warning   : signal collision detected\n`);
  if (verbose) {
    process.stdout.write(`\nCandidates:\n`);
    for (const c of result.candidates) {
      process.stdout.write(`  ${c.domain.padEnd(20)} ${c.confidence.toFixed(3)}\n`);
    }
    process.stdout.write(`\nFingerprint:\n`);
    process.stdout.write(`  packages  : ${fp.packages.size}\n`);
    process.stdout.write(`  files     : ${fp.files.size}\n`);
    process.stdout.write(`  envVars   : ${fp.envVars.size}\n`);
    process.stdout.write(`  gitBranch : ${fp.gitBranch ?? "(none)"}\n`);
  }
  return 0;
}

function cmdStatus(dir: string | undefined): number {
  const root = resolveDir(dir);
  const fp = new FingerprintEngine(root).fingerprint();
  const classifier = new DomainClassifier();
  classifier.registerMany(ALL_PATHS);
  const c = classifier.classify(fp);
  const monitor = new EntropyMonitor();

  process.stdout.write(`DCGP status\n`);
  process.stdout.write(`  Domain    : ${c.domain ?? "(unclassified)"}\n`);
  process.stdout.write(`  Confidence: ${formatConf(c.confidence)}\n`);
  process.stdout.write(
    `  Entropy   : ${monitor.currentLevel().toUpperCase()} ${entropyBar(monitor.currentScore())} ${(monitor.currentScore() * 100).toFixed(0)}%\n`,
  );
  process.stdout.write(
    `  Directive : floor=${monitor.currentDirective().globalFloor.toFixed(2)}\n`,
  );
  return 0;
}

function cmdPaths(_dir: string | undefined): number {
  process.stdout.write(`Registered community paths (${ALL_PATHS.length}):\n`);
  for (const p of ALL_PATHS) {
    process.stdout.write(`  ${p.id.padEnd(20)} ${p.name}\n`);
  }
  return 0;
}

function cmdInject(dir: string | undefined): number {
  const root = resolveDir(dir);
  const fp = new FingerprintEngine(root).fingerprint();
  const classifier = new DomainClassifier();
  classifier.registerMany(ALL_PATHS);
  const result = classifier.classify(fp);
  if (result.domain === null) {
    process.stderr.write(`No domain classified for ${root}\n`);
    return 1;
  }
  const path: ContextPath | undefined = [...ALL_PATHS].find((p) => p.id === result.domain);
  if (path === undefined) {
    process.stderr.write(`Path not found: ${result.domain}\n`);
    return 1;
  }
  const injector = new ContextInjector();
  const { xml } = injector.inject(path);
  process.stdout.write(xml + "\n");
  return 0;
}

function cmdGate(file: string | undefined): number {
  if (file === undefined) {
    process.stderr.write(`Usage: dcgp gate <file>\n`);
    return 2;
  }
  const text = readFileSync(file, "utf8");
  const fp = new FingerprintEngine(process.cwd()).fingerprint();
  const classifier = new DomainClassifier();
  classifier.registerMany(ALL_PATHS);
  const result = classifier.classify(fp);
  if (result.domain === null) {
    process.stderr.write(`No domain classified. Cannot run gates.\n`);
    return 1;
  }
  const path: ContextPath | undefined = [...ALL_PATHS].find((p) => p.id === result.domain);
  if (path === undefined) {
    process.stderr.write(`Path not found: ${result.domain}\n`);
    return 1;
  }
  const gate = new HallucinationGate();
  gate.activate(path);
  const scan = gate.scan(text, { turn: 1, context: "output" });
  if (scan.violations.length === 0) {
    process.stdout.write(`No gate violations in ${file}.\n`);
    return 0;
  }
  process.stdout.write(`Violations in ${file}:\n`);
  for (const v of scan.violations) {
    process.stdout.write(`  [${v.severity}] ${v.ruleId}: ${v.message}\n`);
    if (v.violatingText !== undefined) {
      process.stdout.write(`      matched: ${v.violatingText}\n`);
    }
  }
  return scan.violations.some((v) => v.severity === "error" || v.severity === "critical") ? 1 : 0;
}

function cmdValidate(file: string | undefined): number {
  if (file === undefined) {
    process.stderr.write(`Usage: dcgp validate <path-to-.dcgp.json>\n`);
    return 2;
  }
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const path = definePath(raw);
    process.stdout.write(`Valid. id=${path.id} name=${path.name}\n`);
    return 0;
  } catch (err) {
    if (err instanceof DCGPValidationError) {
      process.stderr.write(`Invalid: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }
}

function cmdInit(dir: string | undefined): number {
  const root = resolveDir(dir);
  const domainId = basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Co-locate with DCP's config directory when possible (.opencode/).
  // Fall back to .dcgp/ if the user explicitly prefers it.
  const useOpencodeDir =
    existsSync(join(root, ".opencode")) || !existsSync(join(root, ".dcgp"));
  const configDir = useOpencodeDir ? join(root, ".opencode") : join(root, ".dcgp");
  const fileName = useOpencodeDir ? "dcgp.jsonc" : `${domainId}.dcgp.json`;
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  const target = join(configDir, fileName);
  if (existsSync(target)) {
    process.stderr.write(`Already exists: ${target}\n`);
    return 2;
  }
  writeFileSync(target, renderTemplate(domainId), "utf8");
  process.stdout.write(`Scaffolded ${target}\n`);
  process.stdout.write(`Next steps:\n`);
  process.stdout.write(`  1. Edit ${target} - fill in signals, anchors, gates\n`);
  process.stdout.write(`  2. dcgp validate ${target}\n`);
  process.stdout.write(`  3. dcgp classify .\n`);
  return 0;
}

function cmdEntropy(): number {
  const w = DEFAULT_ENTROPY_WEIGHTS;
  process.stdout.write(`EntropyMonitor scoring model (DCGP-SPEC.md section 7)\n\n`);
  process.stdout.write(`  score = gate_pressure     x ${w.gate_pressure.toFixed(2)}\n`);
  process.stdout.write(`        + drift_pressure    x ${w.drift_pressure.toFixed(2)}\n`);
  process.stdout.write(`        + confidence_decay  x ${w.confidence_decay.toFixed(2)}\n`);
  process.stdout.write(`        + citation_pressure x ${w.citation_pressure.toFixed(2)}\n`);
  process.stdout.write(`        + session_age       x ${w.session_age.toFixed(2)}\n\n`);
  process.stdout.write(`Levels (left-inclusive, right-exclusive except CRITICAL):\n`);
  process.stdout.write(`  NOMINAL  [0.00, 0.40)  floor=0.20   PASSIVE\n`);
  process.stdout.write(`  ELEVATED [0.40, 0.70)  floor=0.40   TIGHTEN\n`);
  process.stdout.write(`  HIGH     [0.70, 0.90)  floor=0.65   AGGRESSIVE\n`);
  process.stdout.write(`  CRITICAL [0.90, 1.00]  floor=0.90   NUCLEAR\n\n`);
  process.stdout.write(`Higher floor = stricter pruning. Anchors score 1.0 and always survive.\n`);
  return 0;
}

function cmdHelp(code = 0): number {
  const out = code === 0 ? process.stdout : process.stderr;
  out.write(`dcgp - Dynamic Context Guidance Paths\n\n`);
  out.write(`Usage: dcgp <command> [args]\n\n`);
  out.write(`Commands:\n`);
  out.write(`  classify [dir]       Classify workspace + show confidence\n`);
  out.write(`  classify --verbose   Include full signal breakdown\n`);
  out.write(`  status [dir]         Active domain, gate stats, entropy bar\n`);
  out.write(`  paths [dir]          All registered paths\n`);
  out.write(`  inject [dir]         Print system prompt injection (pipe-safe)\n`);
  out.write(`  gate <file>          Run text through HallucinationGate\n`);
  out.write(`  validate <file>      Validate .dcgp.json against schema\n`);
  out.write(`  init [dir]           Scaffold .dcgp/ with starter template\n`);
  out.write(`  entropy              Explain EntropyMonitor scoring model\n`);
  out.write(`  audit [dir]          Static-analysis audit for vibe-coded flaws\n`);
  out.write(`    --rule <id>          Run a single rule\n`);
  out.write(`    --severity <level>   Drop findings below level (info|warn|error|critical)\n`);
  out.write(`    --format <fmt>       Output: tty (default) | json | markdown | sarif\n`);
  out.write(`    --fail-on <level>    Exit non-zero if any finding at or above level\n`);
  out.write(`    --no-ts              Force regex-only mode (skip TS AST detection)\n`);
  out.write(`  help                 Show this help\n`);
  return code;
}

function renderTemplate(id: string): string {
  return JSON.stringify(
    {
      $schema: "https://raw.githubusercontent.com/addicted2crypto/DCGP/main/dcgp.schema.json",
      id,
      version: "1.0.0",
      name: id,
      signals: { packages: [], files: [], keywords: [id] },
      anchors: [
        {
          id: "stack",
          label: "Stack identity",
          priority: 100,
          content: "Precise factual description of your stack, versions, and constraints.",
        },
      ],
      gates: [],
      driftRules: [],
      compression: { summarizeAs: `${id} development session`, neverPrune: [] },
    },
    null,
    2,
  );
}

async function cmdAudit(dir: string | undefined, args: readonly string[]): Promise<number> {
  const root = resolveDir(dir);

  const ruleFlag = flagValue(args, "--rule");
  const severityFlag = flagValue(args, "--severity");
  const formatFlag = flagValue(args, "--format") ?? "tty";
  const failOnFlag = flagValue(args, "--fail-on");
  const noTs = args.includes("--no-ts");

  const validSeverities: readonly Severity[] = ["info", "warn", "error", "critical"];
  if (severityFlag !== undefined && !(validSeverities as readonly string[]).includes(severityFlag)) {
    process.stderr.write(`Invalid --severity '${severityFlag}'. Use one of: ${validSeverities.join(", ")}\n`);
    return 2;
  }
  if (failOnFlag !== undefined && !(validSeverities as readonly string[]).includes(failOnFlag)) {
    process.stderr.write(`Invalid --fail-on '${failOnFlag}'. Use one of: ${validSeverities.join(", ")}\n`);
    return 2;
  }

  const validRuleIds = new Set(BUILTIN_RULES.map((r) => r.id));
  if (ruleFlag !== undefined && !validRuleIds.has(ruleFlag as RuleId)) {
    process.stderr.write(
      `Unknown rule '${ruleFlag}'. Known rules: ${[...validRuleIds].join(", ")}\n`,
    );
    return 2;
  }

  const report = await auditWorkspace(BUILTIN_RULES, {
    dir: root,
    rule: ruleFlag as RuleId | undefined,
    minSeverity: severityFlag as Severity | undefined,
    noTs,
  });

  let out: string;
  switch (formatFlag) {
    case "json":
      out = formatJson(report);
      break;
    case "markdown":
      out = formatMarkdown(report);
      break;
    case "sarif":
      out = formatSarif(report);
      break;
    case "tty":
    default:
      out = formatTty(report);
      break;
  }
  process.stdout.write(out + "\n");

  if (failOnFlag !== undefined) {
    const order: Record<Severity, number> = { info: 0, warn: 1, error: 2, critical: 3 };
    const threshold = order[failOnFlag as Severity];
    const tripped = report.findings.some((f) => order[f.severity] >= threshold);
    if (tripped) return 1;
  }
  return 0;
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("-")) return undefined;
  return v;
}

function formatConf(c: number): string {
  return c < 0 ? "unknown (-1)" : `${(c * 100).toFixed(1)}%`;
}

function entropyBar(score: number): string {
  const total = 20;
  const filled = Math.min(total, Math.max(0, Math.round(score * total)));
  return `[${"=".repeat(filled)}${".".repeat(total - filled)}]`;
}

run().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`dcgp: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
