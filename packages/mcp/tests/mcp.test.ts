import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { createServer, type DCGPMcpServer } from "../src";

function tempWorkspace(contents: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "dcgp-mcp-"));
  for (const [rel, body] of Object.entries(contents)) {
    writeFileSync(join(dir, rel), body, "utf8");
  }
  return dir;
}

interface Harness {
  client: Client;
  server: DCGPMcpServer;
}

async function startHarness(workspace: string): Promise<Harness> {
  const dcgp = createServer({ workspacePath: workspace });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "dcgp-test-client", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([client.connect(clientTransport), dcgp.connect(serverTransport)]);
  return { client, server: dcgp };
}

async function teardown(h: Harness): Promise<void> {
  await h.client.close();
  await h.server.close();
}

describe("DCGP MCP server - tool discovery", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(tempWorkspace());
  });
  afterEach(async () => {
    await teardown(h);
  });

  it("lists all 8 DCGP tools", async () => {
    const response = await h.client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);
    const names = response.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "dcgp_classify",
      "dcgp_gate_text",
      "dcgp_get_directive",
      "dcgp_inject_anchors",
      "dcgp_paths",
      "dcgp_process_turn",
      "dcgp_reset",
      "dcgp_status",
    ]);
  });

  it("every tool has a description and inputSchema", async () => {
    const response = await h.client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);
    for (const tool of response.tools) {
      expect(tool.description, `tool ${tool.name} needs a description`).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
  });
});

describe("DCGP MCP server - resource discovery", () => {
  it("lists all DCGP resources", async () => {
    const h = await startHarness(tempWorkspace());
    try {
      const response = await h.client.request(
        { method: "resources/list", params: {} },
        ListResourcesResultSchema,
      );
      const uris = response.resources.map((r) => r.uri).sort();
      expect(uris).toContain("dcgp://session-state");
      expect(uris).toContain("dcgp://active-path");
      expect(uris).toContain("dcgp://anchors");
      expect(uris).toContain("dcgp://hardrules");
      expect(uris).toContain("dcgp://agents");
      expect(uris).toContain("dcgp://spec");
      expect(uris).toContain("dcgp://compliance");
    } finally {
      await teardown(h);
    }
  });
});

describe("DCGP MCP server - tool invocation", () => {
  it("dcgp_classify returns a domain for a Node.js workspace", async () => {
    const workspace = tempWorkspace({
      "package.json": JSON.stringify({ dependencies: { express: "^5.0.0" } }),
    });
    const h = await startHarness(workspace);
    try {
      const result = await h.client.request(
        { method: "tools/call", params: { name: "dcgp_classify", arguments: {} } },
        CallToolResultSchema,
      );
      const text = (result.content[0] as { type: "text"; text: string }).text;
      const parsed = JSON.parse(text);
      expect(parsed.domain).toBe("nodejs");
      expect(parsed.confidence).toBeGreaterThan(0);
    } finally {
      await teardown(h);
    }
  });

  it("dcgp_paths lists all 16 community paths", async () => {
    const h = await startHarness(tempWorkspace());
    try {
      const result = await h.client.request(
        { method: "tools/call", params: { name: "dcgp_paths", arguments: {} } },
        CallToolResultSchema,
      );
      const text = (result.content[0] as { type: "text"; text: string }).text;
      const parsed = JSON.parse(text);
      expect(parsed).toHaveLength(16);
      expect(parsed.map((p: { id: string }) => p.id)).toContain("nodejs");
      expect(parsed.map((p: { id: string }) => p.id)).toContain("evm");
    } finally {
      await teardown(h);
    }
  });

  it("dcgp_process_turn runs a turn and returns a directive", async () => {
    const workspace = tempWorkspace({
      "package.json": JSON.stringify({ dependencies: { express: "^5.0.0" } }),
    });
    const h = await startHarness(workspace);
    try {
      const result = await h.client.request(
        {
          method: "tools/call",
          params: {
            name: "dcgp_process_turn",
            arguments: { assistantMessage: "let me help with your Express setup" },
          },
        },
        CallToolResultSchema,
      );
      const text = (result.content[0] as { type: "text"; text: string }).text;
      const parsed = JSON.parse(text);
      expect(parsed.directive).toBeDefined();
      expect(parsed.directive.intensity).toBeDefined();
      expect(parsed.directive.globalFloor).toBeGreaterThanOrEqual(0);
    } finally {
      await teardown(h);
    }
  });

  it("dcgp_process_turn detects cross-domain drift", async () => {
    const workspace = tempWorkspace({
      "package.json": JSON.stringify({ dependencies: { express: "^5.0.0" } }),
    });
    const h = await startHarness(workspace);
    try {
      const result = await h.client.request(
        {
          method: "tools/call",
          params: {
            name: "dcgp_process_turn",
            arguments: {
              assistantMessage: "Run pip install requests to add the http library.",
            },
          },
        },
        CallToolResultSchema,
      );
      const text = (result.content[0] as { type: "text"; text: string }).text;
      const parsed = JSON.parse(text);
      expect(parsed.driftEvents.length).toBeGreaterThan(0);
      expect(parsed.driftEvents[0].sourceDomain).toBe("python");
    } finally {
      await teardown(h);
    }
  });

  it("dcgp_get_directive returns the current Pruning Nexus floor", async () => {
    const h = await startHarness(tempWorkspace());
    try {
      const result = await h.client.request(
        { method: "tools/call", params: { name: "dcgp_get_directive", arguments: {} } },
        CallToolResultSchema,
      );
      const text = (result.content[0] as { type: "text"; text: string }).text;
      const parsed = JSON.parse(text);
      expect(parsed.globalFloor).toBeGreaterThanOrEqual(0);
      expect(parsed.globalFloor).toBeLessThanOrEqual(1);
    } finally {
      await teardown(h);
    }
  });

  it("dcgp_reset accepts partial and full modes", async () => {
    const h = await startHarness(tempWorkspace());
    try {
      for (const mode of ["partial", "full"] as const) {
        const result = await h.client.request(
          { method: "tools/call", params: { name: "dcgp_reset", arguments: { mode } } },
          CallToolResultSchema,
        );
        const text = (result.content[0] as { type: "text"; text: string }).text;
        expect(text).toContain(mode);
      }
    } finally {
      await teardown(h);
    }
  });

  it("unknown tool returns an error result (not a throw)", async () => {
    const h = await startHarness(tempWorkspace());
    try {
      const result = await h.client.request(
        { method: "tools/call", params: { name: "dcgp_does_not_exist", arguments: {} } },
        CallToolResultSchema,
      );
      expect(result.isError).toBe(true);
    } finally {
      await teardown(h);
    }
  });
});

describe("DCGP MCP server - resource reads", () => {
  it("reads session-state as JSON", async () => {
    const h = await startHarness(tempWorkspace());
    try {
      const result = await h.client.request(
        { method: "resources/read", params: { uri: "dcgp://session-state" } },
        ReadResourceResultSchema,
      );
      const contents = result.contents[0] as { text: string; mimeType?: string };
      expect(contents.mimeType).toBe("application/json");
      expect(() => JSON.parse(contents.text)).not.toThrow();
    } finally {
      await teardown(h);
    }
  });

  it("reads HARDRULES.md from the workspace when present", async () => {
    const workspace = tempWorkspace({ "HARDRULES.md": "# Test hard rules\n!important TEST-001" });
    const h = await startHarness(workspace);
    try {
      const result = await h.client.request(
        { method: "resources/read", params: { uri: "dcgp://hardrules" } },
        ReadResourceResultSchema,
      );
      const contents = result.contents[0] as { text: string };
      expect(contents.text).toContain("TEST-001");
    } finally {
      await teardown(h);
    }
  });

  it("returns not-found placeholder when governance file is missing", async () => {
    const h = await startHarness(tempWorkspace());
    try {
      const result = await h.client.request(
        { method: "resources/read", params: { uri: "dcgp://agents" } },
        ReadResourceResultSchema,
      );
      const contents = result.contents[0] as { text: string };
      expect(contents.text).toContain("not found");
    } finally {
      await teardown(h);
    }
  });
});
