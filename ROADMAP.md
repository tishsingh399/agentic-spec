# Roadmap

## Shipped (v0.1)

- **`agentic-spec validate`** — Full ruleset, human + JSON output, real exit codes
  - `missing-spec`, `missing-tokens`, `bad-frontmatter`
  - `identity-mismatch`
  - `missing-token-entry`, `orphan-token-entry`
  - `bad-token-tier`, `bad-token-path`, `missing-token-role`
  - `bad-status`, `bad-date`, `future-date`
  - `lying-check`, `ai-ready-gate`
  - `no-invented-styles`, `states-complete`
- **`agentic-spec parity`** — Reports per-spec token-contract resolution coverage,
  with JSON output and optional strict threshold gating for AI-Ready specs
- **`agentic-spec init <name>`** — Scaffolds a Draft spec + empty `tokens.json`
- **Type definitions** — `AgenticSpec`, `TokensContract`, `TokenEntry` exported from `src/types/`
- **figma-console-mcp adapter shape** — `FigmaComponentSnapshot`, `snapshotToSpec()`, `McpClient` interface
- **Example** — Real Button spec under `examples/button/` (passes `validate`)

## Next

### v0.2 — Real `from-figma`

The host agent (Claude Code, Cursor) provides an MCP client. We call:

```ts
import { fetchComponentSnapshot, snapshotToSpec } from "agentic-spec";

const snapshot = await fetchComponentSnapshot(mcpClient, {
  url: "https://figma.com/design/.../?node-id=14374-21489",
});
const { spec, tokens } = snapshotToSpec(snapshot, {
  ds_version: "tina-ds@HEAD",
  code_path: "packages/ui/src/components/Button.tsx",
  framework: "react",
  underlying_library: "mantine",
  tokens_source: "https://github.com/tishsingh399/design-system-ANT",
});
await emitSpec("./specs", spec, tokens);
```

Open questions:
- Should `agentic-spec` ship a thin MCP client (stdio transport) so it works without a host? Trade-off: one more dependency vs. zero-friction CLI use.
- How do we handle Figma variant collisions (`State=hover, Size=md` ↔ multiple bound colors)?
- Variable references that point at other variables (chain resolution).

### v0.3 — `drift` command

Compare spec ↔ implementation:

```bash
agentic-spec drift ./specs/button --code packages/ui/src/components/Button.tsx --stories apps/storybook/stories/Button.stories.tsx
```

Rules:
- Every `interaction_states` entry → must have a matching Storybook story name (case-insensitive substring match initially, exact later)
- Every color literal in the TSX/SCSS/CSS → must be a CSS var or resolvable to a token in `tokens.json`
- Every prop that maps to a variant in Figma → must appear in the spec's prose body §4

### v0.4 — Watch mode + editor integration

- `agentic-spec watch ./specs` — re-validates on file change
- LSP-style diagnostics so editors can surface errors inline
- VS Code extension that resolves `[[token.name]]` links and shows the resolved value on hover

### v0.5 — GitHub Action

```yaml
- uses: tishsingh399/agentic-spec-action@v0
  with:
    specs: ./specs
    fail-on: error
```

Posts a check-run summary with the validation report. Fails the PR if any spec has unresolved errors.

## Out of scope (for now)

- **Generating TSX from a spec** — too opinionated. Leave that to host agents (Claude Code, Cursor, v0).
- **Token transformation pipeline** — Style Dictionary already does this well.
- **Hosted dashboard** — keep it local-first / CI-friendly.

## How to contribute

This is alpha. Open an issue with:
- A use case the spec format doesn't handle cleanly
- A validation rule that would catch a class of bug
- A real-world Figma file `from-figma` should handle

Or a PR — see [package.json](./package.json) for scripts.
