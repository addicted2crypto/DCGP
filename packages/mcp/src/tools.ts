/**
 * MCP tool definitions. Each tool is a pure {name, description, inputSchema}
 * declaration plus a handler wired in server.ts. Keep schemas tight so clients
 * get good auto-complete when authoring tool calls.
 */

import type { DCGPRuntime } from "@dcgp/opencode";
import { ALL_PATHS } from "@dcgp/paths";
import type { ContextPath } from "@dcgp/core";
import {
  auditWorkspace,
  BUILTIN_RULES,
  type RuleId,
  type Severity,
} from "@dcgp/vibe-audit";

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: readonly McpTool[] = [
  {
    name: "dcgp_classify",
    description:
      "Classify the current workspace against all 16 community paths. Returns the top match with confidence, candidate breakdown, and whether a collision was detected. Call this on session start or after major workspace changes.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "dcgp_status",
    description:
      "Current governance state: active domain, confidence, entropy level, score, directive (Pruning Nexus floor), turn counter, and cumulative gate/drift/correction counts.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "dcgp_process_turn",
    description:
      "Run one turn of the DCGP 7-step loop against an assistant message. Fires gates + drift detection, updates the entropy monitor, and returns the resulting RetentionDirective plus any anchor re-injection XML the model should see on the next turn.",
    inputSchema: {
      type: "object",
      properties: {
        assistantMessage: {
          type: "string",
          description: "The assistant's output text to evaluate.",
        },
        userMessage: {
          type: "string",
          description: "Optional: the user's preceding message.",
        },
        turn: {
          type: "integer",
          minimum: 1,
          description: "Optional turn number. Auto-increments if omitted.",
        },
      },
      required: ["assistantMessage"],
      additionalProperties: false,
    },
  },
  {
    name: "dcgp_gate_text",
    description:
      "Run the active domain's HallucinationGate against arbitrary text. Returns every fired rule with severity and the matched substring. Use this to pre-screen text before inclusion in a prompt.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to scan." },
        context: {
          type: "string",
          enum: ["output", "input", "both"],
          default: "output",
          description: "Which gates to run (by context field).",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "dcgp_paths",
    description:
      "List all registered community paths with their id, name, and number of gates/anchors/drift rules.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "dcgp_get_directive",
    description:
      "Return the current RetentionDirective (PruneIntensity + globalFloor + protectedPaths). This is the Pruning Nexus wire that external consumers (like DCP) translate into their own config.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "dcgp_reset",
    description:
      "Reset EntropyMonitor state. mode=partial clears confidence and citation windows but retains gate/drift baselines (use on domain shift). mode=full wipes everything (use on session restart or CRITICAL recovery).",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["partial", "full"],
          default: "full",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "dcgp_inject_anchors",
    description:
      "Render the XML system-prompt injection block for the active domain (priority-sorted anchors with bloat mitigation). Returns the exact string to prepend to the next system prompt.",
    inputSchema: {
      type: "object",
      properties: {
        contextWindowTokens: {
          type: "integer",
          minimum: 1000,
          default: 128000,
          description: "Context window in tokens (for anchor bloat mitigation).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "dcgp_audit_vibe",
    description:
      "Static-analysis audit for AI-coded ('vibe-coded') flaws in a codebase. Runs 8 detectors (stub markers, hardcoded credentials, type-safety bypasses, command injection, test theater, predictable randomness, ReDoS risk, comment-density imbalance) and returns structured findings with file:line locations.",
    inputSchema: {
      type: "object",
      properties: {
        dir: {
          type: "string",
          description: "Directory to scan. Default: the server's workspace path.",
        },
        rule: {
          type: "string",
          enum: BUILTIN_RULES.map((r) => r.id),
          description: "Restrict to a single rule.",
        },
        severity: {
          type: "string",
          enum: ["info", "warn", "error", "critical"],
          description: "Drop findings below this severity.",
        },
        noTs: {
          type: "boolean",
          default: false,
          description: "Force regex-only mode (skip TypeScript AST detection).",
        },
      },
      additionalProperties: false,
    },
  },
];

/* ── Handlers ────────────────────────────────────────────────────────── */

export interface ToolHandlerContext {
  readonly runtime: DCGPRuntime;
  /** Auto-incrementing turn counter the handler uses when the client omits turn. */
  nextTurn(): number;
  /** Default workspace path for audit / resource calls when client omits dir. */
  readonly workspacePath: string;
}

export async function handleTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolHandlerContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const args = (rawArgs as Record<string, unknown>) ?? {};

  try {
    switch (name) {
      case "dcgp_classify":
        return textResult(JSON.stringify(ctx.runtime.classify(0), null, 2));

      case "dcgp_status": {
        const state = ctx.runtime.snapshotState();
        const directive = ctx.runtime.monitor.currentDirective();
        return textResult(
          JSON.stringify(
            {
              domain: state.activeDomainId,
              confidence: state.classificationConfidence,
              entropy: {
                level: ctx.runtime.monitor.currentLevel(),
                score: ctx.runtime.monitor.currentScore(),
              },
              directive,
              turn: state.currentTurn,
              stats: state.stats,
            },
            null,
            2,
          ),
        );
      }

      case "dcgp_process_turn": {
        const assistantMessage = requireString(args, "assistantMessage");
        const userMessage =
          typeof args.userMessage === "string" ? args.userMessage : undefined;
        const turn = typeof args.turn === "number" ? args.turn : ctx.nextTurn();
        const result = ctx.runtime.processTurn({ turn, userMessage, assistantMessage });
        return textResult(
          JSON.stringify(
            {
              directive: result.directive,
              entropyEvent: {
                level: result.event.level,
                score: result.event.score,
                actions: result.event.actions,
              },
              gateViolations: result.gateViolations,
              driftEvents: result.driftEvents,
              injection: result.injection,
            },
            null,
            2,
          ),
        );
      }

      case "dcgp_gate_text": {
        const text = requireString(args, "text");
        const context =
          args.context === "input" || args.context === "both" ? args.context : "output";
        if (context === "both") {
          // Gate does not accept "both" as a scan context. Run both and merge.
          const out = ctx.runtime.gate.scan(text, { turn: ctx.runtime.snapshotState().currentTurn, context: "output" });
          const inp = ctx.runtime.gate.scan(text, { turn: ctx.runtime.snapshotState().currentTurn, context: "input" });
          return textResult(
            JSON.stringify(
              { violations: [...out.violations, ...inp.violations], warmupBypass: out.warmupBypass || inp.warmupBypass },
              null,
              2,
            ),
          );
        }
        const result = ctx.runtime.gate.scan(text, {
          turn: ctx.runtime.snapshotState().currentTurn,
          context,
        });
        return textResult(JSON.stringify(result, null, 2));
      }

      case "dcgp_paths": {
        const summary = (ALL_PATHS as readonly ContextPath[]).map((p) => ({
          id: p.id,
          name: p.name,
          gates: p.gates.length,
          anchors: p.anchors.length,
          driftRules: p.driftRules.length,
        }));
        return textResult(JSON.stringify(summary, null, 2));
      }

      case "dcgp_get_directive":
        return textResult(JSON.stringify(ctx.runtime.monitor.currentDirective(), null, 2));

      case "dcgp_reset": {
        const mode = args.mode === "partial" ? "partial" : "full";
        if (mode === "partial") ctx.runtime.monitor.resetPartial();
        else ctx.runtime.monitor.reset();
        return textResult(`Reset mode=${mode} applied.`);
      }

      case "dcgp_inject_anchors": {
        const active = ctx.runtime.activeDomain;
        if (active === null) {
          return textResult("(no active domain - run dcgp_classify first)", true);
        }
        const contextWindowTokens =
          typeof args.contextWindowTokens === "number" ? args.contextWindowTokens : 128_000;
        const injected = ctx.runtime.injector.inject(active, { contextWindowTokens });
        return textResult(injected.xml);
      }

      case "dcgp_audit_vibe": {
        const dir = typeof args.dir === "string" ? args.dir : ctx.workspacePath;
        const rule = typeof args.rule === "string" ? (args.rule as RuleId) : undefined;
        const minSeverity =
          typeof args.severity === "string" ? (args.severity as Severity) : undefined;
        const noTs = args.noTs === true;
        const report = await auditWorkspace(BUILTIN_RULES, { dir, rule, minSeverity, noTs });
        return textResult(JSON.stringify(report, null, 2));
      }

      default:
        return textResult(`Unknown tool: ${name}`, true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return textResult(`Error in ${name}: ${message}`, true);
  }
}

function textResult(
  text: string,
  isError = false,
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  const result: { content: Array<{ type: "text"; text: string }>; isError?: boolean } = {
    content: [{ type: "text", text }],
  };
  if (isError) result.isError = true;
  return result;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing or empty required argument: ${key}`);
  }
  return value;
}
