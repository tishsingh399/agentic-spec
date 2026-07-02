---
component: shadcn-button
ds_version: "shadcn/ui v4 new-york (2026-07-02 verified against shadcn-ui/ui@main)"
status: Draft
last_verified: 2026-07-02

category: Component
required_aria: [aria-invalid]

semantic_parts:
  root: The <button> (or Radix Slot) — owns variant fill, focus ring, disabled opacity
  label: Text content (text-sm, font-medium)
  icon: Optional svg child (size-4, pointer-events none)

token_contract:
  - primary
  - primary-foreground
  - secondary
  - secondary-foreground
  - accent
  - accent-foreground
  - ring
  - destructive
  - radius

interaction_states: [default, hover, focus, disabled, invalid]

checks:
  aria_correct: false
  structure_correct: false
  states_complete: false
  tokens_valid: true
  no_invented_styles: false

sources:
  react:
    path: apps/v4/registry/new-york-v4/ui/button.tsx
    underlying_library: radix-ui + cva + tailwind
    exports: [Button, buttonVariants]
  tokens:
    semantic: apps/v4/app/globals.css
---

# AGENTIC DOCUMENTATION: SHADCN/UI BUTTON

> **Third-party example.** agentic-spec pointed at [shadcn/ui](https://github.com/shadcn-ui/ui)
> (MIT) — the system most AI codegen tools scaffold with. Every class, token
> name, and value below is verbatim from `button.tsx` and the v4 default theme
> in `globals.css`. Nothing invented.

## 1. Purpose & intent

The shadcn/ui Button is a cva variant map over Tailwind utility classes whose
colors resolve through CSS custom properties (`--primary`, `--ring`, …) defined
per theme. Copy-paste distribution: the component lives in *your* repo, so the
contract below is what an agent should hold it to after scaffolding.

## 2. What the contract records (two honest architecture notes)

1. **Single semantic tier.** Like Astryx, shadcn has no component-token tier —
   `bg-primary` binds the semantic `--primary` directly to a literal
   (`oklch(0% 0 0)` in the v4 default light theme). Entries are recorded at the
   tier they actually live at.
2. **States by modifier, not token.** Hover is `bg-primary/90` — the same token
   at 90% opacity via Tailwind's alpha modifier — and disabled is
   `opacity-50`. There are no `primary-hover` / `primary-disabled` tokens to
   list; the contract notes the modifier instead of inventing token names.

| Part | State | Binding (verbatim) | v4 default light value |
|---|---|---|---|
| root | default fill | `bg-primary` | `oklch(0% 0 0)` |
| root | default text | `text-primary-foreground` | `oklch(0.985 0 0)` |
| root | hover | `hover:bg-primary/90` | primary @ 90% alpha |
| root | secondary fill | `bg-secondary` | `oklch(0.97 0 0)` |
| root | ghost hover | `hover:bg-accent` | `oklch(0.97 0 0)` |
| root | focus ring | `focus-visible:ring-ring/50 ring-[3px] border-ring` | `oklch(0.708 0 0)` @ 50% |
| root | invalid | `aria-invalid:border-destructive` | destructive |
| root | disabled | `disabled:opacity-50 pointer-events-none` | opacity modifier |
| root | radius | `rounded-md` ← `--radius` | `0.625rem` |

## 3. Why `status: Draft`

Verified against source, not rendered DOM. `tokens_valid` is true because every
contract entry maps to a real binding in `button.tsx` + a real definition in
`globals.css`. State coverage and painted verification would need the consuming
app's Storybook under a parity harness — per-repo by design, since shadcn
components are vendored, not installed.
