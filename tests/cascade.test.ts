import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSpec } from "../src/validate/index.js";

const frontmatter = (component: string, contract: string[]) => `---
component: ${component}
ds_version: test@1.0.0
status: Draft
last_verified: 2026-06-01
category: Component
required_aria: []
semantic_parts:
  root: the element
token_contract:
${contract.map((c) => `  - ${c}`).join("\n")}
interaction_states: [default]
checks:
  aria_correct: false
  structure_correct: false
  states_complete: false
  tokens_valid: false
  no_invented_styles: false
sources:
  react:
    path: src/X.tsx
---
# ${component}
`;

async function fixture(component: string, tokens: object[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agspec-cascade-"));
  await mkdir(dir, { recursive: true });
  const contract = tokens.map((t: any) => t.name);
  await writeFile(join(dir, "index.md"), frontmatter(component, contract));
  await writeFile(
    join(dir, "tokens.json"),
    JSON.stringify({ component, tokens }, null, 2),
  );
  return dir;
}

const cascadeFindings = (r: { findings: { rule: string }[] }) =>
  r.findings.filter((f) => f.rule === "bad-cascade-direction");

test("flags a component colour token bound straight to a primitive", async () => {
  const dir = await fixture("bad", [
    { name: "bad.bg", tier: "component", role: "fill", path: "bad.bg", references: "{color.blue.6}" },
  ]);
  const res = await validateSpec(dir);
  const found = cascadeFindings(res);
  assert.equal(found.length, 1, "expected one bad-cascade-direction finding");
  assert.equal(found[0].severity, "error");
});

test("flags a primitive token that has a references field", async () => {
  const dir = await fixture("rooted", [
    { name: "color.blue.6", tier: "primitive", role: "swatch", path: "color.blue.6", references: "{color.blue.5}" },
  ]);
  const res = await validateSpec(dir);
  assert.equal(cascadeFindings(res).length, 1);
});

test("passes a component colour token that binds through a semantic", async () => {
  const dir = await fixture("good", [
    { name: "good.bg", tier: "component", role: "fill", path: "good.bg", references: "{action.primary}" },
  ]);
  const res = await validateSpec(dir);
  assert.equal(cascadeFindings(res).length, 0);
});

test("allows a component dimension token to reference a primitive scale directly", async () => {
  const dir = await fixture("dim", [
    { name: "dim.radius", tier: "component", role: "radius", path: "dim.radius", references: "{radius.md}" },
  ]);
  const res = await validateSpec(dir);
  assert.equal(cascadeFindings(res).length, 0);
});
