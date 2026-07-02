# agentic-spec

> Give any design system a machine-readable, **enforceable** contract that AI agents read before they write code.

[![npm](https://img.shields.io/npm/v/agentic-spec?color=2563eb)](https://www.npmjs.com/package/agentic-spec)
![license](https://img.shields.io/badge/license-MIT-green)
![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)

## The problem

When an AI agent (Claude Code, Cursor, Copilot, v0) builds UI against your design system, it has nothing machine-checkable to hold onto. Your docs and Storybook are written for humans. So the agent:

- invents tokens that don't exist (`color.brand.primary`)
- skips required ARIA (focus ring, `aria-busy`)
- misses interaction states (focus, loading, error)
- binds a component straight to a raw value, skipping your semantic layer
- and nothing catches any of it until review, or production

Design systems have a human interface (docs, Storybook) and no enforceable interface for the non-human consumers that now do a lot of the building.

## What agentic-spec is

A format plus a tool that gives each component a **closed, checkable contract** — and enforces it in two places:

- **In CI**, via a CLI that fails the build when code drifts from the contract.
- **In the editor**, via an MCP server that hands the contract to the agent *before* it generates code, and lets the agent check its own work.

A contract is two files per component:

```
specs/button/
  index.md      # frontmatter contract + human prose
  tokens.json   # the closed list of tokens this component may use
```

The frontmatter closes the system: `token_contract` is exhaustive, `semantic_parts` names every region a token can target, `required_aria` and `interaction_states` are enumerated, `sources` points at the real code/story/token files. Anything outside it is a lint failure.

## Does it actually catch anything?

Yes. The [enforcement benchmark](./benchmark) seeds the mistakes agents actually make and runs the validator:

```
  Agent mistakes surfaced:      7/7  (5 block CI, 2 warn)
  False positives (clean spec): 0
```

Invented tokens, contract/code drift, primitive-tier shortcuts, identity mismatch, self-reported "valid" while broken, bad dates, bad status — all surfaced, clean specs left alone. Run it yourself: `npm run benchmark`.

## Install

```bash
npx agentic-spec --help          # no install
npm install -g agentic-spec      # or global
```

Requires Node 18+.

## Use it

### 1. Scaffold and validate (CLI / CI)

```bash
npx agentic-spec init tooltip --out ./specs
npx agentic-spec validate ./specs        # recurses; validates every contract
```

`validate` exits non-zero on any error, so it drops straight into CI:

```yaml
- run: npx -y agentic-spec validate ./specs
```

### 2. Serve contracts to your agents (MCP)

Add the server to Claude Code, Cursor, or any MCP client:

```json
{
  "mcpServers": {
    "agentic-spec": {
      "command": "npx",
      "args": ["-y", "agentic-spec-mcp", "./specs"]
    }
  }
}
```

The agent gets three tools: `list_components`, `get_contract` (read the closed token list before writing), and `validate_spec` (check its own work after). The contract stops being something you catch in review and becomes something the agent reads up front.

## Bring your own design system

agentic-spec is not tied to any one system. The format works on MUI, Mantine, Chakra, or your own components and tokens. See **[Make your design system agent-safe in 20 minutes](./docs/adopt-in-20-minutes.md)**, with worked non-Clementine examples in [`examples/mui-switch`](./examples/mui-switch) and [`examples/astryx-button`](./examples/astryx-button) — the latter is the verifier pointed at Meta's newly open-sourced [Astryx](https://github.com/facebook/astryx).

## Reference implementation

[Clementine DS](https://github.com/tishsingh399/clementine-ds) is a 121-component React design system built entirely on this format — every component ships a contract, all 121 pass `agentic-spec validate`, and it's the proof the format holds at scale. [Live Storybook](https://clementine-ds-storybook.vercel.app) · [Docs](https://clementineds.mintlify.app).

## License

MIT
