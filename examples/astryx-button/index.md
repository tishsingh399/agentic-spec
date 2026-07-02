---
component: astryx-button
ds_version: "@astryxdesign/core@0.1.2 (2026-07-02 verified against facebook/astryx@main)"
status: Draft
last_verified: 2026-07-02

category: Component
required_aria: [aria-label, aria-disabled, aria-busy, aria-live]

semantic_parts:
  root: The <button> element — owns variant fill, radius, focus ring, press scale
  label: Text content (typeScale label size/leading, medium weight)
  spinner: Busy-state indicator (aria-busy + aria-live announce)

token_contract:
  - color.accent
  - color.on-accent
  - color.neutral
  - color.text-primary
  - color.overlay-hover
  - color.overlay-pressed
  - radius.element
  - spacing.2
  - spacing.3
  - font-weight.medium
  - duration.fast

interaction_states: [default, hover, active, focus, disabled, loading]

checks:
  aria_correct: false
  structure_correct: false
  states_complete: false
  tokens_valid: true
  no_invented_styles: false

sources:
  react:
    path: packages/core/src/Button/Button.tsx
    underlying_library: stylex
    exports: [Button]
  tokens:
    semantic: packages/core/src/theme/tokens.stylex.ts
---

# AGENTIC DOCUMENTATION: ASTRYX BUTTON

> **This is a third-party example.** It demonstrates agentic-spec pointed at
> [Meta's Astryx](https://github.com/facebook/astryx) (MIT), written entirely
> from Astryx's public source. Nothing here is invented: every token name,
> value, and ARIA attribute below is verbatim from `Button.tsx` and
> `theme/tokens.stylex.ts` at the commit noted in `ds_version`.

## 1. Purpose & intent

Astryx's Button is the primary action element of Meta's open-sourced design
system. It is StyleX-based: variants bind semantic CSS custom properties
(`--color-accent`, `--color-neutral`) whose values are `light-dark()` literals,
so one binding serves both color schemes.

## 2. What the contract records (and one honest architectural note)

Astryx exposes a **single semantic tier over literals** — there is no
component-token tier like Clementine's `button.bg.default`. This spec records
entries at the tier they actually live at, rather than inventing a cascade
Astryx doesn't have. That difference is itself a finding the format makes
legible: two systems, one contract language, honestly different shapes.

| Part | State | Binding (verbatim from source) | Light value |
|---|---|---|---|
| root | primary fill | `colorVars['--color-accent']` | `#0064E0` |
| root | primary text | `colorVars['--color-on-accent']` | `#FFFFFF` |
| root | secondary fill | `colorVars['--color-neutral']` | `rgba(5, 54, 89, 0.1)` |
| root | secondary text | `colorVars['--color-text-primary']` | `#0A1317` |
| root | hover | overlay gradient `--color-overlay-hover` | `#0536590C` |
| root | active | overlay gradient `--color-overlay-pressed` | `#05365919` |
| root | focus ring | `2px solid colorVars['--color-accent']` on `:focus-visible` | `#0064E0` |
| root | radius | `radiusVars['--radius-element']` | `8px` |

## 3. Interaction states

`default · hover (overlay) · active (overlay + scale 0.98) · focus
(:focus-visible ring) · disabled (aria-disabled) · loading (Spinner +
aria-busy, announced via aria-live)` — all present in the component source.
Reduced motion is respected: transition duration drops to `0s` under
`prefers-reduced-motion: reduce`.

## 4. Why `status: Draft` and most checks `false`

Honesty over optics: this spec was verified against the *source*, not the
rendered DOM. `tokens_valid` is true because every contract entry maps to a
real binding in `Button.tsx`. The other checks (states in Storybook, painted
verification) would need Astryx's Storybook running under the parity harness —
a follow-up, not a claim.
