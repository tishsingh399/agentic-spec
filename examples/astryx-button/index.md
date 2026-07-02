---
component: astryx-button
ds_version: "@astryxdesign/core@0.1.2 + @astryxdesign/theme-neutral@0.1.2 (2026-07-02 verified)"
status: Draft
last_verified: 2026-07-02

category: Component
required_aria: [aria-label, aria-disabled, aria-busy]

semantic_parts:
  root: The rendered button or link-like action root; owns variant, size, focus, disabled, and loading state.
  label: Required accessible label; rendered as visible text unless children override it.
  icon: Optional leading icon; hidden/replaced by spinner during loading.
  end-content: Optional trailing icon or badge content after the label.
  spinner: Loading indicator shown when isLoading is true or clickAction is pending.

token_contract:
  - astryx.button.radius
  - astryx.button.press-scale
  - astryx.button.disabled-opacity
  - astryx.button.focus-offset
  - astryx.button.icon-only-aspect
  - astryx.color.accent
  - astryx.color.on-accent
  - astryx.color.neutral
  - astryx.color.text-primary
  - astryx.color.error
  - astryx.color.on-error
  - astryx.color.overlay-hover
  - astryx.color.overlay-pressed

interaction_states: [default, hover, active, focus-visible, disabled, aria-disabled, loading, interruptible-loading, icon-only]

checks:
  aria_correct: true
  structure_correct: true
  states_complete: true
  tokens_valid: true
  no_invented_styles: true

sources:
  code:
    path: node_modules/@astryxdesign/core/src/Button/Button.tsx
    framework: react
    underlying_library: "@astryxdesign/core"
    exports: [Button, ButtonProps, ButtonVariant, ButtonSize]
  tokens:
    semantic_light: node_modules/@astryxdesign/theme-neutral/src/neutralTheme.ts
    semantic_dark: node_modules/@astryxdesign/theme-neutral/src/neutralTheme.ts
    component: node_modules/@astryxdesign/core/src/Button/Button.doc.mjs
  figma:
    url: https://astryx.atmeta.com/
    component_set: Astryx Button

patterns_used_in: [form-actions, confirmation-dialog, toolbar, async-submit]
pages_used_in: [astryx-docs, astryx-playground]
---

# AGENTIC DOCUMENTATION: ASTRYX BUTTON

> A worked example showing `agentic-spec` applied to a public design system that is not Clementine. Astryx is owned by Meta and published under MIT. This example does not vendor Astryx; it records a small contract from public docs and npm package source so agents can see how the verifier model transfers.

## Why this example exists

Astryx positions itself as an AI-fluent design system. Its docs and CLI help agents generate UI with the library. `agentic-spec` answers the complementary question: once an agent builds with a design system, what contract can verify whether the result stayed inside the system?

The important distinction:

- Astryx gives agents a way to build UI with an open-source component library.
- `agentic-spec` gives teams a way to describe and check what "correct use" means.

This example is intentionally small. It covers one Astryx component, Button, using only public Astryx package metadata, docs, and source names.

## Source facts used

- Package: `@astryxdesign/core@0.1.2`
- Theme package: `@astryxdesign/theme-neutral@0.1.2`
- License: MIT
- Public repo metadata: `facebook/astryx`
- Public site: https://astryx.atmeta.com/
- Button docs file in the published package: `src/Button/Button.doc.mjs`
- Button implementation file in the published package: `src/Button/Button.tsx`

## Purpose

Astryx Button triggers an action when clicked. Use it for form submissions, confirmations, async actions, and other clear calls to action. If the interaction only navigates, use a link. If the button is a dedicated icon-only affordance, Astryx docs point users to `IconButton`.

## Required API contract

| Prop | Required | Notes |
|---|---:|---|
| `label` | yes | Required accessible label. Visible by default and used as `aria-label` for icon-only mode. |
| `variant` | no | `primary`, `secondary`, `ghost`, or `destructive`. Defaults to `secondary`. |
| `size` | no | `sm`, `md`, or `lg`. Defaults to `md`. |
| `isDisabled` | no | Disables interaction. With tooltip, Astryx uses `aria-disabled` so the button can remain focusable. |
| `isLoading` | no | Shows spinner and disables normal interaction. |
| `isInterruptible` | no | Keeps the button clickable while an async `clickAction` is pending. |
| `clickAction` | no | Async action API that drives pending/loading behavior. |
| `icon` | no | Leading icon. |
| `isIconOnly` | no | Square icon-only mode. Requires `icon`; label remains the accessible name. |
| `endContent` | no | Trailing badge or icon-like content; ignored in icon-only mode. |
| `tooltip` | no | Hover tooltip text. |

## Required token bindings

Astryx does not expose Button as a closed component-tier token file in the Clementine style. Instead, Button combines component-scoped CSS variables with semantic theme variables from Astryx's token system.

This example maps those public variables into a closed `agentic-spec` contract:

| Part | State / role | Contract token | Astryx source variable |
|---|---|---|---|
| root | radius | `astryx.button.radius` | `--_button-radius`, defaulting to `--radius-element` |
| root | active transform | `astryx.button.press-scale` | `--button-press-scale` |
| root | disabled opacity | `astryx.button.disabled-opacity` | `--button-disabled-opacity` |
| root | focus offset | `astryx.button.focus-offset` | `--button-focus-offset` |
| root | icon-only shape | `astryx.button.icon-only-aspect` | `--button-icon-only-aspect` |
| root | primary background | `astryx.color.accent` | `--color-accent` |
| label | primary foreground | `astryx.color.on-accent` | `--color-on-accent` |
| root | secondary background | `astryx.color.neutral` | `--color-neutral` |
| label | secondary / ghost foreground | `astryx.color.text-primary` | `--color-text-primary` |
| root | destructive background | `astryx.color.error` | `--color-error` |
| label | destructive foreground | `astryx.color.on-error` | `--color-on-error` |
| root | hover overlay | `astryx.color.overlay-hover` | `--color-overlay-hover` |
| root | active overlay | `astryx.color.overlay-pressed` | `--color-overlay-pressed` |

## Interaction states

| State | Expected behavior |
|---|---|
| default | Renders as an action control with required `label`. |
| hover | Applies hover overlay where hover media query is available. |
| active | Applies pressed overlay and press transform. |
| focus-visible | Shows 2px outline using the variant's focus color and the Button focus offset. |
| disabled | Removes press transform, applies disabled opacity, and blocks normal interaction. |
| aria-disabled | Used when tooltip needs the button to remain focusable. |
| loading | Shows spinner and announces loading state. |
| interruptible-loading | Allows a fresh click while async action is pending. |
| icon-only | Renders square; `label` remains accessible name. |

## Do / don't

**Do:**

- Use `label` as the source of accessible meaning.
- Reserve `primary` for the most important action in the view.
- Use `isLoading` or `clickAction` for async work.
- Use `destructive` only with a confirmation or recovery path.
- Keep variant choices inside `primary`, `secondary`, `ghost`, and `destructive` unless the Astryx theme intentionally extends the variant map.

**Don't:**

- Invent raw CSS values for Button states.
- Use Button for pure navigation when a link is the correct semantic element.
- Use more than one primary action in the same region.
- Treat Astryx's guidance as the same thing as enforcement; this spec is the enforcement layer on top.

## Agent note

If an agent is asked to build with Astryx Button, it should read this contract before writing code, then check:

1. Does the generated UI use `label`?
2. Does it pick a valid Button variant and size?
3. Does any async action expose loading behavior?
4. Does icon-only usage preserve an accessible name?
5. Did the output stay inside Astryx's theme variables instead of inventing raw colors or spacing?
