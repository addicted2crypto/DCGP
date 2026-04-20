/**
 * MCP resource providers. Resources are READ-ONLY views of DCGP state that
 * any MCP client can fetch (Claude Desktop, Cline, OpenWebUI, etc.).
 *
 * URIs:
 *   dcgp://session-state     - JSON snapshot of DCGPSessionState
 *   dcgp://active-path       - JSON of the currently classified ContextPath
 *   dcgp://anchors           - Rendered XML injection block
 *   dcgp://hardrules         - HARDRULES.md contents (user-owned absolute rules)
 *   dcgp://agents            - AGENTS.md contents (operational spec)
 *   dcgp://spec              - DCGP-SPEC.md contents (normative protocol)
 *   dcgp://compliance        - COMPLIANCE file (declared tier)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { DCGPRuntime } from "@dcgp/opencode";

export interface McpResource {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: string;
}

export const RESOURCE_DEFINITIONS: readonly McpResource[] = [
  {
    uri: "dcgp://session-state",
    name: "Session state",
    description: "JSON snapshot of the current DCGPSessionState.",
    mimeType: "application/json",
  },
  {
    uri: "dcgp://active-path",
    name: "Active domain path",
    description: "The currently classified ContextPath (signals, anchors, gates, drift rules).",
    mimeType: "application/json",
  },
  {
    uri: "dcgp://anchors",
    name: "System-prompt injection",
    description: "Rendered XML block to prepend to the next system prompt.",
    mimeType: "text/plain",
  },
  {
    uri: "dcgp://hardrules",
    name: "HARDRULES.md",
    description: "User-owned absolute rules. These override everything.",
    mimeType: "text/markdown",
  },
  {
    uri: "dcgp://agents",
    name: "AGENTS.md",
    description: "DCGP operational spec: 7-step loop, formula, never-list.",
    mimeType: "text/markdown",
  },
  {
    uri: "dcgp://spec",
    name: "DCGP-SPEC.md",
    description: "Normative DCGP-1.0 protocol (conformance tiers, Retention Bridge).",
    mimeType: "text/markdown",
  },
  {
    uri: "dcgp://compliance",
    name: "COMPLIANCE",
    description: "Declared conformance tier (single line).",
    mimeType: "text/plain",
  },
];

export interface ResourceHandlerContext {
  readonly runtime: DCGPRuntime;
  readonly workspacePath: string;
}

export async function readResource(
  uri: string,
  ctx: ResourceHandlerContext,
): Promise<{ contents: Array<{ uri: string; mimeType?: string; text: string }> }> {
  switch (uri) {
    case "dcgp://session-state":
      return textResource(uri, JSON.stringify(ctx.runtime.snapshotState(), null, 2), "application/json");

    case "dcgp://active-path": {
      const active = ctx.runtime.activeDomain;
      if (active === null) {
        return textResource(uri, "null", "application/json");
      }
      return textResource(uri, JSON.stringify(active, null, 2), "application/json");
    }

    case "dcgp://anchors": {
      const active = ctx.runtime.activeDomain;
      if (active === null) return textResource(uri, "", "text/plain");
      return textResource(uri, ctx.runtime.injector.inject(active).xml, "text/plain");
    }

    case "dcgp://hardrules":
      return fileResource(uri, ctx.workspacePath, "HARDRULES.md", "text/markdown");

    case "dcgp://agents":
      return fileResource(uri, ctx.workspacePath, "AGENTS.md", "text/markdown");

    case "dcgp://spec":
      return fileResource(uri, ctx.workspacePath, "DCGP-SPEC.md", "text/markdown");

    case "dcgp://compliance":
      return fileResource(uri, ctx.workspacePath, "COMPLIANCE", "text/plain");

    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }
}

function textResource(
  uri: string,
  text: string,
  mimeType: string,
): { contents: Array<{ uri: string; mimeType?: string; text: string }> } {
  return { contents: [{ uri, mimeType, text }] };
}

function fileResource(
  uri: string,
  workspacePath: string,
  relPath: string,
  mimeType: string,
): { contents: Array<{ uri: string; mimeType?: string; text: string }> } {
  const abs = join(workspacePath, relPath);
  if (!existsSync(abs)) {
    return textResource(uri, `(not found: ${relPath})`, mimeType);
  }
  return textResource(uri, readFileSync(abs, "utf8"), mimeType);
}
