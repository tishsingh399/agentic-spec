import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import type { AgenticSpec, TokensContract } from "../types/spec.js";

export interface ParityResult {
  component: string;
  status: AgenticSpec["status"];
  parity: number;
  resolved: number;
  total: number;
  unresolved: string[];
}

export interface ParitySummary {
  avg: number;
  min: number;
  below_threshold: number;
  threshold: number;
}

export function summarizeParity(
  specs: ParityResult[],
  threshold: number,
): ParitySummary {
  const parities = specs.map((spec) => spec.parity);
  return {
    avg: parities.length
      ? Math.round(parities.reduce((sum, parity) => sum + parity, 0) / parities.length)
      : 100,
    min: parities.length ? Math.min(...parities) : 100,
    below_threshold: specs.filter((spec) => spec.parity < threshold).length,
    threshold,
  };
}

export async function computeParity(dir: string): Promise<ParityResult> {
  const spec = await readSpec(dir);
  const tokens = await readTokens(dir);
  const tokenMap = new Map(tokens.tokens.map((token) => [token.name, token]));

  const unresolved = spec.token_contract.filter((name) => {
    const token = tokenMap.get(name);
    return !token || !isConcreteValue(token.light);
  });
  const total = spec.token_contract.length;
  const resolved = total - unresolved.length;
  const parity = total === 0 ? 100 : Math.round((resolved / total) * 100);

  return {
    component: spec.component,
    status: spec.status,
    parity,
    resolved,
    total,
    unresolved,
  };
}

async function readSpec(dir: string): Promise<AgenticSpec> {
  const raw = await readFile(join(dir, "index.md"), "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match || !match[1]) {
    throw new Error(`index.md has no YAML frontmatter block at ${dir}`);
  }
  return yamlParse(match[1]) as AgenticSpec;
}

async function readTokens(dir: string): Promise<TokensContract> {
  return JSON.parse(await readFile(join(dir, "tokens.json"), "utf8")) as TokensContract;
}

function isConcreteValue(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "" && !/^\{[^}]+\}$/.test(value.trim());
}
