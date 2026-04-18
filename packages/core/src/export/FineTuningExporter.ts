/**
 * FineTuningExporter - EXTENDED tier (DCGP-SPEC.md § 9).
 *
 * Walks a session event log and produces JSONL training examples in three
 * formats: OpenAI chat completions, Anthropic prompt/completion, HuggingFace
 * SFT instruction/input/output.
 *
 * The insight: every correction DCGP injects is a labeled example of
 * "model was about to hallucinate / drift / lose context" paired with
 * "here is how it should have responded instead." That is a supervised
 * fine-tuning dataset.
 *
 * Events exported:
 *   Gate violations  -> (violating output, corrected output)
 *   Drift events     -> (foreign-domain output, domain-anchored correction)
 *   Entropy events   -> (degraded context state, re-anchored response)
 */

import type { GateViolation, DriftEvent, ContextPath } from "../types/ContextPath";
import type { EntropyEvent } from "../types/Entropy";
import type { Severity } from "../types/ContextPath";

export type ExportFormat = "openai" | "anthropic" | "huggingface";

export interface TrainingExample {
  readonly domainId: string;
  readonly source: "gate" | "drift" | "entropy";
  readonly severity: Severity;
  readonly turn: number;
  readonly violatingOutput: string;
  readonly correction: string;
  readonly label: string;
}

export interface SessionEventLog {
  readonly gateViolations: readonly GateViolation[];
  readonly driftEvents: readonly DriftEvent[];
  readonly entropyEvents: readonly EntropyEvent[];
  readonly activeDomainId: string | null;
}

export class FineTuningExporter {
  private path: ContextPath | null = null;

  activate(path: ContextPath): void {
    this.path = path;
  }

  buildExamples(log: SessionEventLog): TrainingExample[] {
    const examples: TrainingExample[] = [];
    const domainId = log.activeDomainId ?? "unknown";

    for (const v of log.gateViolations) {
      const rule = this.path?.gates.find((g) => g.id === v.ruleId);
      const correction = v.correctionMessage ?? rule?.suggest ?? rule?.message ?? v.message;
      if (!v.violatingText && rule === undefined) continue;
      examples.push({
        domainId,
        source: "gate",
        severity: v.severity,
        turn: v.turn,
        violatingOutput:
          v.violatingText ?? `[pattern matched: ${rule?.pattern.source ?? v.ruleId}]`,
        correction,
        label: `gate:${v.ruleId}`,
      });
    }

    for (const d of log.driftEvents) {
      const rule = this.path?.driftRules.find((r) => r.sourceDomain === d.sourceDomain);
      const correction = d.correction ?? rule?.correction;
      if (correction === undefined) continue;
      examples.push({
        domainId,
        source: "drift",
        severity: rule?.severity ?? "warn",
        turn: d.turn,
        violatingOutput: d.matched,
        correction,
        label: `drift:${d.sourceDomain}`,
      });
    }

    for (const e of log.entropyEvents) {
      if (e.contextCorrection === null) continue;
      const sorted = [...e.factors].sort((a, b) => b.contribution - a.contribution);
      const primary = sorted[0]?.name ?? "unknown";
      const severity: Severity =
        e.level === "critical"
          ? "critical"
          : e.level === "high"
            ? "error"
            : e.level === "elevated"
              ? "warn"
              : "info";
      examples.push({
        domainId,
        source: "entropy",
        severity,
        turn: e.turn,
        violatingOutput: `[entropy level: ${e.level}, score: ${Math.round(e.score * 100)}%, primary driver: ${primary}]`,
        correction: e.contextCorrection,
        label: `entropy:${e.level}`,
      });
    }

    return examples;
  }

  serialize(examples: readonly TrainingExample[], format: ExportFormat = "openai"): string {
    return examples.map((ex) => this.formatExample(ex, format)).join("\n");
  }

  private formatExample(ex: TrainingExample, format: ExportFormat): string {
    switch (format) {
      case "openai": {
        const systemMessage =
          `You are an AI assistant operating in the "${ex.domainId}" domain. ` +
          `Stay within this domain's conventions and avoid ${
            ex.source === "drift"
              ? `patterns from "${ex.label.split(":")[1]}"`
              : ex.source === "gate"
                ? "common anti-patterns"
                : "context degradation"
          }.`;
        return JSON.stringify({
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: `Review this output and correct any issues:\n\n${ex.violatingOutput}` },
            { role: "assistant", content: ex.correction },
          ],
          metadata: {
            dcgp_domain: ex.domainId,
            dcgp_source: ex.source,
            dcgp_severity: ex.severity,
            dcgp_label: ex.label,
            dcgp_turn: ex.turn,
          },
        });
      }
      case "anthropic": {
        return JSON.stringify({
          prompt: `\n\nHuman: In the ${ex.domainId} domain, review and correct:\n${ex.violatingOutput}\n\nAssistant:`,
          completion: ` ${ex.correction}`,
          metadata: {
            domain: ex.domainId,
            source: ex.source,
            severity: ex.severity,
            label: ex.label,
          },
        });
      }
      case "huggingface": {
        return JSON.stringify({
          instruction: `You are working in the "${ex.domainId}" domain. Identify and correct any issues with the following output.`,
          input: ex.violatingOutput,
          output: ex.correction,
          domain: ex.domainId,
          source: ex.source,
          severity: ex.severity,
        });
      }
    }
  }

  groupBySeverity(examples: readonly TrainingExample[]): Record<Severity, TrainingExample[]> {
    const groups: Record<Severity, TrainingExample[]> = {
      critical: [],
      error: [],
      warn: [],
      info: [],
    };
    for (const ex of examples) {
      groups[ex.severity].push(ex);
    }
    return groups;
  }

  summarize(examples: readonly TrainingExample[]): {
    total: number;
    bySource: Record<string, number>;
    bySeverity: Record<string, number>;
    byDomain: Record<string, number>;
  } {
    const sum = {
      total: examples.length,
      bySource: { gate: 0, drift: 0, entropy: 0 } as Record<string, number>,
      bySeverity: { critical: 0, error: 0, warn: 0, info: 0 } as Record<string, number>,
      byDomain: {} as Record<string, number>,
    };
    for (const ex of examples) {
      sum.bySource[ex.source] = (sum.bySource[ex.source] ?? 0) + 1;
      sum.bySeverity[ex.severity] = (sum.bySeverity[ex.severity] ?? 0) + 1;
      sum.byDomain[ex.domainId] = (sum.byDomain[ex.domainId] ?? 0) + 1;
    }
    return sum;
  }
}
