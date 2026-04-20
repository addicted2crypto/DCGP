/**
 * @dcgp/mcp - public API.
 *
 * Most users only need the `dcgp-mcp` binary (installed when you run
 * `npm install -g @dcgp/mcp`). Wire it into Claude Desktop or OpenWebUI
 * via the usual MCP server config.
 *
 * Import this module only if you are embedding the DCGP MCP server inside
 * a larger process (custom agent, test harness).
 */

export { createServer } from "./server";
export type { CreateServerOptions, DCGPMcpServer } from "./server";
export { TOOL_DEFINITIONS } from "./tools";
export type { McpTool } from "./tools";
export { RESOURCE_DEFINITIONS } from "./resources";
export type { McpResource } from "./resources";
