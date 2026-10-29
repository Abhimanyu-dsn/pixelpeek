# PixelPeek — Phase 2: Variants

Read `CLAUDE.md`'s "Phase 2 — Variants" section first for the full data model and the reasoning behind each decision below. This file is the actionable sequence — work through it in order, since later steps depend on earlier ones being solid (the force-state engine needs a correct variant list to apply, revert logic needs the force-state engine already working, and so on).

This feature lives entirely in the existing browser extension — no second codebase, unlike the Figma Recreate feature.

## Steps

- [x] **CSS rule scanner.** Walk `document.styleSheets` for the locked element. Match pseudo-class rules (`:hover`, `:focus`, `:active`, `:disabled` — strip the pseudo-class, test the rest with `element.matches()`) and state-class rules (element's selector plus one extra class/attribute token from a known vocabulary: `selected`, `active`, `disabled`, `current`, `open`, `expanded`, `checked`, `is-active`, `aria-selected`, and similar). Only rules directly targeting the element count — not a parent's state cascading onto it. Skip cross-origin stylesheets that throw on read; don't error, just detect fewer variants.
- [x] **Variant list + labeling.** Convert scanner results into the `DetectedVariant` list, each auto-labeled from its matched pseudo-class or state-class token (`:hover` → "Hover", a `.disabled` class → "Disabled", etc.).
- [x] **Panel UI — list, dropdown collapse, empty state.** The variants entry point stays visible even with zero detected variants. With variants: a list the user can pick from, which collapses into a dropdown header on selection, reopenable to switch. With none: clicking it shows "No variants available" rather than an empty list.
- [x] **Force-state engine.** On first lock, snapshot the element's original attributes/classes/inline styles before anything is ever forced. Apply each variant via its correct method: real `.focus()` for Focus, real `disabled` attribute for Disabled, real class/attribute toggle for state-class variants, declared-properties-as-inline-styles for Hover and Active.
- [x] **Revert logic.** Before applying a newly-selected variant, fully revert whatever the previous one forced. On unlock, or on locking a different element, restore the original snapshot exactly. This has to be reliable — a forced state left stuck on the real page is the one outcome to avoid.
- [x] **Layout tab scoping.** While a variant is active, re-run the existing Layout capture against the element's current (forced) computed state, rather than its resting state. Design Understanding is untouched by any of this — always the base explanation.
