// Core types for the agentic spec format.
//
// A spec is two files in a per-component folder:
//   <spec-dir>/<component>/index.md      — frontmatter + human prose
//   <spec-dir>/<component>/tokens.json   — closed token contract
//
// Designed to be 1:1 readable by AI agents (Claude, Cursor, MCP servers)
// and by humans. The frontmatter is the machine contract; the prose is
// the human-readable explainer below it.

export type SpecStatus = "AI-Ready" | "In progress" | "Draft";

export type SpecCategory = "Component" | "Pattern" | "Page";

export interface SpecChecks {
  aria_correct: boolean;
  structure_correct: boolean;
  states_complete: boolean;
  tokens_valid: boolean;
  no_invented_styles: boolean;
}

export interface SpecSources {
  // Code location of the implementation
  code?: {
    path: string;
    framework?: "react" | "vue" | "angular" | "web-components" | string;
    underlying_library?: string;
    exports?: string[];
  };
  // Storybook / live demo
  storybook?: { path: string };
  // Token sources
  tokens?: {
    primitives?: string;
    semantic_light?: string;
    semantic_dark?: string;
    component?: string;
  };
  // Figma traceability
  figma?: {
    file?: string;
    component_set?: string;
    node_id?: string;
    url?: string;
    variant_count?: number;
  };
}

export interface AgenticSpec {
  component: string;
  ds_version: string;
  status: SpecStatus;
  last_verified: string; // ISO date YYYY-MM-DD
  category: SpecCategory;
  required_aria: string[];
  /**
   * Named internal regions. Every token in the contract must target one of
   * these parts (enforced by the validator).
   */
  semantic_parts: Record<string, string>;
  /**
   * Closed list of tokens this component is permitted to use. Anything not
   * in this list is a lint failure.
   */
  token_contract: string[];
  interaction_states: string[];
  checks: SpecChecks;
  sources: SpecSources;
  patterns_used_in: string[];
  pages_used_in: string[];
}

// ──────────────────────────────────────────────────────────────────────────
// Token contract — the JSON sidecar
// ──────────────────────────────────────────────────────────────────────────

export type TokenTier = "primitive" | "semantic" | "component";
export type TokenStatus = "existing" | "proposed" | "deprecated";

export interface TokenEntry {
  /** Friendly name used in the spec frontmatter (e.g. `action.primary`) */
  name: string;
  tier: TokenTier;
  /** What this token is FOR (e.g. `default-fill-primary`, `focus-ring`) */
  role: string;
  /** Dotted path in the source token JSON */
  path: string;
  /** Immediate token this one binds to, e.g. `{action.primary}` (semantic). */
  references?: string;
  /** Ultimately-resolved primitive, e.g. `{color.blue.6}`. */
  primitive?: string;
  light?: string;
  dark?: string;
  status: TokenStatus;
}

export interface TokensContract {
  $schema?: string;
  component: string;
  source: string;
  version: string;
  verified?: string;
  fork_model?: string;
  notes?: string[];
  tokens: TokenEntry[];
}
