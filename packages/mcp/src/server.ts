/**
 * DCGP MCP server core.
 *
 * Construct via createServer(opts), then call connect(transport). The server
 * is transport-agnostic: bin.ts wires it to stdio for Claude Desktop; tests
 * wire it to an in-memory transport.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { DCGPRuntime, type DCGPRuntimeOptions } from "@dcgp/opencode";

import { TOOL_DEFINITIONS, handleTool, type ToolHandlerContext } from "./tools";
import { RESOURCE_DEFINITIONS, readResource } from "./resources";

export interface CreateServerOptions extends DCGPRuntimeOptions {
  /** Server metadata reported to the client. */
  readonly name?: string;
  readonly version?: string;
}

export interface DCGPMcpServer {
  readonly server: Server;
  readonly runtime: DCGPRuntime;
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
}

export function createServer(opts: CreateServerOptions): DCGPMcpServer {
  const runtime = new DCGPRuntime(opts);
  runtime.classify(0);

  let turnCounter = 0;
  const ctx: ToolHandlerContext = {
    runtime,
    nextTurn() {
      turnCounter += 1;
      return turnCounter;
    },
  };

  const server = new Server(
    {
      name: opts.name ?? "dcgp",
      version: opts.version ?? "1.0.0-rc.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as never,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return handleTool(request.params.name, request.params.arguments, ctx);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCE_DEFINITIONS.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return readResource(request.params.uri, {
      runtime,
      workspacePath: opts.workspacePath,
    });
  });

  return {
    server,
    runtime,
    async connect(transport) {
      await server.connect(transport);
    },
    async close() {
      runtime.persist();
      await server.close();
    },
  };
}
