import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "../src/validate/index.js";

test("reports raw style literals inside style object contexts", async () => {
  const { root, specDir } = await fixture({
    source: `export function Button() {
  return <button style={{ background: "#abc", transitionDuration: "120ms" }}>Save</button>;
}`,
  });

  const result = await withCwd(root, () => validateSpec(specDir));
  const findings = result.findings.filter((f) => f.rule === "no-invented-styles");

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.severity, "warning");
  assert.match(findings[0]?.message ?? "", /#abc/);
  assert.match(findings[0]?.message ?? "", /120ms/);
});

test("ignores raw style-looking values in comments", async () => {
  const { root, specDir } = await fixture({
    source: `export function Button() {
  // background: "#abc"; transition: 120ms;
  return <button style={{ color: "var(--button-fg)" }}>Save</button>;
}`,
  });

  const result = await withCwd(root, () => validateSpec(specDir));

  assert.equal(result.findings.filter((f) => f.rule === "no-invented-styles").length, 0);
});

test("reports missing Storybook files for declared states", async () => {
  const { root, specDir } = await fixture({
    source: `export function Button() {
  return <button style={{ color: "var(--button-fg)" }}>Save</button>;
}`,
    writeStory: false,
  });

  const result = await withCwd(root, () => validateSpec(specDir));
  const findings = result.findings.filter((f) => f.rule === "states-complete");

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.severity, "warning");
  assert.match(findings[0]?.message ?? "", /Storybook file/);
});

test("passes clean self-report fixtures without findings", async () => {
  const { root, specDir } = await fixture({
    source: `export function Button() {
  return <button style={{ color: "var(--button-fg)" }}>Save</button>;
}`,
  });

  const result = await withCwd(root, () => validateSpec(specDir));

  assert.equal(result.findings.length, 0);
});

test("allows selfReport.noInventedStyles to disable the style verifier", async () => {
  const { root, specDir } = await fixture({
    source: `export function Button() {
  return <button style={{ background: "#abc" }}>Save</button>;
}`,
    config: { selfReport: { noInventedStyles: "off" } },
  });

  const result = await withCwd(root, () => validateSpec(specDir));

  assert.equal(result.findings.filter((f) => f.rule === "no-invented-styles").length, 0);
});

async function fixture(options: {
  source: string;
  writeStory?: boolean;
  config?: unknown;
}): Promise<{ root: string; specDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "agentic-spec-self-report-"));
  const specDir = join(root, "specs", "button");
  await mkdir(specDir, { recursive: true });
  await mkdir(join(root, "src", "components"), { recursive: true });
  await writeFile(join(root, "src", "components", "Button.tsx"), options.source, "utf8");

  if (options.writeStory !== false) {
    await writeFile(
      join(root, "src", "components", "Button.stories.tsx"),
      "export const Default = {};",
      "utf8",
    );
  }
  if (options.config) {
    await writeFile(
      join(root, ".agenticspec.config.json"),
      JSON.stringify(options.config, null, 2),
      "utf8",
    );
  }

  await writeFile(join(specDir, "index.md"), indexMarkdown(), "utf8");
  await writeFile(join(specDir, "tokens.json"), tokensJson(), "utf8");

  return { root, specDir };
}

async function withCwd<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
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
  label: Text label

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
  react:
    path: src/components/Button.tsx
  storybook:
    path: src/components/Button.stories.tsx

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
          status: "existing",
        },
      ],
    },
    null,
    2,
  );
}
