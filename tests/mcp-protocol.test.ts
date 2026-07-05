import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  listComponentContracts,
  parityReport,
  resolveToken,
  validatePaintedValues,
} from "../src/mcp/protocol.js";

test("lists contracts by parsed component name and status", async () => {
  const { root } = await fixture();

  const entries = await listComponentContracts(join(root, "specs"));

  assert.deepEqual(entries.map((entry) => [entry.component, entry.status]), [
    ["button", "Draft"],
  ]);
});

test("resolves a token from the closed sidecar", async () => {
  const { root } = await fixture();

  const result = await resolveToken(join(root, "specs"), "button", "button.bg");

  assert.equal(result?.component, "button");
  assert.equal(result?.inContract, true);
  assert.equal(result?.token.light, "#2563eb");
  assert.equal(result?.token.path, "button.bg");
});

test("returns parity report for one component", async () => {
  const { root } = await fixture();

  const result = await parityReport(join(root, "specs"), { component: "button" });

  assert.equal(result.specs.length, 1);
  assert.equal(result.specs[0]?.parity, 100);
  assert.equal(result.summary.avg, 100);
});

test("validates observed painted values against token values", async () => {
  const { root } = await fixture();

  const pass = await validatePaintedValues(join(root, "specs"), "button", [
    { token: "button.bg", value: "#2563EB" },
  ]);
  const fail = await validatePaintedValues(join(root, "specs"), "button", [
    { token: "button.bg", value: "#000000" },
    { token: "button.made-up", value: "#2563eb" },
  ]);

  assert.equal(pass?.passed, true);
  assert.equal(pass?.checked, 1);
  assert.match(pass?.note ?? "", /does not capture browser pixels/);
  assert.equal(fail?.passed, false);
  assert.equal(fail?.findings.length, 2);
});

async function fixture(): Promise<{ root: string; specDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "agentic-spec-mcp-protocol-"));
  const specDir = join(root, "specs", "button");
  await mkdir(specDir, { recursive: true });
  await writeFile(join(specDir, "index.md"), indexMarkdown(), "utf8");
  await writeFile(join(specDir, "tokens.json"), tokensJson(), "utf8");
  return { root, specDir };
}

function indexMarkdown(): string {
  return `---
component: button
ds_version: test@1.0.0
status: Draft
last_verified: 2020-01-01

category: Component
required_aria: []

semantic_parts:
  root: Root element

token_contract:
  - button.bg

interaction_states: [default]

checks:
  aria_correct: true
  structure_correct: true
  states_complete: true
  tokens_valid: true
  no_invented_styles: true

sources:
  code:
    path: src/components/Button.tsx

patterns_used_in: []
pages_used_in: []
---

# Button
`;
}

function tokensJson(): string {
  return JSON.stringify(
    {
      component: "button",
      source: "fixture",
      version: "test@1.0.0",
      tokens: [
        {
          name: "button.bg",
          tier: "component",
          role: "background",
          path: "button.bg",
          references: "{surface.default}",
          light: "#2563eb",
          status: "existing",
        },
      ],
    },
    null,
    2,
  );
}
