---
component: mui-switch
ds_version: my-design-system@1.0.0 (2026-06-13 verified)
status: Draft
last_verified: 2026-06-13

category: Component
required_aria: [role, aria-checked, aria-label]

semantic_parts:
  root:  The switch root / hit area
  track: The background track that changes colour by state
  thumb: The sliding knob
  label: Optional adjacent text label

token_contract:
  - switch.track.off
  - switch.track.on
  - switch.thumb.default
  - switch.focus.ring

interaction_states: [off, on, focus, disabled]

checks:
  aria_correct: true
  structure_correct: true
  states_complete: true
  tokens_valid: true
  no_invented_styles: true

sources:
  react:
    path: src/components/Switch.tsx
    underlying_library: "@mui/material"
    exports: [Switch]
  storybook:
    path: src/components/Switch.stories.tsx
  tokens:
    semantic_light: src/theme/tokens.light.json
    semantic_dark: src/theme/tokens.dark.json

patterns_used_in: [settings-row, form-field]
pages_used_in: [settings]
---

# AGENTIC DOCUMENTATION: SWITCH

> A worked example showing the agentic-spec format on a design system that is **not** Clementine — here, a team wrapping MUI. The format is design-system-agnostic: name your parts, close your token list, enumerate your states, point at your code. See [`docs/adopt-in-20-minutes.md`](../../docs/adopt-in-20-minutes.md).

## Purpose

A binary on/off control wrapping MUI `Switch`. Use for an immediate, self-saving setting. For a choice that only applies on submit, use a Checkbox.

**Switch must:**

- be operable by keyboard (Space toggles), with a visible focus ring on `:focus-visible`
- expose `role="switch"` and `aria-checked`
- carry an `aria-label` (or a wired visible label) — never an unlabelled toggle
- communicate the on/off state with more than colour (the thumb position is the second cue)

## Required token bindings

| Part | State | Token | Binds to (semantic) |
|---|---|---|---|
| track | off | `switch.track.off` | `{palette.neutral.300}` |
| track | on | `switch.track.on` | `{palette.primary.main}` |
| thumb | all | `switch.thumb.default` | `{palette.common.white}` |
| root | focus | `switch.focus.ring` | `{palette.focus.ring}` |

## Interaction states

| State | Visual | Notes |
|---|---|---|
| off | thumb left, neutral track | `aria-checked="false"` |
| on | thumb right, primary track | `aria-checked="true"` |
| focus | 2px ring | `:focus-visible` only |
| disabled | 50% opacity, no pointer events | `aria-disabled="true"` |

## Do / Don't

**Do:** label every switch; toggle on Space; save immediately.
**Don't:** use a switch for a form value that needs submit; rely on track colour alone; invent a token outside the four above — extend the theme and re-verify instead.
