# agentic-spec

> Generate machine-readable design system specs that AI agents can read, validate against, and extend. Bridges Figma → spec → code.

![npm version](https://img.shields.io/badge/version-0.1.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![status](https://img.shields.io/badge/status-alpha-orange)

## What this is

Design systems usually ship two artifacts: a component library and a Storybook. Both drift from documentation the moment the first PR lands. When an AI agent (Claude, Cursor, an MCP server) is asked to use the system, the agent has nothing concrete to anchor to and reliably:

- invents tokens that don't exist (`color.brand.primary`)
- skips required ARIA (focus ring, `aria-busy`)
- misses interaction states (focus, loading, error)
- picks the wrong variant for the context

`agentic-spec` ships a **third artifact** — a per-component `index.md + tokens.json` pair — with a closed contract the agent must respect:

- `token_contract` is a closed list. Anything else is a lint failure.
- `semantic_parts` names every region a token can target.
- `required_aria` and `interaction_states` are enumerated.
- `sources` points the agent at the exact code, story, and token files.

The spec format is the one used in [tishsingh399/design-system-ANT](https://github.com/tishsingh399/design-system-ANT).

## Install

```bash
npm install -g agentic-spec
# or use without installing:
npx agentic-spec --help
```

Requires Node 18+.

## Commands

### `agentic-spec init <name>`

Scaffold a new spec for a component.

```bash
agentic-spec init tooltip --out ./specs --ds-version "tina-ds@HEAD"
# ✓ Wrote ./specs/tooltip/index.md
# ✓ Wrote ./specs/tooltip/tokens.json
```

Fills in defaults for status (`Draft`), `last_verified` (today), code/storybook/token paths. You fill in `semantic_parts`, `token_contract`, and the prose body.

### `agentic-spec validate <dirs...>`

Validate one or more spec directories. Exits non-zero on any error.

```bash
agentic-spec validate ./specs/button ./specs/modal
# PASS button (./specs/button)
#   tokens: 13 in contract, 13 in tokens.json · states: 6 · parts: 5
# FAIL modal (./specs/modal)
#   tokens: 4 in contract, 4 in tokens.json · states: 4 · parts: 5
#   error  ai-ready-gate          status=AI-Ready requires checks.aria_correct=true (checks.aria_correct)
```

Checks:

| Rule | What it catches |
|---|---|
| `missing-spec` / `missing-tokens` | files don't exist |
| `bad-frontmatter` | YAML doesn't parse |
| `identity-mismatch` | spec's component name ≠ tokens.json's |
| `missing-token-entry` | token in `token_contract` has no `tokens.json` entry |
| `orphan-token-entry` | `tokens.json` entry not referenced by contract |
| `bad-token-tier` / `bad-token-path` | entry is malformed |
| `bad-status` / `bad-date` / `future-date` | metadata is wrong |
| `lying-check` | self-reported `checks.tokens_valid=true` when validator says otherwise |
| `ai-ready-gate` | `status: AI-Ready` requires all 5 checks to be true |

Add `--json` for machine-readable output (good for CI).

### `agentic-spec from-figma <url>` _(in progress)_

Generate a spec from a Figma component via [southleft/figma-console-mcp](https://github.com/southleft/figma-console-mcp). The CLI defines the adapter shape ([`src/extract/figma-mcp.ts`](./src/extract/figma-mcp.ts)) and the snapshot→spec mapping. The actual MCP transport is provided by the host agent (Claude Code, Cursor) — `agentic-spec` is deliberately decoupled from any specific MCP client.

See [ROADMAP.md](./ROADMAP.md) for the integration shape.

## Example

The [`examples/button/`](./examples/button/) directory contains a real spec (the Button from `design-system-ANT`) you can validate:

```bash
agentic-spec validate examples/button
# PASS button (examples/button)
#   tokens: 13 in contract, 13 in tokens.json · states: 6 · parts: 5
```

## The spec format in 30 seconds

```yaml
---
component: button
ds_version: tina-ds@HEAD (2026-06-08 verified)
status: AI-Ready
last_verified: 2026-06-08
category: Component
required_aria: [aria-label, aria-disabled, aria-busy]
semantic_parts:
  root: The native <button> — owns interactive state, focus ring
  label: Text content
  icon-leading: Optional leading icon
token_contract:
  - action.primary
  - action.primary-hover
  - focus.ring
  # ... closed list
interaction_states: [default, hover, focus, active, disabled, loading]
checks:
  aria_correct: true
  structure_correct: true
  states_complete: true
  tokens_valid: true
  no_invented_styles: true
sources:
  code: { path: packages/ui/src/components/Button.tsx, framework: react }
  storybook: { path: apps/storybook/stories/Button.stories.tsx }
  tokens: { semantic_light: packages/tokens/src/semantic-light.json }
---

# Human-readable docs go below.
```

## Why this matters

When the contract is explicit and closed, an agent can:

1. **Pre-validate** before writing code. "I want to use `color.indigo.500` for the button — is that in the contract? No → don't write it."
2. **Generate** code that respects the system on the first pass.
3. **Detect drift** mechanically: spec says `loading` is a state; story file has no `loading` story → flag it.
4. **Onboard fast**: every component is documented in the same place, same shape.

This is the missing link between MCP-style "I can read Figma" tooling and "I can write code that matches the system."

## Roadmap

See [ROADMAP.md](./ROADMAP.md). Short version:

- ✅ `validate` command, full ruleset, JSON output
- ✅ `init` command, scaffolding
- ✅ Type definitions for `AgenticSpec` / `TokensContract`
- ✅ figma-console-mcp adapter shape
- ⏳ End-to-end `from-figma` (needs host MCP wiring + tests)
- ⏳ `drift` command (compare spec ↔ TSX ↔ Storybook)
- ⏳ Watch mode for live validation
- ⏳ GitHub Action for PR validation

## License

MIT — see [LICENSE](./LICENSE).

---

By [Tina Singh](https://github.com/tishsingh399). Working on agentic tooling at the design ↔ code boundary.
