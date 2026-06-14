# Enforcement benchmark

**Question:** when an agent makes the mistakes agents actually make against a
design system, does the contract catch them?

```bash
npm run benchmark
```

## Result

Each row is one documented agent failure mode, seeded as a one-line mutation of
a real spec ([`examples/button`](../examples/button)) and run through the
validator. Deterministic, no LLM in the loop.

```
  BLOCK = fails CI (error)   WARN = surfaced (warning)   missed = slipped through

  ok     clean spec (control — must NOT flag)
  BLOCK  invents a token that doesn't exist                     missing-token-entry, lying-check
  WARN   leaves an orphan token (code/contract drift)           orphan-token-entry
  BLOCK  binds a component token straight to a primitive        bad-token-tier
  BLOCK  renames component in code but not in tokens            identity-mismatch, lying-check
  BLOCK  self-reports valid while the contract is broken        missing-token-entry, lying-check
  WARN   stamps a future verification date                      future-date
  BLOCK  uses an invalid status value                           bad-status

  Agent mistakes surfaced:      7/7  (5 block CI, 2 warn)
  False positives (clean spec): 0
```

Seven of the most common ways an agent drifts from a design system, all
surfaced; five block the merge, two flag as warnings, and the clean spec stays
silent. That's what "enforceable contract" means in practice.

## What this measures (and what it doesn't)

This measures the **enforcement layer** — does the validator catch the mistake
once it's in the spec/tokens. It is deterministic and reproducible, which is the
point: the number doesn't move between runs.

It does **not** measure an end-to-end agent A/B (does an agent *produce* fewer
mistakes when it can read the contract first). That needs a live model and is
the natural next experiment:

1. Pick 10 build tasks ("add a loading state to Button", "theme this card").
2. Run each twice with the same model — once with the contract available over
   the [MCP server](../src/mcp/index.ts), once without.
3. Score both with `agentic-spec validate` and count invented tokens, missing
   states, and wrong-tier bindings per task.

The harness here is the scoring half of that experiment; dropping a model into
the loop is the remaining half.
