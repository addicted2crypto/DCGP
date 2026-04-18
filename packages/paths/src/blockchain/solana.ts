import { definePath } from "@dcgp/core";

export const solana = definePath({
  id: "solana",
  version: "1.0.0",
  name: "Solana",
  description: "Solana smart contracts and SDK. Anchor framework, Rust.",
  tags: ["blockchain", "solana", "rust"],
  signals: {
    files: ["Anchor.toml", "programs/**/Cargo.toml", "tests/*.ts"],
    packages: ["@solana/web3.js", "@coral-xyz/anchor", "@solana/spl-token"],
    keywords: ["solana", "anchor", "pubkey", "lamports"],
  },
  anchors: [
    {
      id: "stack",
      label: "Solana stack identity",
      priority: 100,
      content:
        "Solana program in Rust using Anchor framework (preferred) or native. Client code in @solana/web3.js or @coral-xyz/anchor. Test with anchor test. Local validator: solana-test-validator.",
    },
    {
      id: "account-model",
      label: "Account model",
      priority: 95,
      content:
        "Solana uses accounts, not contract storage. Every account is owned by a program. Account size is fixed at creation. PDAs are derived deterministically; never assume a PDA has been created.",
    },
  ],
  gates: [
    {
      id: "unchecked-account",
      pattern: "UncheckedAccount\\b",
      severity: "warn",
      message: "UncheckedAccount bypasses Anchor's validation. Confirm this is intentional.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "evm",
      pattern: "msg\\.sender|tx\\.origin|\\baddress\\b\\s+public|\\bcontract\\b\\s+\\w+\\s*\\{",
      severity: "error",
      correction: "This is Solana, not EVM. Use ctx.accounts + Pubkey, not msg.sender or contract state vars.",
    },
  ],
  compression: {
    summarizeAs: "Solana development session",
    neverPrune: ["Anchor.toml", "programs/**"],
  },
});
