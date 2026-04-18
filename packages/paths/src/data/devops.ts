import { definePath } from "@dcgp/core";

export const devops = definePath({
  id: "devops",
  version: "1.0.0",
  name: "DevOps / Infra",
  description: "Infrastructure, Kubernetes, Terraform, CI/CD.",
  tags: ["devops", "infra", "kubernetes", "terraform"],
  signals: {
    files: [
      "*.tf",
      "terraform.tfvars",
      "Dockerfile",
      "docker-compose.yml",
      "kustomization.yaml",
      ".github/workflows/*.yml",
      ".gitlab-ci.yml",
      "Chart.yaml",
    ],
    packages: ["hashicorp/aws", "hashicorp/google", "hashicorp/kubernetes"],
    keywords: ["terraform", "kubernetes", "k8s", "helm", "kustomize", "github actions", "gitlab ci"],
  },
  anchors: [
    {
      id: "stack",
      label: "DevOps stack identity",
      priority: 100,
      content:
        "Infrastructure as Code via Terraform (preferred) or Pulumi. Container orchestration: Kubernetes with Helm or Kustomize. CI/CD in GitHub Actions or GitLab CI. Secrets in a vault (never in plaintext tfvars or YAML).",
    },
    {
      id: "safety",
      label: "Operational safety",
      priority: 95,
      content:
        "Plan before apply (terraform plan, kubectl diff). Never terraform apply to production without a reviewed plan artifact. Store state in remote backend with locking (S3 + DynamoDB, or Terraform Cloud). Rotate credentials on a schedule.",
    },
  ],
  gates: [
    {
      id: "terraform-apply-auto",
      pattern: "terraform\\s+apply\\s+(?:-auto-approve|--auto-approve)",
      severity: "warn",
      message: "-auto-approve bypasses review. Confirm this is intentional (CI rollout only).",
      context: "output",
    },
    {
      id: "kubectl-delete-all",
      pattern: "kubectl\\s+delete\\s+(?:--all|-all)",
      severity: "critical",
      message: "kubectl delete --all will wipe all resources of that kind in the namespace.",
      context: "output",
    },
    {
      id: "plaintext-secret",
      pattern: "(?:password|secret|api_?key)\\s*[:=]\\s*[\"']\\w{6,}[\"']",
      severity: "critical",
      message: "Plaintext credential literal. Move to a secret manager (Vault, SSM, GSM).",
      context: "output",
    },
  ],
  driftRules: [],
  compression: {
    summarizeAs: "DevOps / infrastructure session",
    neverPrune: ["*.tf", "Dockerfile", "Chart.yaml", ".github/workflows/*"],
  },
});
