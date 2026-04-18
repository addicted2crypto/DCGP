import { definePath } from "@dcgp/core";

export const nodejs = definePath({
  id: "nodejs",
  version: "1.0.0",
  name: "Node.js",
  description: "Node.js backend / tooling. ESM, TypeScript, pnpm/npm/yarn.",
  tags: ["backend", "javascript", "typescript"],
  signals: {
    packages: ["express", "fastify", "koa", "nest", "next", "typescript", "tsx", "tsup", "vitest"],
    files: ["package.json", "tsconfig.json", "pnpm-lock.yaml", "yarn.lock"],
    keywords: ["node", "nodejs", "npm", "pnpm", "yarn"],
    gitBranch: ["main", "develop", "feat/*"],
  },
  anchors: [
    {
      id: "stack",
      label: "Node.js stack identity",
      priority: 100,
      content:
        "Node.js >= 22 runtime. ESM by default (type: module). TypeScript strict mode. Package manager pnpm (preferred) or npm. Test runner: vitest. Build: tsup or tsc.",
    },
    {
      id: "conventions",
      label: "Idioms",
      priority: 80,
      content:
        "Use async/await (never raw Promises). Use node: prefix for built-ins (node:fs, node:path). Error handling via throw + try/catch; do not swallow errors.",
    },
  ],
  gates: [
    {
      id: "no-var",
      pattern: "\\bvar\\s+\\w+",
      severity: "warn",
      message: "Use const/let, not var.",
      context: "output",
    },
    {
      id: "no-callback-style",
      pattern: "\\.readFile\\([^,]+,\\s*(?:function|\\(err)",
      severity: "warn",
      message: "Prefer promise-based fs (fs/promises).",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "python",
      pattern: "\\bpip install\\b|\\brequirements\\.txt\\b|\\bvenv\\b",
      severity: "error",
      correction: "This is Node.js. Use npm/pnpm, not pip.",
    },
    {
      sourceDomain: "ruby",
      pattern: "\\bgem install\\b|\\bGemfile\\b",
      severity: "error",
      correction: "This is Node.js. Use npm/pnpm, not gem.",
    },
  ],
  compression: {
    summarizeAs: "Node.js development session",
    neverPrune: ["package.json", "tsconfig.json", "pnpm-lock.yaml"],
  },
});
