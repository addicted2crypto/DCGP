/**
 * @dcgp/opencode - OpenCode plugin bootstrap.
 *
 * Usage (in OpenCode config):
 *
 *   {
 *     "plugins": ["@dcgp/opencode"]
 *   }
 *
 * Pairs with @tarquinen/opencode-dcp (DCP) when DCP is installed. DCGP
 * decides policy (entropy level -> retention directive). DCP enforces
 * pruning mechanics. The bridge translates each directive into the
 * DCP-shaped config patch that matches DCP's public config schema.
 *
 * Host hooks (generic shape that any tool can adapt):
 *
 *   onSessionStart(workspace)       - fingerprint + classify
 *   onUserMessage(msg, turn)        - record user turn (no scan yet)
 *   onAssistantMessage(msg, turn)   - scan output, run monitor, emit directive
 *   onTurnEnd(turn)                 - persist state
 *   onSlashCommand(input)           - /dcgp ... dispatch
 */

import { DCGPRuntime, type DCGPRuntimeOptions, type TurnResult } from "./runtime";
import {
  DCPBridge,
  isDcpInstalled,
  CONFIG_TRANSLATION,
  DCP_PACKAGE_NAME,
  DCP_PROJECT_CONFIG_PATH,
  type DcpConfigPatch,
  type DirectiveObserver,
} from "./dcp-bridge";
import { dispatch, SLASH_COMMANDS } from "./commands";

export {
  DCGPRuntime,
  DCPBridge,
  isDcpInstalled,
  CONFIG_TRANSLATION,
  DCP_PACKAGE_NAME,
  DCP_PROJECT_CONFIG_PATH,
  dispatch,
  SLASH_COMMANDS,
};
export type { DCGPRuntimeOptions, TurnResult, DcpConfigPatch, DirectiveObserver };

export interface OpenCodeHooks {
  onSessionStart(workspace: string, sessionId?: string | null): Promise<void>;
  onUserMessage(message: string, turn: number): void;
  onAssistantMessage(message: string, turn: number): TurnResult | null;
  onTurnEnd(turn: number): void;
  onSlashCommand(command: string): string;
}

export interface CreatePluginOptions extends Omit<DCGPRuntimeOptions, "workspacePath"> {
  /**
   * Observer for DCP config patches. When DCP is installed and you own
   * its config file, register a handler here that writes the patch to
   * .opencode/dcp.jsonc (or invokes a future DCP live-reload API).
   *
   * If omitted, directives are still emitted internally and enforced by
   * DCGP's own RetentionScorer - DCP just runs its default policy.
   */
  readonly dcpObserver?: DirectiveObserver;
}

/**
 * Create an OpenCode plugin instance. The returned hooks object matches
 * the OpenCode plugin contract and also works as a generic adapter.
 */
export function createPlugin(options: CreatePluginOptions = {}): OpenCodeHooks {
  let runtime: DCGPRuntime | null = null;
  const bridge = new DCPBridge();
  if (options.dcpObserver !== undefined) {
    bridge.onDirective(options.dcpObserver);
  }
  let pendingUserMessage: string | null = null;

  const requireRuntime = (): DCGPRuntime => {
    if (runtime === null) {
      throw new Error(
        "DCGP plugin: onSessionStart must be called before any other hook.",
      );
    }
    return runtime;
  };

  return {
    async onSessionStart(workspace, sessionId) {
      runtime = new DCGPRuntime({
        workspacePath: workspace,
        sessionId: sessionId ?? null,
        ...options,
      });
      runtime.classify(0);
    },

    onUserMessage(message, _turn) {
      pendingUserMessage = message;
    },

    onAssistantMessage(message, turn) {
      const rt = requireRuntime();
      const result = rt.processTurn({
        turn,
        userMessage: pendingUserMessage ?? undefined,
        assistantMessage: message,
      });
      pendingUserMessage = null;
      bridge.forward(result.directive);
      return result;
    },

    onTurnEnd(_turn) {
      const rt = requireRuntime();
      rt.persist();
    },

    onSlashCommand(command) {
      const rt = requireRuntime();
      return dispatch(rt, command);
    },
  };
}

export default createPlugin;
