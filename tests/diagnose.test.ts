import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseSpecs } from "../src/diagnose/index.js";

test("diagnoses missing token entries as contract sync work", async () => {
  const { specDir } = await fixture({
    contract: ["button.bg", "button.fg"],
    tokens: [token("button.bg", "#2563eb")],
  });

  const result = await diagnoseSpecs([specDir], { threshold: 80 });
  const diagnostic = result.diagnostics.find((d) => d.signal === "missing-token-entry");

  assert.equal(diagnostic?.severity, "high");
  assert.equal(diagnostic?.proposed_rule, "token-contract-sync");
  assert.match(diagnostic?.recommended_action ?? "", /tokens\.json/);
});

test("diagnoses low parity as a resolution worklist without changing validation", async () => {
  const { specDir } = await fixture({
    contract: ["button.bg", "button.fg", "button.radius"],
    tokens: [
      token("button.bg", "#2563eb"),
      token("button.fg", ""),
      token("button.radius", "8px"),
    ],
  });

  const result = await diagnoseSpecs([specDir], { threshold: 80 });
  const diagnostic = result.diagnostics.find((d) => d.signal === "parity");

  assert.equal(diagnostic?.severity, "medium");
  assert.equal(diagnostic?.confidence, 0.95);
  assert.match(diagnostic?.issue ?? "", /67%/);
});

test("turns recurring findings into a system-level learning candidate", async () => {
  const fixtures = await Promise.all(
    ["a", "b", "c"].map((name) =>
      fixture({
        component: name,
        contract: [`${name}.bg`, `${name}.fg`],
        tokens: [token(`${name}.bg`, "#2563eb")],
      }),
    ),
  );

  const result = await diagnoseSpecs(fixtures.map((fixture) => fixture.specDir), {
    threshold: 80,
  });
  const diagnostic = result.diagnostics.find((d) => d.signal === "recurring-rule");

  assert.equal(diagnostic?.component, "*");
  assert.equal(diagnostic?.proposed_rule, "missing-token-entry-system-learning");
  assert.match(diagnostic?.issue ?? "", /3 specs/);
});

async function fixture(options: {
  component?: string;
  contract: string[];
  tokens: Array<Record<string, unknown>>;
}): Promise<{ root: string; specDir: string }> {
  const component = options.component ?? "button";
  const root = await mkdtemp(join(tmpdir(), "agentic-spec-diagnose-"));
  const specDir = join(root, "specs", component);
  await mkdir(specDir, { recursive: true });
  await writeFile(join(specDir, "index.md"), indexMarkdown(component, options.contract), "utf8");
  await writeFile(
    join(specDir, "tokens.json"),
    JSON.stringify(
      {
        component,
        source: "fixture",
        version: "test@1.0.0",
        tokens: options.tokens,
      },
      null,
      2,
    ),
    "utf8",
  );
  return { root, specDir };
}

function token(name: string, light: string): Record<string, unknown> {
  return {
    name,
    tier: "component",
    role: "fixture",
    path: name,
    references: "{surface.default}",
    light,
    status: "existing",
  };
}

function indexMarkdown(component: string, contract: string[]): string {
  return `---
component: ${component}
ds_version: test@1.0.0
status: Draft
last_verified: 2020-01-01

category: Component
required_aria: []

semantic_parts:
  root: Root element

token_contract:
${contract.map((name) => `  - ${name}`).join("\n")}

interaction_states: [default]

checks:
  aria_correct: true
  structure_correct: true
  states_complete: true
  tokens_valid: true
  no_invented_styles: true

sources:
  code:
    path: src/components/${component}.tsx

patterns_used_in: []
pages_used_in: []
---

# ${component}
`;
}
