#!/usr/bin/env node
import { Command } from "commander";
import kleur from "kleur";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateSpec } from "../validate/index.js";
import { expandSpecDirs } from "../discover.js";
import { emitSpec } from "../emit/spec.js";
import { computeParity, summarizeParity } from "../parity/index.js";
import type { AgenticSpec, TokensContract } from "../types/spec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function readPkgVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(
      await readFile(join(__dirname, "..", "..", "package.json"), "utf8"),
    );
    return pkg.version as string;
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("agentic-spec")
  .description(
    "Generate and validate agentic design system specs. " +
      "Bridges Figma → spec → code with a machine-readable contract.",
  )
  .version(await readPkgVersion());

// ── validate ──────────────────────────────────────────────────────────────

program
  .command("validate")
  .description(
    "Validate one or more spec directories. Exits non-zero on any error.",
  )
  .argument(
    "<dirs...>",
    "spec directories (each with index.md + tokens.json), or a parent like specs/ — nested specs are discovered recursively",
  )
  .option("--json", "emit machine-readable JSON")
  .action(async (dirs: string[], opts: { json?: boolean }) => {
    let hadError = false;
    const all = [];
    const specDirs = await expandSpecDirs(dirs);
    if (specDirs.length === 0) {
      process.stderr.write(
        `No spec directories (containing index.md) found under: ${dirs.join(", ")}\n`,
      );
      process.exit(1);
    }
    for (const abs of specDirs) {
      const dir = relative(process.cwd(), abs) || abs;
      const result = await validateSpec(abs);
      all.push({ dir, ...result });
      if (!result.passed) hadError = true;

      if (opts.json) continue;
      printHumanReport(dir, result);
    }
    if (opts.json) {
      process.stdout.write(JSON.stringify(all, null, 2) + "\n");
    }
    process.exit(hadError ? 1 : 0);
  });

// ── parity ────────────────────────────────────────────────────────────────

program
  .command("parity")
  .description(
    "Report how much of each spec's token contract resolves to concrete token values.",
  )
  .argument(
    "<dirs...>",
    "spec directories (each with index.md + tokens.json), or a parent like specs/ — nested specs are discovered recursively",
  )
  .option("--strict", "exit non-zero when any AI-Ready spec is below threshold")
  .option("--threshold <n>", "minimum acceptable parity percentage", "80")
  .option("--json", "emit machine-readable JSON")
  .action(
    async (
      dirs: string[],
      opts: { strict?: boolean; threshold: string; json?: boolean },
    ) => {
      const threshold = Number(opts.threshold);
      if (!Number.isFinite(threshold)) {
        process.stderr.write(`Invalid --threshold value: ${opts.threshold}\n`);
        process.exit(1);
      }

      const specDirs = await expandSpecDirs(dirs);
      if (specDirs.length === 0) {
        process.stderr.write(
          `No spec directories (containing index.md) found under: ${dirs.join(", ")}\n`,
        );
        process.exit(1);
      }

      const specs = await Promise.all(specDirs.map((dir) => computeParity(dir)));
      const summary = summarizeParity(specs, threshold);
      const sortedSpecs = [...specs].sort((a, b) => a.parity - b.parity);
      const strictFailures = sortedSpecs.filter(
        (spec) => spec.status === "AI-Ready" && spec.parity < threshold,
      );

      if (opts.json) {
        process.stdout.write(
          JSON.stringify(
            {
              specs: sortedSpecs.map(({ component, parity, resolved, total, unresolved }) => ({
                component,
                parity,
                resolved,
                total,
                unresolved,
              })),
              summary,
            },
            null,
            2,
          ) + "\n",
        );
      } else {
        for (const spec of sortedSpecs) {
          console.log(
            `${String(spec.parity).padStart(3)}%  ${spec.component}  (${spec.resolved}/${spec.total})`,
          );
        }
        console.log(
          `avg ${summary.avg}% across ${sortedSpecs.length} specs, ` +
            `${summary.below_threshold} below ${threshold}%`,
        );
      }

      process.exit(opts.strict && strictFailures.length > 0 ? 1 : 0);
    },
  );

// ── init (new component) ───────────────────────────────────────────────────

program
  .command("init")
  .description("Scaffold a new spec for a component.")
  .argument("<name>", "kebab-case component name, e.g. tooltip")
  .option("-o, --out <dir>", "output directory (default: ./specs)", "./specs")
  .option(
    "--ds-version <ver>",
    "design system version string for frontmatter",
    "tina-ds@HEAD",
  )
  .action(
    async (
      name: string,
      opts: { out: string; dsVersion: string },
    ) => {
      const today = new Date().toISOString().slice(0, 10);
      const spec: AgenticSpec = {
        component: name,
        ds_version: `${opts.dsVersion} (${today} verified)`,
        status: "Draft",
        last_verified: today,
        category: "Component",
        required_aria: [],
        semantic_parts: {
          root: "Outer element — owns focus ring and base styles",
          label: "Text content",
        },
        token_contract: [],
        interaction_states: ["default"],
        checks: {
          aria_correct: false,
          structure_correct: false,
          states_complete: false,
          tokens_valid: false,
          no_invented_styles: false,
        },
        sources: {
          code: { path: `packages/ui/src/components/${pascal(name)}.tsx` },
          storybook: {
            path: `apps/storybook/stories/${pascal(name)}.stories.tsx`,
          },
          tokens: {
            primitives: "packages/tokens/src/primitives.json",
            semantic_light: "packages/tokens/src/semantic-light.json",
            semantic_dark: "packages/tokens/src/semantic-dark.json",
          },
        },
        patterns_used_in: [],
        pages_used_in: [],
      };
      const tokens: TokensContract = {
        $schema: "../../_templates/component/tokens.schema.json",
        component: name,
        source: "https://github.com/<you>/<your-ds>",
        version: opts.dsVersion,
        verified: today,
        fork_model:
          "Semantic tokens reference primitives directly. Components reference semantic tokens.",
        notes: ["Generated by `agentic-spec init`. Fill in tokens before promoting status."],
        tokens: [],
      };
      const { specPath, tokensPath } = await emitSpec(
        resolve(opts.out),
        spec,
        tokens,
      );
      console.log(kleur.green("✓") + ` Wrote ${kleur.dim(specPath)}`);
      console.log(kleur.green("✓") + ` Wrote ${kleur.dim(tokensPath)}`);
      console.log(
        "\nNext: fill " +
          kleur.bold("semantic_parts") +
          " and " +
          kleur.bold("token_contract") +
          ", then run " +
          kleur.cyan(`agentic-spec validate ${join(opts.out, name)}`),
      );
    },
  );

// ── from-figma (stub) ──────────────────────────────────────────────────────

program
  .command("from-figma")
  .description(
    "Generate a spec from a Figma node via figma-console-mcp. (Requires the MCP server to be running in the host agent.)",
  )
  .argument("<url>", "figma.com URL of the component node")
  .option("-o, --out <dir>", "output directory (default: ./specs)", "./specs")
  .action(async (_url: string, _opts: { out: string }) => {
    console.error(
      kleur.yellow("⚠"),
      "from-figma requires the host agent (Claude Code, Cursor) to provide an MCP client.",
    );
    console.error(
      "  This command is the user-facing surface; the host wires up",
      kleur.cyan("southleft/figma-console-mcp"),
      "and calls",
      kleur.cyan("fetchComponentSnapshot()") + ".",
    );
    console.error("\nSee", kleur.cyan("ROADMAP.md"), "for the integration shape.");
    process.exit(2);
  });

// ──────────────────────────────────────────────────────────────────────────

function printHumanReport(
  dir: string,
  result: Awaited<ReturnType<typeof validateSpec>>,
): void {
  const head = result.passed ? kleur.green("PASS") : kleur.red("FAIL");
  console.log(
    `\n${head} ${kleur.bold(result.component)} ${kleur.dim("(" + dir + ")")}`,
  );
  console.log(
    kleur.dim(
      `  tokens: ${result.stats.tokens_in_contract} in contract, ` +
        `${result.stats.tokens_in_json} in tokens.json · ` +
        `states: ${result.stats.interaction_states} · ` +
        `parts: ${result.stats.semantic_parts}`,
    ),
  );

  for (const f of result.findings) {
    const tag =
      f.severity === "error"
        ? kleur.red("error")
        : f.severity === "warning"
          ? kleur.yellow("warn ")
          : kleur.cyan("info ");
    const at = f.at ? kleur.dim(` (${f.at})`) : "";
    console.log(`  ${tag} ${kleur.dim(f.rule.padEnd(22))} ${f.message}${at}`);
  }
}

function pascal(s: string): string {
  return s
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

program.parseAsync(process.argv);
