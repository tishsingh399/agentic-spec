import { basename } from "node:path";
import { validateSpec, type Finding } from "../validate/index.js";
import { computeParity } from "../parity/index.js";

export interface Diagnostic {
  component: string;
  severity: "high" | "medium" | "low";
  confidence: number;
  signal: string;
  issue: string;
  recommended_action: string;
  proposed_rule?: string;
}

export interface DiagnoseOptions {
  threshold: number;
}

export interface DiagnoseResult {
  diagnostics: Diagnostic[];
  summary: {
    components: number;
    diagnostics: number;
    high_confidence: number;
    proposed_rules: string[];
  };
}

export async function diagnoseSpecs(
  dirs: string[],
  options: DiagnoseOptions,
): Promise<DiagnoseResult> {
  const diagnostics: Diagnostic[] = [];
  const ruleCounts = new Map<string, number>();

  for (const dir of dirs) {
    const validation = await validateSpec(dir);
    const parity = await computeParity(dir);
    const component = validation.component || parity.component || basename(dir);

    for (const finding of validation.findings) {
      ruleCounts.set(finding.rule, (ruleCounts.get(finding.rule) ?? 0) + 1);
      diagnostics.push(diagnoseFinding(component, finding));
    }

    if (parity.parity < options.threshold) {
      diagnostics.push({
        component,
        severity: parity.status === "AI-Ready" ? "high" : "medium",
        confidence: 0.95,
        signal: "parity",
        issue: `token contract parity is ${parity.parity}% (${parity.resolved}/${parity.total})`,
        recommended_action:
          "Resolve missing token values in tokens.json before trusting this contract downstream.",
        proposed_rule: "parity-threshold-worklist",
      });
    }
  }

  for (const [rule, count] of ruleCounts) {
    if (count >= 3) diagnostics.push(recurringRuleDiagnostic(rule, count));
  }

  diagnostics.sort((a, b) => b.confidence - a.confidence || severityRank(a.severity) - severityRank(b.severity));
  return {
    diagnostics,
    summary: {
      components: dirs.length,
      diagnostics: diagnostics.length,
      high_confidence: diagnostics.filter((d) => d.confidence >= 0.85).length,
      proposed_rules: [...new Set(diagnostics.map((d) => d.proposed_rule).filter(Boolean))] as string[],
    },
  };
}

function diagnoseFinding(component: string, finding: Finding): Diagnostic {
  switch (finding.rule) {
    case "no-invented-styles":
      return {
        component,
        severity: "medium",
        confidence: 0.88,
        signal: finding.rule,
        issue: finding.message,
        recommended_action:
          "Replace raw style values with existing component tokens, or add a component token through the normal token cascade.",
        proposed_rule: "style-token-worklist",
      };
    case "states-complete":
      return {
        component,
        severity: "medium",
        confidence: 0.9,
        signal: finding.rule,
        issue: finding.message,
        recommended_action:
          "Add or restore the referenced Storybook story before treating interaction states as covered.",
        proposed_rule: "storybook-state-worklist",
      };
    case "missing-token-entry":
      return {
        component,
        severity: "high",
        confidence: 0.96,
        signal: finding.rule,
        issue: finding.message,
        recommended_action:
          "Add the missing tokens.json entry or remove the token from token_contract if the contract is wrong.",
        proposed_rule: "token-contract-sync",
      };
    case "bad-token-tier":
      return {
        component,
        severity: "high",
        confidence: 0.93,
        signal: finding.rule,
        issue: finding.message,
        recommended_action:
          "Repair the token cascade so component tokens bind through semantic intent rather than bypassing tiers.",
        proposed_rule: "cascade-repair-worklist",
      };
    case "ai-ready-gate":
      return {
        component,
        severity: "high",
        confidence: 0.86,
        signal: finding.rule,
        issue: finding.message,
        recommended_action:
          "Either complete the missing gate work or demote the spec until the self-reported checks are true.",
      };
    default:
      return {
        component,
        severity: finding.severity === "error" ? "high" : "low",
        confidence: finding.severity === "error" ? 0.82 : 0.65,
        signal: finding.rule,
        issue: finding.message,
        recommended_action: "Review this validator finding and decide whether it is real drift or rule noise.",
      };
  }
}

function recurringRuleDiagnostic(rule: string, count: number): Diagnostic {
  return {
    component: "*",
    severity: "high",
    confidence: 0.91,
    signal: "recurring-rule",
    issue: `${rule} appears across ${count} specs`,
    recommended_action:
      "Treat this as a system-level learning candidate: update a template, add documentation, or refine the validator.",
    proposed_rule: `${rule}-system-learning`,
  };
}

function severityRank(severity: Diagnostic["severity"]): number {
  return severity === "high" ? 0 : severity === "medium" ? 1 : 2;
}
