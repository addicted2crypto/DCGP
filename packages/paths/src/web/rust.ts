import { definePath } from "@dcgp/core";

export const rust = definePath({
  id: "rust",
  version: "1.0.0",
  name: "Rust",
  description: "Rust systems / backend. Cargo, stable toolchain.",
  tags: ["backend", "rust", "systems"],
  signals: {
    files: ["Cargo.toml", "Cargo.lock", "src/main.rs", "src/lib.rs"],
    packages: ["tokio", "axum", "actix-web", "serde", "anyhow", "thiserror"],
    keywords: ["rust", "cargo", "rustc"],
  },
  anchors: [
    {
      id: "stack",
      label: "Rust stack identity",
      priority: 100,
      content:
        "Rust stable toolchain (>= 1.80). Cargo for build/dependencies. Edition 2021 or 2024. Test with cargo test. Format with rustfmt. Lint with clippy -- -D warnings.",
    },
    {
      id: "idioms",
      label: "Rust idioms",
      priority: 80,
      content:
        "Prefer Result<T, E> over panics. Use ? for propagation. Borrow-check first, clone as last resort. Prefer &str over String when the caller can lend. Use anyhow for apps, thiserror for libraries.",
    },
  ],
  gates: [
    {
      id: "unwrap-in-code",
      pattern: "\\.unwrap\\(\\)",
      severity: "warn",
      message: "Avoid .unwrap() outside tests/examples. Propagate with ? or expect with a message.",
      context: "output",
    },
    {
      id: "panic-in-lib",
      pattern: "\\bpanic!\\(",
      severity: "warn",
      message: "Libraries should return Result; panic only for unrecoverable invariants.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "cpp",
      pattern: "\\bnew\\s+\\w+|\\bdelete\\s+\\w+|std::",
      severity: "warn",
      correction: "This is Rust. Use Box / Rc / Arc, not C++ new/delete or std::.",
    },
  ],
  compression: {
    summarizeAs: "Rust development session",
    neverPrune: ["Cargo.toml", "Cargo.lock"],
  },
});
