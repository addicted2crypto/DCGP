import { definePath } from "@dcgp/core";

export const evm = definePath({
  id: "evm",
  version: "1.0.0",
  name: "EVM / Solidity",
  description: "Ethereum-compatible smart contracts. Solidity, Foundry, Hardhat.",
  tags: ["blockchain", "evm", "solidity"],
  signals: {
    files: ["foundry.toml", "hardhat.config.ts", "hardhat.config.js", "*.sol", "remappings.txt"],
    packages: ["hardhat", "@openzeppelin/contracts", "ethers", "viem", "wagmi"],
    keywords: ["solidity", "evm", "foundry", "hardhat", "wagmi"],
  },
  anchors: [
    {
      id: "stack",
      label: "EVM stack identity",
      priority: 100,
      content:
        "Solidity 0.8.20+ with explicit pragma. Toolchain: Foundry (preferred) or Hardhat. Test framework: forge test or hardhat test. Contract safety: use OpenZeppelin audited libs. Prefer immutable + constant over storage vars where possible.",
    },
    {
      id: "safety",
      label: "Safety checklist",
      priority: 95,
      content:
        "Checks-Effects-Interactions (reentrancy). Explicit visibility (public/external/internal/private). SafeERC20 for ERC20 transfers. Avoid tx.origin. Use ReentrancyGuard on external ETH/token-moving functions. Never rely on block.timestamp for >15 min precision.",
    },
  ],
  gates: [
    {
      id: "tx-origin",
      pattern: "tx\\.origin",
      severity: "critical",
      message: "tx.origin is a phishing vector. Use msg.sender.",
      context: "output",
    },
    {
      id: "unsafe-transfer",
      pattern: "\\.transfer\\s*\\(\\s*",
      severity: "warn",
      message: "`.transfer()` has a 2300 gas stipend that can fail with post-Istanbul contracts. Prefer call{value: ...}.",
      context: "output",
    },
    {
      id: "missing-pragma",
      pattern: "^(?!.*pragma solidity).+\\bcontract\\s+\\w+",
      severity: "error",
      message: "Every .sol file must declare `pragma solidity`.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "solana",
      pattern: "#\\[program\\]|\\banchor_lang\\b|Pubkey::",
      severity: "error",
      correction: "This is EVM/Solidity, not Solana. Use msg.sender / address, not Pubkey.",
    },
  ],
  compression: {
    summarizeAs: "EVM/Solidity development session",
    neverPrune: ["foundry.toml", "hardhat.config.*", "contracts/**"],
  },
});
