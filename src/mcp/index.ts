#!/usr/bin/env node
// MCP server for agentic-spec.
//
// The CLI enforces the contract in CI — after the fact. This server hands the
// contract to an agent (Claude, Cursor, Copilot) BEFORE it writes code, inside
// the tools the agent actually runs in, and lets it check its own work against
// the closed token list. That closes the loop the CLI only covers at review.
//
// Run:  agentic-spec-mcp [specsRoot]      (default: ./specs, or AGENTIC_SPEC_ROOT)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { expandSpecDirs } from "../discover.js";
import { validateSpec } from "../validate/index.js";

const ROOT = process.env.AGENTIC_SPEC_ROOT || process.argv[2] || "specs";

/** Map component name → spec directory, parsed from each spec's frontmatter. */
async function specIndex(): Promise<Map<string, string>> {
  const dirs = await expandSpecDirs([ROOT]);
  const map = new Map<string, string>();
  for (const dir of dirs) {
    let name = basename(dir);
    try {
      const raw = await readFile(join(dir, "index.md"), "utf8");
      const fm = /^---\n([\s\S]*?)\n---/.exec(raw);
      if (fm) {
        const parsed = parseYaml(fm[1] ?? "") as { component?: string } | null;
        if (parsed?.component) name = String(parsed.component);
      }
    } catch {
      /* fall back to basename */
    }
    map.set(name, dir);
  }
  return map;
}

function resolveDir(map: Map<string, string>, name: string): string | undefined {
  return map.get(name) ?? map.get(name.toLowerCase());
}

const server = new McpServer({ name: "agentic-spec", version: "0.1.0" });

server.tool(
  "list_components",
  "List every component in this design system that has a machine-readable contract, with its status. Call this first to see what you can build against.",
  {},
  async () => {
    const map = await specIndex();
    if (map.size === 0)
      return { content: [{ type: "text", text: `No specs found under ${resolve(ROOT)}` }] };
    const rows: string[] = [];
    for (const [name, dir] of [...map].sort()) {
      let status = "unknown";
      try {
        const raw = await readFile(join(dir, "index.md"), "utf8");
        const m = /^status:\s*(\S+)/m.exec(raw);
        if (m) status = m[1]!;
      } catch {
        /* ignore */
      }
      rows.push(`${name}\t${status}`);
    }
    return { content: [{ type: "text", text: `component\tstatus\n${rows.join("\n")}` }] };
  },
);

server.tool(
  "get_contract",
  "Return the full contract for a component — the closed token list, named parts, required ARIA, and interaction states — that you MUST read and obey before writing or editing this component. Anything outside tokens.json is a violation.",
  { component: z.string().describe("component name, e.g. 'button' (see list_components)") },
  async ({ component }) => {
    const map = await specIndex();
    const dir = resolveDir(map, component);
    if (!dir)
      return {
        content: [{ type: "text", text: `No contract for "${component}". Run list_components.` }],
        isError: true,
      };
    const index = await readFile(join(dir, "index.md"), "utf8");
    let tokens = "(no tokens.json found)";
    try {
      tokens = await readFile(join(dir, "tokens.json"), "utf8");
    } catch {
      /* ignore */
    }
    return {
      content: [
        {
          type: "text",
          text:
            `# Contract: ${component}\n\n` +
            `## index.md\n${index}\n\n` +
            `## tokens.json — closed token list (using anything not in here is a violation)\n` +
            "```json\n" +
            tokens +
            "\n```",
        },
      ],
    };
  },
);

server.tool(
  "validate_spec",
  "Validate a component against its token contract and report violations (invented tokens, wrong token tier, token/contract drift, identity mismatch, self-reported lying). Run this after editing to confirm you stayed inside the contract.",
  { component: z.string().describe("component name to validate") },
  async ({ component }) => {
    const map = await specIndex();
    const dir = resolveDir(map, component);
    if (!dir)
      return {
        content: [{ type: "text", text: `No contract for "${component}".` }],
        isError: true,
      };
    const r = await validateSpec(dir);
    const errors = r.findings.filter((f) => f.severity === "error");
    const head = r.passed
      ? `PASS ${component}`
      : `FAIL ${component} — ${errors.length} error(s)`;
    const lines = r.findings.map(
      (f) => `[${f.severity}] ${f.rule}: ${f.message}${f.at ? ` (${f.at})` : ""}`,
    );
    return {
      content: [
        {
          type: "text",
          text:
            `${head}\n` +
            `tokens: ${r.stats.tokens_in_contract} · states: ${r.stats.interaction_states} · parts: ${r.stats.semantic_parts}\n` +
            (lines.length ? lines.join("\n") : "(no findings)"),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
// Logs go to stderr so they don't corrupt the stdio JSON-RPC stream.
console.error(`[agentic-spec mcp] serving contracts from ${resolve(ROOT)}`);
