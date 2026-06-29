import { access, readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  AgenticSpec,
  TokenEntry,
  TokensContract,
} from "../types/spec.js";

export type Severity = "error" | "warning" | "info";
type ConfigSeverity = Severity | "off";

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

interface AgenticSpecConfig {
  selfReport?: {
    noInventedStyles?: "off" | "warn" | "warning" | "error";
    statesComplete?: "off" | "warn" | "warning" | "error";
  };
  codeTokenUsage?: {
    severity?: "off" | "warn" | "warning" | "error" | "info";
    searchPaths?: string[];
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
  const config = await readConfig();

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
    } else {
      staleSpec(spec, findings);
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

  // ── code-token-usage: contract tokens must be referenced by the code ────
  await codeTokenUsage(spec, findings);

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

  // ── self-reported implementation checks ───────────────────────────────
  await validateNoInventedStyles(spec, findings, config);
  await validateStatesComplete(spec, findings, config);

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
    validateSelfReportGate(spec, findings);
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

const STALE_WARN_DAYS = 90;
const STALE_FAIL_DAYS = 180;
const DAY_MS = 86_400_000;

function staleSpec(spec: AgenticSpec, findings: Finding[]): void {
  if (spec.status !== "AI-Ready") return;
  const ageDays = Math.floor((Date.now() - Date.parse(spec.last_verified)) / DAY_MS);
  if (ageDays > STALE_FAIL_DAYS) {
    findings.push({
      severity: "error",
      rule: "stale-spec",
      at: "last_verified",
      message: `AI-Ready but last_verified=${spec.last_verified} is ${ageDays}d old (> ${STALE_FAIL_DAYS}) — re-verify or demote status`,
    });
  } else if (ageDays > STALE_WARN_DAYS) {
    findings.push({
      severity: "warning",
      rule: "stale-spec",
      at: "last_verified",
      message: `AI-Ready but last_verified=${spec.last_verified} is ${ageDays}d old (> ${STALE_WARN_DAYS}) — re-verify soon (demote suggested)`,
    });
  }
}

async function validateNoInventedStyles(
  spec: AgenticSpec,
  findings: Finding[],
  config: AgenticSpecConfig,
): Promise<void> {
  if (!spec.checks.no_invented_styles) return;
  const severity = normalizeSeverity(config.selfReport?.noInventedStyles);
  if (severity === "off") return;

  const sourcePath = implementationSourcePath(spec);
  if (!sourcePath) return;

  const source = await readSourceText(sourcePath);
  if (!source) return;

  const noComments = stripComments(source);
  const styleBlocks = [
    ...[...noComments.matchAll(/style=\{\{([\s\S]*?)\}\}/g)].map((m) => m[1]),
    ...[...noComments.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]),
  ].join("\n");
  const offenders = [
    ...[...styleBlocks.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]),
    ...[...styleBlocks.matchAll(/(?<![\w-])\d+(?:\.\d+)?m?s\b/g)].map((m) => m[0]),
  ];

  if (offenders.length) {
    findings.push({
      severity,
      rule: "no-invented-styles",
      at: `sources.${sourcePath.startsWith("packages/") ? "code" : "react"}.path`,
      message: `style context has raw value(s): ${[...new Set(offenders)].slice(0, 5).join(", ")}`,
    });
  }
}

async function validateStatesComplete(
  spec: AgenticSpec,
  findings: Finding[],
  config: AgenticSpecConfig,
): Promise<void> {
  if (!spec.checks.states_complete) return;
  const severity = normalizeSeverity(config.selfReport?.statesComplete);
  if (severity === "off") return;
  if (spec.interaction_states.length === 0) return;

  const sourcePath = implementationSourcePath(spec);
  if (sourcePath && !(await fileExists(sourcePath))) return;

  const storybookPath = spec.sources?.storybook?.path;
  if (!storybookPath || !(await fileExists(storybookPath))) {
    findings.push({
      severity,
      rule: "states-complete",
      at: "sources.storybook.path",
      message: storybookPath
        ? `interaction_states are declared but no Storybook file exists at ${storybookPath}`
        : "interaction_states are declared but sources.storybook.path is missing",
    });
  }
}

function validateSelfReportGate(spec: AgenticSpec, findings: Finding[]): void {
  const selfReportRules: Array<[keyof typeof spec.checks, string]> = [
    ["no_invented_styles", "no-invented-styles"],
    ["states_complete", "states-complete"],
  ];
  for (const [key, rule] of selfReportRules) {
    const verifierFinding = findings.find((f) => f.rule === rule);
    if (spec.checks[key] && verifierFinding) {
      findings.push({
        severity: verifierFinding.severity,
        rule: "ai-ready-gate",
        at: `checks.${key}`,
        message: `checks.${key}=true but the ${rule} verifier disagrees`,
      });
    }
  }
}

function implementationSourcePath(spec: AgenticSpec): string | undefined {
  const sources = spec.sources as AgenticSpec["sources"] & {
    react?: { path?: string };
  };
  return sources.code?.path ?? sources.react?.path;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".scss"]);

async function readSourceText(path: string): Promise<string> {
  try {
    const absolutePath = resolve(process.cwd(), path);
    const st = await stat(absolutePath);
    if (st.isDirectory()) {
      const entries = await readdir(absolutePath, { withFileTypes: true });
      const parts = await Promise.all(
        entries
          .filter((e) => e.name !== "node_modules" && !e.name.startsWith("."))
          .map((e) =>
            e.isDirectory() || SOURCE_EXT.has(extname(e.name))
              ? readSourceText(join(absolutePath, e.name))
              : Promise.resolve(""),
          ),
      );
      return parts.join("\n");
    }
    return SOURCE_EXT.has(extname(absolutePath)) ? await readFile(absolutePath, "utf8") : "";
  } catch {
    return "";
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(resolve(process.cwd(), path));
    return true;
  } catch {
    return false;
  }
}

async function readConfig(): Promise<AgenticSpecConfig> {
  try {
    return JSON.parse(
      await readFile(join(process.cwd(), ".agenticspec.config.json"), "utf8"),
    ) as AgenticSpecConfig;
  } catch {
    return {};
  }
}

function normalizeSeverity(value?: unknown): ConfigSeverity {
  if (value === "off") return "off";
  if (value === "error") return "error";
  if (value === "info") return "info";
  return "warning";
}

async function codeTokenUsage(spec: AgenticSpec, findings: Finding[]): Promise<void> {
  const config = await readConfig();
  const severity = normalizeSeverity(config.codeTokenUsage?.severity);
  if (severity === "off") return;

  const sourcePath = implementationSourcePath(spec);
  const extraPaths = config.codeTokenUsage?.searchPaths ?? [];
  const parts = await Promise.all([
    sourcePath ? readSourceText(sourcePath) : Promise.resolve(""),
    ...extraPaths.map((path) => readSourceText(path)),
  ]);
  const corpus = parts.join("\n");
  if (!corpus.trim()) return; // no source found to check against — don't false-flag

  for (const token of spec.token_contract) {
    const dashed = token.replace(/\./g, "-");
    if (!corpus.includes(token) && !corpus.includes(dashed)) {
      findings.push({
        severity,
        rule: "code-token-usage",
        at: `token_contract → ${token}`,
        message: `declares "${token}" but no searched source references it (by name or as --…-${dashed})`,
      });
    }
  }
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

  validateCascadeDirection(t, findings);
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

/**
 * Enforce the one-way cascade: component → semantic → primitive.
 *
 * Checked purely from each entry's own `tier` + `references` (no external token
 * files needed), so it works for any consumer's tokens.json:
 *
 *  - component: a COLOUR must not bind straight to a primitive (`{color.*}`) —
 *    colour has to flow through the semantic tier so light/dark theming stays
 *    one-directional. Non-colour scales (radius, spacing, motion) are commonly
 *    referenced directly and are fine.
 *  - primitive: is a cascade root — it must not reference anything above it.
 *
 * (The semantic→primitive row is not enforced here because confirming a
 * reference resolves to a *primitive* requires the source token files, which the
 * per-spec validator doesn't read; tracked for a future cross-file pass.)
 */
function validateCascadeDirection(t: TokenEntry, findings: Finding[]): void {
  const ref = t.references?.trim();

  if (t.tier === "component" && ref && /^\{colou?r\./i.test(ref)) {
    findings.push({
      severity: "error",
      rule: "bad-cascade-direction",
      at: `tokens.json → ${t.name}`,
      message: `component token references a colour primitive (${ref}) directly — must bind to a semantic token so theming stays one-directional`,
    });
  }

  if (t.tier === "primitive" && ref) {
    findings.push({
      severity: "error",
      rule: "bad-cascade-direction",
      at: `tokens.json → ${t.name}`,
      message: `primitive token has references=${ref} — primitives are cascade roots and must not reference another tier`,
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
