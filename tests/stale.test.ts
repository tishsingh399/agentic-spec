import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSpec } from "../src/validate/index.js";

const isoDaysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const md = (status: string, lastVerified: string) => `---
component: c
ds_version: test@1.0.0
status: ${status}
last_verified: ${lastVerified}
category: Component
required_aria: []
semantic_parts:
  root: the element
token_contract:
  - c.bg
interaction_states: [default]
checks:
  aria_correct: true
  structure_correct: true
  states_complete: true
  tokens_valid: true
  no_invented_styles: true
sources:
  react:
    path: src/C.tsx
---
# c
`;

async function fixture(status: string, lastVerified: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agspec-stale-"));
  await writeFile(join(dir, "index.md"), md(status, lastVerified));
  await writeFile(
    join(dir, "tokens.json"),
    JSON.stringify({
      component: "c",
      tokens: [{ name: "c.bg", tier: "component", role: "fill", path: "c.bg", references: "{action.primary}" }],
    }),
  );
  return dir;
}

const stale = (r: { findings: { rule: string; severity: string }[] }) =>
  r.findings.filter((f) => f.rule === "stale-spec");

test("fresh AI-Ready spec has no stale-spec finding", async () => {
  const res = await validateSpec(await fixture("AI-Ready", isoDaysAgo(10)));
  assert.equal(stale(res).length, 0);
});

test("AI-Ready spec older than 90d warns", async () => {
  const res = await validateSpec(await fixture("AI-Ready", isoDaysAgo(120)));
  const f = stale(res);
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, "warning");
});

test("AI-Ready spec older than 180d errors", async () => {
  const res = await validateSpec(await fixture("AI-Ready", isoDaysAgo(200)));
  const f = stale(res);
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, "error");
});

test("a Draft spec is never gated for staleness", async () => {
  const res = await validateSpec(await fixture("Draft", isoDaysAgo(500)));
  assert.equal(stale(res).length, 0);
});
