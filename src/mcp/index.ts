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
import { resolve } from "node:path";
import { z } from "zod";
import {
  listComponentContracts,
  parityReport,
  readContractBundle,
  resolveToken,
  validateContract,
  validatePaintedValues,
} from "./protocol.js";

const ROOT = process.env.AGENTIC_SPEC_ROOT || process.argv[2] || "specs";

const server = new McpServer({ name: "agentic-spec", version: "0.2.0" });

server.tool(
  "list_components",
  "List every component in this design system that has a machine-readable contract, with its status. Call this first to see what you can build against.",
  {},
  async () => {
    const entries = await listComponentContracts(ROOT);
    if (entries.length === 0) {
      return { content: [{ type: "text", text: `No specs found under ${resolve(ROOT)}` }] };
    }

    const rows = entries.map((entry) => `${entry.component}\t${entry.status}`);
    return { content: [{ type: "text", text: `component\tstatus\n${rows.join("\n")}` }] };
  },
);

server.tool(
  "get_contract",
  "Return the full contract for a component — the closed token list, named parts, required ARIA, and interaction states — that you MUST read and obey before writing or editing this component. Anything outside tokens.json is a violation.",
  { component: z.string().describe("component name, e.g. 'button' (see list_components)") },
  async ({ component }) => {
    const bundle = await readContractBundle(ROOT, component);
    if (!bundle) {
      return {
        content: [{ type: "text", text: `No contract for "${component}". Run list_components.` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text:
            `# Contract: ${component}\n\n` +
            `## index.md\n${bundle.specMarkdown}\n\n` +
            `## tokens.json — closed token list (using anything not in here is a violation)\n` +
            "```json\n" +
            bundle.tokensJson +
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
    const r = await validateContract(ROOT, component);
    if (!r) {
      return {
        content: [{ type: "text", text: `No contract for "${component}".` }],
        isError: true,
      };
    }

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

server.tool(
  "validate_contract",
  "Validate a component contract and return the same pass/fail signal as the CI validator, in structured JSON for agents that need a machine-readable gate.",
  { component: z.string().describe("component name to validate") },
  async ({ component }) => {
    const result = await validateContract(ROOT, component);
    if (!result) {
      return {
        content: [{ type: "text", text: `No contract for "${component}".` }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "resolve_token",
  "Look up one token inside a component's closed token sidecar. Use this before writing CSS so the agent can see the real tier, path, role, references, and concrete values instead of inventing them.",
  {
    component: z.string().describe("component name, e.g. 'button'"),
    token: z.string().describe("token name from token_contract, e.g. 'button.bg.default'"),
  },
  async ({ component, token }) => {
    const result = await resolveToken(ROOT, component, token);
    if (!result) {
      return {
        content: [{ type: "text", text: `No token "${token}" found for "${component}".` }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "get_parity_report",
  "Report token-contract parity: every token in index.md must have a concrete value in tokens.json. This is the same parity concept used by the CLI, exposed to agents.",
  {
    component: z.string().optional().describe("optional component name; omit for all specs"),
    threshold: z.number().optional().describe("optional passing threshold percentage, default 95"),
  },
  async ({ component, threshold }) => {
    const result = await parityReport(ROOT, { component, threshold });
    if (component && result.specs.length === 0) {
      return {
        content: [{ type: "text", text: `No contract for "${component}".` }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "validate_painted_values",
  "Compare rendered CSS values supplied by a browser/Figma bridge against the component's token sidecar. This does not capture pixels by itself; it verifies observed values from another tool.",
  {
    component: z.string().describe("component name to check"),
    observed: z.array(
      z.object({
        token: z.string().describe("token name that was rendered"),
        value: z.string().describe("rendered CSS value observed by another tool"),
        mode: z.enum(["light", "dark"]).optional().describe("theme mode to compare, default light"),
      }),
    ),
  },
  async ({ component, observed }) => {
    const result = await validatePaintedValues(ROOT, component, observed);
    if (!result) {
      return {
        content: [{ type: "text", text: `No contract for "${component}".` }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
// Logs go to stderr so they don't corrupt the stdio JSON-RPC stream.
console.error(`[agentic-spec mcp] serving contracts from ${resolve(ROOT)}`);
