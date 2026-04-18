import { definePath } from "@dcgp/core";

export const mlAi = definePath({
  id: "ml-ai",
  version: "1.0.0",
  name: "ML / AI",
  description: "Machine learning, deep learning, LLM fine-tuning. PyTorch, HuggingFace.",
  tags: ["ml", "ai", "python"],
  signals: {
    packages: ["torch", "transformers", "datasets", "accelerate", "peft", "trl", "numpy", "scikit-learn"],
    files: ["*.ipynb", "train.py", "dataset.py", "model.py"],
    keywords: ["pytorch", "huggingface", "fine-tune", "lora", "rlhf", "transformer"],
  },
  anchors: [
    {
      id: "stack",
      label: "ML/AI stack",
      priority: 100,
      content:
        "Python 3.11+ with PyTorch. HuggingFace transformers + datasets + accelerate for LLM work. PEFT/LoRA for fine-tuning. TRL for RLHF/DPO. Track experiments with wandb or mlflow.",
    },
    {
      id: "practices",
      label: "ML practices",
      priority: 85,
      content:
        "Seed all RNGs for reproducibility (torch, numpy, random). Separate train/val/test. Log hyperparameters. Save checkpoints. Validate input shapes early. Never train on the test set.",
    },
  ],
  gates: [
    {
      id: "no-seed",
      pattern: "\\btorch\\.manual_seed|\\bnp\\.random\\.seed|\\brandom\\.seed",
      severity: "info",
      message: "Good: seed is set. Confirm all RNG sources are seeded for full reproducibility.",
      context: "output",
    },
    {
      id: "mutable-default",
      pattern: "def\\s+\\w+\\([^)]*=\\s*\\[\\]",
      severity: "warn",
      message: "Mutable default argument (list). Use None and initialize inside the function.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "data-engineering",
      pattern: "\\bairflow\\b|\\bdbt\\s+run\\b|INCREMENTAL",
      severity: "info",
      correction: "This is ML/AI work, not data engineering. Different pipeline orchestration.",
    },
  ],
  compression: {
    summarizeAs: "ML/AI development session",
    neverPrune: ["train.py", "model.py", "*.yaml"],
  },
});
