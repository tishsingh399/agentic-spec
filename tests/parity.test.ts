import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";
import { computeParity } from "../src/parity/index.js";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("reports 100 parity when all contract tokens have concrete light values", async () => {
  const { specDir } = await fixture({
    contract: ["button.bg", "button.fg"],
    tokens: [
      token("button.bg", "#2563eb"),
      token("button.fg", "rgba(255, 255, 255, 1)"),
    ],
  });

  const result = await computeParity(specDir);

  assert.equal(result.parity, 100);
  assert.equal(result.resolved, 2);
  assert.deepEqual(result.unresolved, []);
});

test("counts empty light values as unresolved", async () => {
  const { specDir } = await fixture({
    contract: ["button.bg", "button.fg", "button.radius"],
    tokens: [
      token("button.bg", "#2563eb"),
      token("button.fg", ""),
      token("button.radius", "8px"),
    ],
  });

  const result = await computeParity(specDir);

  assert.equal(result.parity, 67);
  assert.equal(result.resolved, 2);
  assert.deepEqual(result.unresolved, ["button.fg"]);
});

test("counts missing tokens.json entries as unresolved", async () => {
  const { specDir } = await fixture({
    contract: ["button.bg", "button.fg"],
    tokens: [token("button.bg", "#2563eb")],
  });

  const result = await computeParity(specDir);

  assert.equal(result.parity, 50);
  assert.deepEqual(result.unresolved, ["button.fg"]);
});

test("treats an empty token contract as 100 parity", async () => {
  const { specDir } = await fixture({ contract: [], tokens: [] });

  const result = await computeParity(specDir);

  assert.equal(result.parity, 100);
  assert.equal(result.resolved, 0);
  assert.equal(result.total, 0);
});

test("strict mode fails only for AI-Ready specs below threshold", async () => {
  const aiReady = await fixture({
    rootPrefix: "agentic-spec-parity-ai-ready-",
    status: "AI-Ready",
    contract: ["button.bg", "button.fg"],
    tokens: [token("button.bg", "#2563eb")],
  });
  const draft = await fixture({
    rootPrefix: "agentic-spec-parity-draft-",
    status: "Draft",
    contract: ["button.bg", "button.fg"],
    tokens: [token("button.bg", "#2563eb")],
  });

  await assert.rejects(
    () => parityCli(aiReady.root, "specs", "--strict", "--threshold", "80"),
    { code: 1 },
  );
  const draftRun = await parityCli(draft.root, "specs", "--strict", "--threshold", "80");
  assert.match(draftRun.stdout, /50%\s+button/);
});

test("json output is parseable and contains no human report lines", async () => {
  const { root } = await fixture({
    contract: ["button.bg"],
    tokens: [token("button.bg", "#2563eb")],
  });

  const result = await parityCli(root, "specs", "--json");
  const parsed = JSON.parse(result.stdout) as {
    specs: Array<{ component: string; parity: number }>;
    summary: { avg: number };
  };

  assert.equal(parsed.specs[0]?.component, "button");
  assert.equal(parsed.specs[0]?.parity, 100);
  assert.equal(parsed.summary.avg, 100);
  assert.doesNotMatch(result.stdout, /PASS|avg \d+% across/);
});

async function parityCli(
  cwd: string,
  ...args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const resolvedArgs = args.map((arg) => (arg === "specs" ? join(cwd, arg) : arg));
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", join(repoRoot, "src", "cli", "index.ts"), "parity", ...resolvedArgs],
    { cwd: repoRoot },
  );
  return { stdout, stderr };
}

async function fixture(options: {
  rootPrefix?: string;
  status?: "AI-Ready" | "In progress" | "Draft";
  contract: string[];
  tokens: Array<Record<string, unknown>>;
}): Promise<{ root: string; specDir: string }> {
  const root = await mkdtemp(join(tmpdir(), options.rootPrefix ?? "agentic-spec-parity-"));
  const specDir = join(root, "specs", "button");
  await mkdir(specDir, { recursive: true });
  await writeFile(
    join(specDir, "index.md"),
    indexMarkdown(options.status ?? "Draft", options.contract),
    "utf8",
  );
  await writeFile(
    join(specDir, "tokens.json"),
    JSON.stringify(
      {
        component: "button",
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

function indexMarkdown(
  status: "AI-Ready" | "In progress" | "Draft",
  contract: string[],
): string {
  const contractBlock = contract.length
    ? `\n${contract.map((name) => `  - ${name}`).join("\n")}`
    : " []";
  return `---
component: button
ds_version: test@1.0.0
status: ${status}
last_verified: 2020-01-01

category: Component
required_aria: []

semantic_parts:
  root: Root element

token_contract:${contractBlock}

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
