---
component: button
ds_version: clementine-ds@HEAD (2026-06-08 verified)
status: AI-Ready
last_verified: 2026-06-08

category: Component
required_aria: [aria-label, aria-disabled, aria-busy]

semantic_parts:
  root:          The native <button> element — owns interactive state, focus ring, padding, sizing
  icon-leading:  Optional leading icon (left of label) — replaces with spinner in loading state
  label:         The text content of the button
  icon-trailing: Optional trailing icon (right of label)
  spinner:       Loading-state indicator that replaces icon-leading

token_contract:
  - button.bg.default
  - button.bg.hover
  - button.bg.active
  - button.bg.disabled
  - button.bg-destructive.default
  - button.bg-destructive.hover
  - button.bg-outline.default
  - button.bg-outline.hover
  - button.fg.on-filled
  - button.fg.on-outline
  - button.fg.disabled
  - button.border.default
  - button.border.hover
  - button.border.focus
  - button.radius

interaction_states: [default, hover, focus, active, disabled, loading]

checks:
  aria_correct: true
  structure_correct: true
  states_complete: true
  tokens_valid: true
  no_invented_styles: true

sources:
  react:
    path: packages/ui/src/components/Button.tsx
    underlying_library: mantine
    exports: [Button, ButtonProps]
  storybook:
    path: apps/storybook/stories/Button.stories.tsx
  tokens:
    primitives: packages/tokens/src/primitives.json
    semantic_light: packages/tokens/src/semantic-light.json
    component: packages/tokens/src/components/button.json
    semantic_dark: packages/tokens/src/semantic-dark.json

patterns_used_in: [form, action-bar, modal-footer, toolbar]
pages_used_in: [dashboard, settings, list-view]
---

# AGENTIC DOCUMENTATION: BUTTON

> **Implementation:** [`packages/ui/src/components/Button.tsx`](../../packages/ui/src/components/Button.tsx) — React wrapper over Mantine `Button`. Token bindings flow from `packages/tokens/src/semantic-light.json` (light) and `semantic-dark.json` (dark).

## 1. Purpose & Intent

Primary action trigger. Use to initiate actions like submit, save, cancel, or navigate. Three intents (primary, secondary, destructive), three variations (filled, outline, subtle) across three sizes (sm, md, lg).

**Button must:**

- be a native `<button>` element (never `<div role="button">` or `<a>` styled as a button)
- show the focus ring on `:focus-visible` using `focus.ring`
- communicate state via colour AND a second visual cue (border, opacity, fill) — never colour alone
- preserve hit area minimum 44 × 44 px (WCAG 2.5.5)
- expose `aria-disabled` and `aria-busy` for AT when disabled or loading

## 2. Required Contract

### 2.1 Required ARIA Attributes

| Attribute | Value | Notes |
|---|---|---|
| `role` | implicit `button` from `<button>` | Don't override |
| `aria-label` | action verb + object (`"Delete user"`) | Required when icon-only |
| `aria-disabled` | `true` when `disabled` | Use alongside the native `disabled` attribute |
| `aria-busy` | `true` while loading | Set when spinner is visible |

### 2.2 Required HTML Structure

```html
<button class="ds-button" data-intent="primary" data-size="md">
  <span class="ds-button__icon-leading">…</span>
  <span class="ds-button__label">Save changes</span>
  <span class="ds-button__icon-trailing">…</span>
</button>
```

In loading state, `icon-leading` is replaced by `spinner`; label and `aria-busy="true"` remain.

### 2.3 Required Token Bindings

| Semantic part | State | Token | Resolves (light) |
|---|---|---|---|
| root | default bg (primary) | `action.primary` | `{color.blue.6}` → `#2563eb` |
| root | hover bg (primary) | `action.primary-hover` | `{color.blue.7}` → `#1d4ed8` |
| root | active bg (primary) | `action.primary-active` | `{color.blue.8}` → `#1e40af` |
| root | default bg (destructive) | `action.destructive` | `{color.red.6}` → `#dc2626` |
| root | hover bg (destructive) | `action.destructive-hover` | `{color.red.7}` → `#b91c1c` |
| label | text on filled | `text.on-action` | `{color.white}` → `#ffffff` |
| label | text on subtle | `text.primary` | `{color.gray.9}` → `#1a1a18` |
| root | border (outline) | `border.strong` | `{color.gray.3}` → `#d4d4cf` |
| root | focus ring | `focus.ring` | `#ff8040` |

## 3. Interaction States

| State | Visual change | Tokens | Notes |
|---|---|---|---|
| default | base fill | `action.primary` | |
| hover | one step darker | `action.primary-hover` | pointer cursor |
| focus | 2px ring offset 2px | `focus.ring` outline | `:focus-visible` only |
| active | one step darker again | `action.primary-active` | mouse-down state |
| disabled | 50% opacity, no pointer events | base tokens dimmed | `aria-disabled="true"` |
| loading | spinner replaces leading icon | base tokens | `aria-busy="true"`, click handler suppressed |

## 4. Variants & Sizes

| Variant | Intent | Use when |
|---|---|---|
| `filled` | primary | Main action in a flow (one per region) |
| `filled` | destructive | Irreversible action (delete, revoke) |
| `outline` | primary / secondary | Secondary action next to a filled primary |
| `subtle` | primary / secondary | Low-emphasis action in dense UI |

| Size | Height | Use when |
|---|---|---|
| `sm` | 32px | Toolbar / dense table rows |
| `md` | 40px | Default — form actions, page actions |
| `lg` | 48px | Marketing CTAs, mobile primary actions |

## 5. Do / Don't

**Do:**
- Use the native `<button>` element
- Pair destructive actions with a confirm step or undo
- Set `aria-label` when there's no visible text
- Use one filled-primary per visual region

**Don't:**
- Use `<div role="button">` — Mantine returns a `<button>`, keep it
- Stack two filled-primary buttons next to each other
- Communicate disabled state with colour alone — opacity + `aria-disabled` together
- Invent new colour tokens — if a state is missing, extend `semantic-light.json` and `semantic-dark.json` and re-verify

## 6. Agent Notes

What an AI agent must check before editing Button:

1. Every token referenced in code MUST exist in `packages/tokens/src/semantic-*.json`. Run the token-contract lint after changes.
2. Don't bypass Mantine's prop API — extend `MantineButtonProps` (see [`Button.tsx:4`](../../packages/ui/src/components/Button.tsx)).
3. Storybook story names should map 1:1 to entries in `interaction_states`. Add a story for every new state.
4. If you add a variant, update §4 (Variants), `tokens.json`, and add a Storybook story in the same commit.
5. Dark-mode resolution: same token names, different primitive bindings in `semantic-dark.json`. Never hardcode a hex.
