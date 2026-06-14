# Make your design system agent-safe in 20 minutes

You don't need Clementine. `agentic-spec` works on any design system — MUI,
Mantine, Chakra, or your own components and tokens. This walks through adding an
enforceable contract to one component, then wiring it so agents read it before
they write code.

The worked example here is an MUI-wrapped Switch. The finished spec lives in
[`examples/mui-switch/`](../examples/mui-switch/).

## 1. Scaffold a spec (2 min)

```bash
npx agentic-spec init switch --out ./specs --ds-version "my-design-system@1.0.0"
# ✓ Wrote ./specs/switch/index.md
# ✓ Wrote ./specs/switch/tokens.json
```

## 2. Name the parts and close the token list (10 min)

This is the only real work, and it's the work that makes the system legible to a
machine. In `index.md`:

- `semantic_parts` — every region a token can target (`track`, `thumb`, `root`).
- `token_contract` — the **closed** list of tokens this component may use.
  Anything an agent reaches for outside this list is a violation.
- `interaction_states` — `off`, `on`, `focus`, `disabled`.
- `required_aria` — `role`, `aria-checked`, `aria-label`.
- `sources` — point at your real `Switch.tsx`, story, and theme token files.

In `tokens.json`, list each token in the contract with the semantic theme token
it binds to (`{palette.primary.main}`, not a raw hex). Keep the count identical
to `token_contract` — the validator fails on drift in either direction.

## 3. Enforce it (1 min)

```bash
npx agentic-spec validate ./specs/switch
# PASS switch (./specs/switch)
#   tokens: 4 in contract, 4 in tokens.json · states: 4 · parts: 4
```

Wire the same line into CI so every PR — human or agent — has to pass it:

```yaml
- run: npx -y agentic-spec validate ./specs
```

## 4. Hand the contract to your agents (5 min)

Add the MCP server to the tools your agents run in (Claude Code, Cursor, etc.):

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

Now an agent can call `list_components`, `get_contract` (read the closed token
list before writing), and `validate_spec` (check its own work after). The
contract stops being a thing you catch in review and becomes a thing the agent
reads up front.

## What you get

Every component an agent touches now has a closed, checkable interface. Invented
tokens, missing states, wrong-tier bindings, and code-versus-spec drift fail
loudly — in the editor via MCP and in CI via the CLI — instead of shipping.
