import { definePath } from "@dcgp/core";

export const react = definePath({
  id: "react",
  version: "1.0.0",
  name: "React",
  description: "React frontend. Hooks, function components, TypeScript.",
  tags: ["frontend", "react", "typescript"],
  signals: {
    packages: ["react", "react-dom", "@types/react", "next", "vite", "@tanstack/react-query", "zustand"],
    files: ["*.tsx", "*.jsx", "next.config.js", "vite.config.ts"],
    keywords: ["react", "jsx", "tsx", "hooks"],
  },
  anchors: [
    {
      id: "stack",
      label: "React stack identity",
      priority: 100,
      content:
        "React 18+ with function components and hooks. TypeScript strict. Bundler: Vite or Next.js. State: local via useState, cross-cutting via Zustand or TanStack Query. No class components in new code.",
    },
    {
      id: "idioms",
      label: "React idioms",
      priority: 80,
      content:
        "Hooks must be called unconditionally at the top level. Memoize expensive deriving via useMemo. Stabilize callbacks with useCallback when passed to memoized children. Prefer composition over inheritance.",
    },
  ],
  gates: [
    {
      id: "class-component",
      pattern: "class\\s+\\w+\\s+extends\\s+(?:React\\.)?Component",
      severity: "warn",
      message: "Prefer function components with hooks over class components.",
      context: "output",
    },
    {
      id: "missing-key",
      pattern: "\\.map\\([^)]+=>\\s*<\\w+(?![^>]*key=)",
      severity: "warn",
      message: "List rendering should include a stable key prop.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "vue",
      pattern: "v-if=|v-for=|ref\\(\\)|computed\\(",
      severity: "error",
      correction: "This is React. Use conditional JSX and hooks, not Vue directives.",
    },
  ],
  compression: {
    summarizeAs: "React development session",
    neverPrune: ["package.json", "tsconfig.json"],
  },
});
