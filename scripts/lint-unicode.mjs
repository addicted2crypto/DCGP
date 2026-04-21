#!/usr/bin/env node
// lint-unicode.mjs
// Normalises non-ASCII typographic punctuation and emojis in DCGP source +
// doc files. Keeps mathematical symbols (tau, >=, union, etc.) that are
// load-bearing in the spec, but strips em/en dashes, decorative arrows, and
// UI emojis that have snuck into source comments or docs.
//
// Run: node scripts/lint-unicode.mjs
// Dry-run: node scripts/lint-unicode.mjs --dry

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const DRY = process.argv.includes("--dry");
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const INCLUDE_DIRS = [
  "packages/core/src",
  "packages/core/tests",
  "scripts",
  ".github",
];
const INCLUDE_ROOT_FILES = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "DCGP-SPEC.md",
  "COMPLIANCE",
];
const INCLUDE_EXTS = new Set([".md", ".ts", ".mjs", ".js", ".sh", ".yml", ".yaml", ".json", ".jsonc"]);
const EXCLUDE_SUBSTRINGS = ["node_modules", "dist/", "/dist\\", "_incoming"];

// Targeted replacements. Order matters for multi-char sequences.
const REPLACEMENTS = [
  [/\u2014/g, "-"],            // em dash
  [/\u2013/g, "-"],            // en dash
  [/\u21ba/g, "(repeat)"],     // anticlockwise arrow
  [/\u21e8/g, ">"],            // rightwards arrow for transitions
  [/\u2713/g, "[PASS]"],       // check mark
  [/\u2717/g, "[FAIL]"],       // ballot X
  [/\u2705/g, "[x]"],          // white heavy check
  [/\u274c/g, "[ ]"],          // cross mark
  [/\u26a0\ufe0f?/g, "WARN:"], // warning sign
  [/\u26a1/g, ""],             // high voltage / zap
  [/\u{1F916}/gu, ""],         // robot emoji
  [/\u{1F4DD}/gu, ""],         // memo emoji
  [/\u{1F310}/gu, ""],         // globe
  [/\u2022/g, "-"],            // bullet
  [/\u2192/g, "->"],           // rightwards arrow
  [/\u2190/g, "<-"],            // leftwards arrow
  [/\u2194/g, "<->"],
];

function shouldInclude(path) {
  for (const ex of EXCLUDE_SUBSTRINGS) if (path.includes(ex)) return false;
  const ext = extname(path);
  if (ext !== "" && !INCLUDE_EXTS.has(ext)) return false;
  return true;
}

function walkDir(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = join(dir, entry);
    let info;
    try {
      info = statSync(abs);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      walkDir(abs, out);
    } else if (info.isFile() && shouldInclude(abs)) {
      out.push(abs);
    }
  }
}

function collectFiles() {
  const out = [];
  for (const d of INCLUDE_DIRS) walkDir(join(ROOT, d), out);
  for (const f of INCLUDE_ROOT_FILES) {
    const abs = join(ROOT, f);
    if (shouldInclude(abs)) out.push(abs);
  }
  return out;
}

function normalise(content) {
  let next = content;
  for (const [pattern, repl] of REPLACEMENTS) {
    next = next.replace(pattern, repl);
  }
  // Collapse "- -" artifacts created by replacements like "  -  " -> "  -  "
  // Collapse repeated hyphens in prose (not code fences, not tables).
  return next;
}

function main() {
  const files = collectFiles();
  let changed = 0;
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const updated = normalise(content);
    if (updated !== content) {
      changed++;
      console.log(`${DRY ? "[dry] " : ""}update: ${file.replace(ROOT, "")}`);
      if (!DRY) writeFileSync(file, updated, "utf8");
    }
  }
  console.log(`${DRY ? "Would update" : "Updated"} ${changed} file(s).`);
}

main();
