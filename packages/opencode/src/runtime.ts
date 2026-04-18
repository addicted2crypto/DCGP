/**
 * DCGPRuntime - stateless glue that wires the 7-step loop (DCGP-SPEC.md § 4)
 * in any host environment (OpenCode, CLI, VS Code, custom agent).
 *
 * Hosts differ in how they deliver events (file hooks, SSE, stdin), but all
 * need the same orchestration:
 *
 *   onSessionStart(workspace)       -> fingerprint + classify
 *   onUserMessage(text, turn)       -> record turn inputs, get Directive
 *   onAssistantMessage(text, turn)  -> gate + drift scan, feed into monitor
 *   onTurnEnd(turn)                 -> persist, forward Directive to DCP
 *
 * The runtime does not touch the filesystem outside the FingerprintEngine
 * and SessionState (for persistence). It returns plain objects the host
 * forwards to its UI / LLM / storage.
 */

import {
  CascadeResolver,
  ContextInjector,
  DomainClassifier,
  DomainDriftDetector,
  EntropyMonitor,
  FineTuningExporter,
  FingerprintEngine,
  HallucinationGate,
  RetentionScorer,
  SessionState,
  type ContextPath,
  type DCGPSessionState,
  type DriftEvent,
  type EntropyEvent,
  type GateViolation,
  type RetentionDirective,
} from "@dcgp/core";
import { ALL_PATHS } from "@dcgp/paths";

export interface DCGPRuntimeOptions {
  readonly workspacePath: string;
  readonly sessionId?: string | null;
  readonly persistPath?: string;
  /** Extra community paths to register beyond ALL_PATHS. */
  readonly extraPaths?: readonly ContextPath[];
  /** Context window size (tokens) for anchor bloat mitigation. */
  readonly contextWindowTokens?: number;
}

export interface TurnInput {
  readonly turn: number;
  readonly userMessage?: string;
  readonly assistantMessage?: string;
}

export interface TurnResult {
  readonly activeDomainId: string | null;
  readonly confidence: number;
  readonly classification: {
    readonly collision: boolean;
    readonly shiftSuppressed: boolean;
  };
  readonly event: EntropyEvent;
  readonly gateViolations: readonly GateViolation[];
  readonly driftEvents: readonly DriftEvent[];
  /** Always present - the Pruning Nexus wire (DCGP-SPEC.md § 7.7). */
  readonly directive: RetentionDirective;
  /** Rendered system-prompt injection when actions call for reinject; else null. */
  readonly injection: string | null;
}

export class DCGPRuntime {
  readonly fingerprinter: FingerprintEngine;
  readonly classifier: DomainClassifier;
  readonly cascade: CascadeResolver;
  readonly monitor: EntropyMonitor;
  readonly gate: HallucinationGate;
  readonly drift: DomainDriftDetector;
  readonly injector: ContextInjector;
  readonly scorer: RetentionScorer;
  readonly state: SessionState;
  readonly exporter: FineTuningExporter;

  private activePath: ContextPath | null = null;
  private readonly contextWindowTokens: number;

  constructor(opts: DCGPRuntimeOptions) {
    this.fingerprinter = new FingerprintEngine(opts.workspacePath);
    this.classifier = new DomainClassifier();
    this.classifier.registerMany([...ALL_PATHS, ...(opts.extraPaths ?? [])]);
    this.cascade = new CascadeResolver();
    this.monitor = new EntropyMonitor();
    this.gate = new HallucinationGate();
    this.drift = new DomainDriftDetector();
    this.injector = new ContextInjector();
    this.scorer = new RetentionScorer(this.monitor.currentDirective());
    this.state = new SessionState({ sessionId: opts.sessionId ?? null }, opts.persistPath);
    this.exporter = new FineTuningExporter();
    this.contextWindowTokens = opts.contextWindowTokens ?? 128_000;
  }

  /** Called at session start or on forced reclassify. */
  classify(turn = 0): { domain: string | null; confidence: number; collision: boolean } {
    const fp = this.fingerprinter.fingerprint();
    const result = this.classifier.classify(fp, turn);

    if (result.shiftSuppressed) {
      this.state.recordShiftSuppression(
        this.state.snapshot().activeDomainId,
        result.domain ?? "",
        turn,
      );
    } else if (result.domain !== this.state.snapshot().activeDomainId) {
      this.state.setActiveDomain(result.domain, result.confidence, turn);
      this.monitor.resetPartial();
    }

    const newPath = result.domain === null ? null : this.findPath(result.domain);
    if (newPath !== this.activePath) {
      this.activePath = newPath;
      this.gate.activate(newPath);
      this.drift.activate(newPath);
      this.injector; // no-op; injector reads path at inject time
      this.exporter.activate(newPath ?? ({} as ContextPath));
      if (newPath !== null) {
        this.scorer.setCompression(newPath.compression);
      }
    }

    return { domain: result.domain, confidence: result.confidence, collision: result.collision };
  }

  /** One full turn: scan + record + emit event + maybe re-inject anchors. */
  processTurn(input: TurnInput): TurnResult {
    const gateResult = this.gate.scan(input.assistantMessage ?? "", {
      turn: input.turn,
      context: "output",
    });
    const driftEvents = this.drift.scan(input.assistantMessage ?? "", { turn: input.turn });

    const classification = this.classify(input.turn);

    const anchorCitation =
      this.activePath !== null &&
      (input.assistantMessage ?? "").length > 0 &&
      this.activePath.anchors.some((a) =>
        anchorCited(input.assistantMessage ?? "", a.content),
      );

    const event = this.monitor.record({
      turn: input.turn,
      gateViolations: gateResult.violations.length,
      driftEvents: driftEvents.length,
      confidence: classification.confidence,
      anchorCitation,
    });

    this.scorer.applyDirective(event.directive);

    this.state.recordGateViolations(gateResult.violations);
    this.state.recordDriftEvents(driftEvents);
    this.state.recordEntropyEvent(event);
    this.state.setTurn(input.turn);

    const shouldInject =
      gateResult.warmupBypass ||
      event.actions.some((a) => a.kind === "reinject_anchors");

    const injection =
      shouldInject && this.activePath !== null
        ? this.injector.inject(this.activePath, {
            contextWindowTokens: this.contextWindowTokens,
          }).xml
        : null;

    const forceReclassify = event.actions.some((a) => a.kind === "force_reclassify");
    if (forceReclassify) {
      this.fingerprinter.invalidate();
    }

    return {
      activeDomainId: classification.domain,
      confidence: classification.confidence,
      classification: {
        collision: classification.collision,
        shiftSuppressed: this.state.snapshot().domainShiftLog.at(-1)?.suppressed ?? false,
      },
      event,
      gateViolations: gateResult.violations,
      driftEvents,
      directive: event.directive,
      injection,
    };
  }

  persist(): void {
    this.state.persist();
  }

  snapshotState(): DCGPSessionState {
    return this.state.snapshot();
  }

  get activeDomain(): ContextPath | null {
    return this.activePath;
  }

  private findPath(id: string): ContextPath | null {
    for (const cand of [...ALL_PATHS]) {
      if (cand.id === id) return cand;
    }
    return null;
  }
}

/**
 * Substring match for anchor citation - normalized (lowercased, whitespace
 * collapsed). Closes the silent-hallucination blind spot (DCGP-SPEC § 7.1).
 */
function anchorCited(assistantText: string, anchorContent: string): boolean {
  const MIN_LEN = 8;
  const normAssist = assistantText.toLowerCase().replace(/\s+/g, " ");
  const normAnchor = anchorContent.toLowerCase().replace(/\s+/g, " ");
  // Break anchor content into short substrings; if any lands in the output,
  // consider this turn cited.
  for (let i = 0; i + MIN_LEN <= normAnchor.length; i += MIN_LEN) {
    const slice = normAnchor.slice(i, i + MIN_LEN);
    if (slice.trim().length < MIN_LEN) continue;
    if (normAssist.includes(slice)) return true;
  }
  return false;
}
