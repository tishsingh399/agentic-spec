import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSpec } from "../src/validate/index.js";

const md = (sourceAbsPath: string) => `---
component: c
ds_version: test@1.0.0
status: Draft
last_verified: 2026-06-01
category: Component
required_aria: []
semantic_parts:
  root: the element
token_contract:
  - c.bg.default
interaction_states: [default]
checks:
  aria_correct: false
  structure_correct: false
  states_complete: false
  tokens_valid: false
  no_invented_styles: false
sources:
  react:
    path: ${sourceAbsPath}
---
# c
`;

async function fixture(sourceContents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agspec-usage-"));
  const src = join(dir, "C.tsx");
  await writeFile(src, sourceContents);
  await writeFile(join(dir, "index.md"), md(src));
  await writeFile(
    join(dir, "tokens.json"),
    JSON.stringify({
      component: "c",
      tokens: [{ name: "c.bg.default", tier: "component", role: "fill", path: "c.bg.default", references: "{action.primary}" }],
    }),
  );
  return dir;
}

const usage = (r: { findings: { rule: string; severity: string }[] }) =>
  r.findings.filter((f) => f.rule === "code-token-usage");

test("no finding when the source references the token by its dashed var", async () => {
  const res = await validateSpec(await fixture(`const x = 'var(--cds-c-bg-default)';`));
  assert.equal(usage(res).length, 0);
});

test("no finding when the source references the dotted token name", async () => {
  const res = await validateSpec(await fixture(`// binds c.bg.default\nexport const C = 1;`));
  assert.equal(usage(res).length, 0);
});

test("warns when the source references the token nowhere", async () => {
  const res = await validateSpec(await fixture(`export const C = () => null;`));
  const f = usage(res);
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, "warning");
});
