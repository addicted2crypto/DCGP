import { definePath } from "@dcgp/core";

export const python = definePath({
  id: "python",
  version: "1.0.0",
  name: "Python",
  description: "Python backend / data / scripting. 3.11+, uv or pip, pyproject.toml.",
  tags: ["backend", "python"],
  signals: {
    packages: ["fastapi", "django", "flask", "pydantic", "sqlalchemy", "uvicorn", "pytest", "ruff"],
    files: ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile", "uv.lock"],
    keywords: ["python", "pip", "uv", "venv"],
    gitBranch: ["main", "develop"],
  },
  anchors: [
    {
      id: "stack",
      label: "Python stack identity",
      priority: 100,
      content:
        "Python 3.11+. Dependency manager: uv (preferred) or pip + venv. Package declaration in pyproject.toml. Test runner: pytest. Linter: ruff. Type checker: mypy or pyright.",
    },
    {
      id: "conventions",
      label: "Idioms",
      priority: 80,
      content:
        "PEP 8 formatting. Type hints on all function signatures. Prefer dataclasses or Pydantic models over dicts. Never bare `except:`; always name the exception class.",
    },
  ],
  gates: [
    {
      id: "bare-except",
      pattern: "except\\s*:",
      severity: "error",
      message: "Never use bare except; name the exception class.",
      context: "output",
    },
    {
      id: "print-debug",
      pattern: "^\\s*print\\(",
      severity: "info",
      message: "Use logging, not print(), for non-CLI output.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "nodejs",
      pattern: "\\bnpm install\\b|\\bpnpm\\b|package\\.json",
      severity: "error",
      correction: "This is Python. Use pip/uv, not npm/pnpm.",
    },
  ],
  compression: {
    summarizeAs: "Python development session",
    neverPrune: ["pyproject.toml", "requirements.txt"],
  },
});
