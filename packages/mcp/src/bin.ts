/**
 * dcgp-mcp - CLI entry for the DCGP MCP server.
 *
 * Starts the server on stdio transport. Claude Desktop, Cline, OpenWebUI,
 * and any MCP-compatible client spawn this as a subprocess and talk to it
 * via JSON-RPC over stdin/stdout.
 *
 * Config flags / env vars (flag wins over env):
 *   --workspace <path>   (env DCGP_WORKSPACE) default: process.cwd()
 *   --session-id <id>    (env DCGP_SESSION_ID) default: null
 *   --persist <path>     (env DCGP_PERSIST_PATH) optional, enables SessionState save
 *   --context-window N   (env DCGP_CONTEXT_WINDOW) default: 128000
 *
 * Example (Claude Desktop config):
 *   {
 *     "mcpServers": {
 *       "dcgp": {
 *         "command": "npx",
 *         "args": ["-y", "@dcgp/mcp", "--workspace", "${workspaceFolder}"]
 *       }
 *     }
 *   }
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

interface CliArgs {
  workspace: string;
  sessionId: string | null;
  persistPath: string | undefined;
  contextWindow: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined || !a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }

  const workspace =
    args.workspace ?? process.env.DCGP_WORKSPACE ?? process.cwd();
  const sessionId =
    args["session-id"] ?? process.env.DCGP_SESSION_ID ?? null;
  const persistPath = args.persist ?? process.env.DCGP_PERSIST_PATH;
  const contextWindowRaw = args["context-window"] ?? process.env.DCGP_CONTEXT_WINDOW ?? "128000";
  const contextWindow = Number.parseInt(contextWindowRaw, 10);
  if (!Number.isFinite(contextWindow) || contextWindow < 1000) {
    throw new Error(`context-window must be an integer >= 1000 (got ${contextWindowRaw})`);
  }

  return {
    workspace,
    sessionId,
    persistPath,
    contextWindow,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const dcgp = createServer({
    workspacePath: args.workspace,
    sessionId: args.sessionId,
    ...(args.persistPath !== undefined ? { persistPath: args.persistPath } : {}),
    contextWindowTokens: args.contextWindow,
  });

  const transport = new StdioServerTransport();
  await dcgp.connect(transport);

  const shutdown = async (): Promise<void> => {
    try {
      await dcgp.close();
    } catch {
      // ignore - we are exiting anyway
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // MCP uses stdout for JSON-RPC, so all error logging must go to stderr.
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  process.stderr.write(`dcgp-mcp fatal: ${message}\n`);
  process.exit(1);
});
