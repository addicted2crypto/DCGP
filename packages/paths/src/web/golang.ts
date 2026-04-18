import { definePath } from "@dcgp/core";

export const golang = definePath({
  id: "golang",
  version: "1.0.0",
  name: "Go",
  description: "Go backend / tooling. Modules, stdlib-first.",
  tags: ["backend", "go", "golang"],
  signals: {
    files: ["go.mod", "go.sum", "main.go"],
    keywords: ["go", "golang", "goroutine"],
  },
  anchors: [
    {
      id: "stack",
      label: "Go stack identity",
      priority: 100,
      content:
        "Go 1.22+. Modules (go.mod). Stdlib first; add dependencies sparingly. Test with go test. Build with go build. Format with gofmt.",
    },
    {
      id: "idioms",
      label: "Go idioms",
      priority: 80,
      content:
        "Errors are values; return them explicitly. Do not use panic for control flow. Use context.Context for cancellation. Interfaces defined by consumer, not implementer.",
    },
  ],
  gates: [
    {
      id: "ignored-error",
      pattern: ",\\s*_\\s*=\\s*[a-zA-Z]",
      severity: "warn",
      message: "Explicit _ = err swallow. Confirm the error is truly safe to drop.",
      context: "output",
    },
    {
      id: "panic-in-lib",
      pattern: "^\\s*panic\\(",
      severity: "warn",
      message: "panic is for unrecoverable program state, not errors. Return an error.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "nodejs",
      pattern: "\\basync\\s+function|\\bawait\\b|\\bPromise\\.",
      severity: "error",
      correction: "This is Go. Use goroutines + channels, not async/await.",
    },
  ],
  compression: {
    summarizeAs: "Go development session",
    neverPrune: ["go.mod", "go.sum"],
  },
});
