/**
 * DCGP VS Code extension.
 *
 * What this provides, and only this:
 *   - Status bar item showing the current classified domain and entropy level
 *   - Command palette entries to show status, init config, reclassify, list paths
 *   - JSON Schema reference for .dcgp/*.dcgp.json (defined in package.json)
 *
 * The extension is a lightweight presenter. All logic lives in @dcgp/core
 * and @dcgp/paths; the extension only shows results and invokes the same
 * runtime a CLI or OpenCode plugin would.
 */

import * as vscode from "vscode";

import {
  DomainClassifier,
  EntropyMonitor,
  FingerprintEngine,
  type ContextPath,
} from "@dcgp/core";
import { ALL_PATHS } from "@dcgp/paths";

let statusBar: vscode.StatusBarItem | null = null;
let monitor: EntropyMonitor | null = null;

export function activate(context: vscode.ExtensionContext): void {
  monitor = new EntropyMonitor();
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "dcgp.status";
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("dcgp.status", showStatus),
    vscode.commands.registerCommand("dcgp.init", initConfig),
    vscode.commands.registerCommand("dcgp.classify", refreshClassification),
    vscode.commands.registerCommand("dcgp.paths", listPaths),
  );

  refreshClassification();
}

export function deactivate(): void {
  statusBar?.dispose();
  statusBar = null;
}

function workspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (folders === undefined || folders.length === 0) return null;
  const first = folders[0];
  return first === undefined ? null : first.uri.fsPath;
}

function refreshClassification(): void {
  const root = workspaceRoot();
  if (root === null || statusBar === null) return;

  const fp = new FingerprintEngine(root).fingerprint();
  const classifier = new DomainClassifier();
  classifier.registerMany(ALL_PATHS);
  const result = classifier.classify(fp);

  if (result.domain === null) {
    statusBar.text = "$(question) DCGP: unclassified";
    statusBar.tooltip = "DCGP could not classify this workspace. Run 'DCGP: Initialize Configuration' to scaffold a path.";
  } else {
    const level = monitor !== null ? monitor.currentLevel().toUpperCase() : "NOMINAL";
    statusBar.text = `$(pulse) DCGP: ${result.domain} - ${level}`;
    statusBar.tooltip = `Domain ${result.domain} at ${(result.confidence * 100).toFixed(0)}% confidence`;
  }
  statusBar.show();
}

async function showStatus(): Promise<void> {
  const root = workspaceRoot();
  if (root === null) {
    void vscode.window.showInformationMessage("DCGP: no workspace folder open.");
    return;
  }
  const fp = new FingerprintEngine(root).fingerprint();
  const classifier = new DomainClassifier();
  classifier.registerMany(ALL_PATHS);
  const result = classifier.classify(fp);
  const level = monitor !== null ? monitor.currentLevel() : "nominal";
  const score = monitor !== null ? monitor.currentScore() : 0;
  const directive = monitor !== null ? monitor.currentDirective() : null;

  const lines = [
    `DCGP status for ${root}`,
    ``,
    `Domain     : ${result.domain ?? "(unclassified)"}`,
    `Confidence : ${result.confidence < 0 ? "unknown" : (result.confidence * 100).toFixed(1) + "%"}`,
    `Entropy    : ${level.toUpperCase()} @ ${(score * 100).toFixed(0)}%`,
    `Directive  : floor=${directive === null ? "0.20" : directive.globalFloor.toFixed(2)}`,
    ``,
    `Signals observed:`,
    `  packages  : ${fp.packages.size}`,
    `  files     : ${fp.files.size}`,
    `  envVars   : ${fp.envVars.size}`,
    `  gitBranch : ${fp.gitBranch ?? "(none)"}`,
  ];
  const channel = vscode.window.createOutputChannel("DCGP");
  channel.clear();
  for (const line of lines) channel.appendLine(line);
  channel.show(true);
}

async function initConfig(): Promise<void> {
  const root = workspaceRoot();
  if (root === null) {
    void vscode.window.showErrorMessage("DCGP: open a workspace folder first.");
    return;
  }
  const defaultId = root.split(/[\\/]/).pop() ?? "my-project";
  const id = await vscode.window.showInputBox({
    prompt: "Domain id (lowercase, hyphen-separated)",
    value: defaultId
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, ""),
    validateInput: (v) => (/^[a-z][a-z0-9-]*$/.test(v) ? null : "Must match [a-z][a-z0-9-]*"),
  });
  if (id === undefined) return;

  const extended = await vscode.window.showQuickPick(
    [{ label: "(none)" }, ...[...ALL_PATHS].map((p) => ({ label: p.id, description: p.name }))],
    { placeHolder: "Extend a community path?" },
  );

  const content = renderTemplate(id, extended?.label === "(none)" ? null : extended?.label ?? null);
  const targetUri = vscode.Uri.file(`${root}/.dcgp/${id}.dcgp.json`);

  try {
    await vscode.workspace.fs.stat(targetUri);
    void vscode.window.showWarningMessage(`DCGP: ${targetUri.fsPath} already exists.`);
    return;
  } catch {
    // fall through - does not exist, we can create it
  }

  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, "utf8"));
  const doc = await vscode.workspace.openTextDocument(targetUri);
  await vscode.window.showTextDocument(doc);
  refreshClassification();
}

async function listPaths(): Promise<void> {
  const channel = vscode.window.createOutputChannel("DCGP: Community Paths");
  channel.clear();
  channel.appendLine(`Registered community paths (${ALL_PATHS.length}):`);
  for (const p of ALL_PATHS as readonly ContextPath[]) {
    channel.appendLine(`  ${p.id.padEnd(20)} ${p.name}`);
  }
  channel.show(true);
}

function renderTemplate(id: string, extendsPath: string | null): string {
  const body: Record<string, unknown> = {
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
  };
  if (extendsPath !== null) body.extends = extendsPath;
  return JSON.stringify(body, null, 2);
}
