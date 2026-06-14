import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  AgenticSpec,
  TokenEntry,
  TokensContract,
} from "../types/spec.js";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  rule: string;
  message: string;
  /** Optional pointer into the spec frontmatter or tokens entry */
  at?: string;
}

export interface ValidationResult {
  component: string;
  passed: boolean;
  findings: Finding[];
  stats: {
    tokens_in_contract: number;
    tokens_in_json: number;
    interaction_states: number;
    semantic_parts: number;
  };
}

/**
 * Validate a single spec directory: <dir>/index.md + <dir>/tokens.json.
 *
 * Checks:
 *  - index.md exists and has parseable YAML frontmatter
 *  - tokens.json exists and is well-formed
 *  - every token in spec.token_contract has a matching tokens.json entry
 *  - every tokens.json entry is referenced by the contract (orphan detection)
 *  - spec.component === tokens.component
 *  - spec.checks.tokens_valid implies the above pass
 *  - last_verified is a valid ISO date and not in the future
 *  - status is one of the allowed values
 */
export async function validateSpec(dir: string): Promise<ValidationResult> {
  const findings: Finding[] = [];

  const { spec, raw: _rawSpec } = await readSpec(dir, findings);
  const tokens = await readTokens(dir, findings);

  if (!spec || !tokens) {
    return {
      component: spec?.component ?? "<unknown>",
      passed: false,
      findings,
      stats: {
        tokens_in_contract: spec?.token_contract.length ?? 0,
        tokens_in_json: tokens?.tokens.length ?? 0,
        interaction_states: spec?.interaction_states.length ?? 0,
        semantic_parts: spec ? Object.keys(spec.semantic_parts).length : 0,
      },
    };
  }

  // ── identity ────────────────────────────────────────────────────────────
  if (spec.component !== tokens.component) {
    findings.push({
      severity: "error",
      rule: "identity-mismatch",
      message: `index.md component=\"${spec.component}\" but tokens.json component=\"${tokens.component}\"`,
    });
  }

  // ── status / date sanity ───────────────────────────────────────────────
  const allowedStatuses = ["AI-Ready", "In progress", "Draft"];
  if (!allowedStatuses.includes(spec.status)) {
    findings.push({
      severity: "error",
      rule: "bad-status",
      message: `status=\"${spec.status}\" is not one of ${allowedStatuses.join(", ")}`,
    });
  }

  const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(spec.last_verified);
  if (!dateMatch) {
    findings.push({
      severity: "error",
      rule: "bad-date",
      message: `last_verified=\"${spec.last_verified}\" is not an ISO date (YYYY-MM-DD)`,
    });
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (spec.last_verified > today) {
      findings.push({
        severity: "warning",
        rule: "future-date",
        message: `last_verified=\"${spec.last_verified}\" is in the future`,
      });
    }
  }

  // ── contract ↔ tokens.json bijection ───────────────────────────────────
  const contractSet = new Set(spec.token_contract);
  const tokenNameSet = new Set(tokens.tokens.map((t) => t.name));

  for (const name of contractSet) {
    if (!tokenNameSet.has(name)) {
      findings.push({
        severity: "error",
        rule: "missing-token-entry",
        at: `token_contract → ${name}`,
        message: `Spec lists \"${name}\" in token_contract but tokens.json has no entry`,
      });
    }
  }

  for (const t of tokens.tokens) {
    if (!contractSet.has(t.name)) {
      findings.push({
        severity: "warning",
        rule: "orphan-token-entry",
        at: `tokens.json → ${t.name}`,
        message: `tokens.json entry \"${t.name}\" is not referenced by token_contract`,
      });
    }
    validateTokenEntry(t, findings);
  }

  // ── self-reported checks must not lie ──────────────────────────────────
  const tokensActuallyValid = !findings.some(
    (f) =>
      f.severity === "error" &&
      (f.rule === "missing-token-entry" || f.rule === "identity-mismatch"),
  );
  if (spec.checks.tokens_valid && !tokensActuallyValid) {
    findings.push({
      severity: "error",
      rule: "lying-check",
      message:
        "checks.tokens_valid=true but token contract has unresolved errors",
    });
  }

  // ── AI-Ready gate ──────────────────────────────────────────────────────
  if (spec.status === "AI-Ready") {
    const allCheckKeys: Array<keyof typeof spec.checks> = [
      "aria_correct",
      "structure_correct",
      "states_complete",
      "tokens_valid",
      "no_invented_styles",
    ];
    for (const k of allCheckKeys) {
      if (!spec.checks[k]) {
        findings.push({
          severity: "error",
          rule: "ai-ready-gate",
          at: `checks.${k}`,
          message: `status=AI-Ready requires checks.${k}=true`,
        });
      }
    }
  }

  return {
    component: spec.component,
    passed: !findings.some((f) => f.severity === "error"),
    findings,
    stats: {
      tokens_in_contract: spec.token_contract.length,
      tokens_in_json: tokens.tokens.length,
      interaction_states: spec.interaction_states.length,
      semantic_parts: Object.keys(spec.semantic_parts).length,
    },
  };
}

function validateTokenEntry(t: TokenEntry, findings: Finding[]): void {
  const allowedTiers = ["primitive", "semantic", "component"];
  if (!allowedTiers.includes(t.tier)) {
    findings.push({
      severity: "error",
      rule: "bad-token-tier",
      at: `tokens.json → ${t.name}`,
      message: `tier=\"${t.tier}\" is not one of ${allowedTiers.join(", ")}`,
    });
  }

  // Cascade: a component token must not bind a COLOR straight to a primitive —
  // colour is the thing that has to flow through the semantic tier so theming
  // (light/dark) stays one-directional. We flag references in a primitive colour
  // namespace (`{color.*}` / `{colour.*}`, the DTCG convention). Non-colour
  // scales (radius, spacing) are commonly referenced directly and are fine.
  if (t.tier === "component" && t.references && /^\{colou?r\./i.test(t.references.trim())) {
    findings.push({
      severity: "error",
      rule: "bad-token-tier",
      at: `tokens.json → ${t.name}`,
      message: `component token references a colour primitive (${t.references.trim()}) directly — must bind to a semantic token so theming stays one-directional`,
    });
  }
  if (!t.role || t.role.trim() === "") {
    findings.push({
      severity: "warning",
      rule: "missing-token-role",
      at: `tokens.json → ${t.name}`,
      message: "token has no role — agents need this to pick the right value",
    });
  }
  if (!t.path || t.path.trim() === "") {
    findings.push({
      severity: "error",
      rule: "missing-token-path",
      at: `tokens.json → ${t.name}`,
      message: "token has no path — can't resolve to a source JSON",
    });
  }
}

async function readSpec(
  dir: string,
  findings: Finding[],
): Promise<{ spec: AgenticSpec | null; raw: string }> {
  const path = join(dir, "index.md");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    findings.push({
      severity: "error",
      rule: "missing-spec",
      message: `index.md not found at ${path}`,
    });
    return { spec: null, raw: "" };
  }

  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match || !match[1]) {
    findings.push({
      severity: "error",
      rule: "no-frontmatter",
      message: "index.md has no YAML frontmatter block",
    });
    return { spec: null, raw };
  }

  try {
    const spec = yamlParse(match[1]) as AgenticSpec;
    return { spec, raw };
  } catch (err) {
    findings.push({
      severity: "error",
      rule: "bad-frontmatter",
      message: `frontmatter YAML failed to parse: ${(err as Error).message}`,
    });
    return { spec: null, raw };
  }
}

async function readTokens(
  dir: string,
  findings: Finding[],
): Promise<TokensContract | null> {
  const path = join(dir, "tokens.json");
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as TokensContract;
  } catch (err) {
    findings.push({
      severity: "error",
      rule: "missing-tokens",
      message: `tokens.json not readable at ${path}: ${(err as Error).message}`,
    });
    return null;
  }
}
