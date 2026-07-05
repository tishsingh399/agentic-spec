import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { expandSpecDirs } from "../discover.js";
import { computeParity, type ParityResult, summarizeParity } from "../parity/index.js";
import type { AgenticSpec, TokenEntry, TokensContract } from "../types/spec.js";
import { validateSpec, type ValidationResult } from "../validate/index.js";

export interface ComponentIndexEntry {
  component: string;
  dir: string;
  status: string;
}

export interface PaintedValueInput {
  token: string;
  value: string;
  mode?: "light" | "dark";
}

export interface PaintedValueFinding {
  severity: "error" | "warning";
  token: string;
  message: string;
}

export interface PaintedValuesResult {
  component: string;
  passed: boolean;
  checked: number;
  findings: PaintedValueFinding[];
  note: string;
}

export async function listComponentContracts(root: string): Promise<ComponentIndexEntry[]> {
  const dirs = await expandSpecDirs([root]);
  const entries: ComponentIndexEntry[] = [];

  for (const dir of dirs) {
    let component = basename(dir);
    let status = "unknown";
    try {
      const spec = await readSpec(dir);
      component = spec.component;
      status = spec.status;
    } catch {
      /* fall back to directory name */
    }
    entries.push({ component, dir, status });
  }

  return entries.sort((a, b) => a.component.localeCompare(b.component));
}

export async function contractIndex(root: string): Promise<Map<string, ComponentIndexEntry>> {
  const entries = await listComponentContracts(root);
  const map = new Map<string, ComponentIndexEntry>();
  for (const entry of entries) {
    map.set(entry.component, entry);
    map.set(entry.component.toLowerCase(), entry);
  }
  return map;
}

export async function readContractBundle(
  root: string,
  component: string,
): Promise<{ dir: string; specMarkdown: string; tokensJson: string } | undefined> {
  const entry = await resolveComponent(root, component);
  if (!entry) return undefined;

  let tokensJson = "(no tokens.json found)";
  try {
    tokensJson = await readFile(join(entry.dir, "tokens.json"), "utf8");
  } catch {
    /* ignore */
  }

  return {
    dir: entry.dir,
    specMarkdown: await readFile(join(entry.dir, "index.md"), "utf8"),
    tokensJson,
  };
}

export async function validateContract(
  root: string,
  component: string,
): Promise<ValidationResult | undefined> {
  const entry = await resolveComponent(root, component);
  if (!entry) return undefined;
  return validateSpec(entry.dir);
}

export async function resolveToken(
  root: string,
  component: string,
  tokenName: string,
): Promise<{ component: string; token: TokenEntry; inContract: boolean } | undefined> {
  const entry = await resolveComponent(root, component);
  if (!entry) return undefined;

  const spec = await readSpec(entry.dir);
  const tokens = await readTokens(entry.dir);
  const token = tokens.tokens.find((candidate) => candidate.name === tokenName);
  if (!token) return undefined;

  return {
    component: spec.component,
    token,
    inContract: spec.token_contract.includes(tokenName),
  };
}

export async function parityReport(
  root: string,
  options: { component?: string; threshold?: number } = {},
): Promise<{ specs: ParityResult[]; summary: ReturnType<typeof summarizeParity> }> {
  const threshold = options.threshold ?? 95;
  if (options.component) {
    const entry = await resolveComponent(root, options.component);
    if (!entry) return { specs: [], summary: summarizeParity([], threshold) };
    const result = await computeParity(entry.dir);
    return { specs: [result], summary: summarizeParity([result], threshold) };
  }

  const entries = await listComponentContracts(root);
  const specs = await Promise.all(entries.map((entry) => computeParity(entry.dir)));
  return { specs, summary: summarizeParity(specs, threshold) };
}

export async function validatePaintedValues(
  root: string,
  component: string,
  observed: PaintedValueInput[],
): Promise<PaintedValuesResult | undefined> {
  const entry = await resolveComponent(root, component);
  if (!entry) return undefined;

  const spec = await readSpec(entry.dir);
  const tokens = await readTokens(entry.dir);
  const tokenMap = new Map(tokens.tokens.map((token) => [token.name, token]));
  const contractSet = new Set(spec.token_contract);
  const findings: PaintedValueFinding[] = [];

  for (const item of observed) {
    if (!contractSet.has(item.token)) {
      findings.push({
        severity: "error",
        token: item.token,
        message: "observed token is not in the closed token contract",
      });
      continue;
    }

    const token = tokenMap.get(item.token);
    if (!token) {
      findings.push({
        severity: "error",
        token: item.token,
        message: "observed token is listed in the contract but missing from tokens.json",
      });
      continue;
    }

    const expected = item.mode === "dark" ? token.dark : token.light;
    if (!expected) {
      findings.push({
        severity: "warning",
        token: item.token,
        message: `tokens.json has no ${item.mode ?? "light"} value to compare against`,
      });
      continue;
    }

    if (!sameCssValue(item.value, expected)) {
      findings.push({
        severity: "error",
        token: item.token,
        message: `painted value "${item.value}" does not match contract value "${expected}"`,
      });
    }
  }

  return {
    component: spec.component,
    passed: !findings.some((finding) => finding.severity === "error"),
    checked: observed.length,
    findings,
    note:
      "This validates rendered values supplied by another tool; it does not capture browser pixels or Figma values by itself.",
  };
}

async function resolveComponent(
  root: string,
  component: string,
): Promise<ComponentIndexEntry | undefined> {
  const map = await contractIndex(root);
  return map.get(component) ?? map.get(component.toLowerCase());
}

async function readSpec(dir: string): Promise<AgenticSpec> {
  const raw = await readFile(join(dir, "index.md"), "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match || !match[1]) {
    throw new Error(`index.md has no YAML frontmatter block at ${resolve(dir)}`);
  }
  return parseYaml(match[1]) as AgenticSpec;
}

async function readTokens(dir: string): Promise<TokensContract> {
  return JSON.parse(await readFile(join(dir, "tokens.json"), "utf8")) as TokensContract;
}

function sameCssValue(actual: string, expected: string): boolean {
  return normalizeCssValue(actual) === normalizeCssValue(expected);
}

function normalizeCssValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
