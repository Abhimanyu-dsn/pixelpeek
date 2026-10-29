# PixelPeek vs Woblo (woblo.in)

Source: Woblo's landing page only (claims, not hands-on testing). Install it and verify before building anything from a single line of marketing copy.

## Feature matrix

| # | Woblo feature | PixelPeek today | Gap | Effort |
|---|---|---|---|---|
| 1 | Hover to measure, click to pull styles | Hover + lock + Layout panel (typography, colors, shadows, gradients, stroke, radius, position, auto layout, raw CSS) | None. PixelPeek is deeper in Figma vocabulary | Done |
| 2 | Contrast ratio inline, AA / AAA pass-fail | No | **Gap** | Small |
| 3 | Floating draggable overlay in Shadow DOM | Yes | None | Done |
| 4 | Docked side panel mode | No | **Gap** (needs `chrome.sidePanel`) | Medium |
| 5 | Whole-page color palette with contrast pairs | No | **Gap** | Medium |
| 6 | Fonts and type scale (families, weights, sizes, line heights, source links) | Per-element typography only | **Gap**: page-level view | Medium |
| 7 | Asset extraction: images, SVG, icons, video + poster, Lottie; single download or ZIP | No | **Gap** (biggest one) | Large |
| 8 | Design system generator: color scales (11 shades), type scale, radii, shadows, gradients | No | **Gap** | Large |
| 9 | Export: Tailwind v4, shadcn, DTCG, CSS vars, SCSS, JSON | Per-element "Copy as CSS" only | **Gap** | Medium (after #8) |
| 10 | `DESIGN.md` export for AI coding agents | No | **Gap** | Small (after #8) |
| 11 | Page Clone: one self-contained HTML file | No | **Gap** | Large |
| 12 | Auth, plans, usage limits | No | Decide first (see below) | n/a |
| 13 | Hover / focus / active / disabled / state-class variants, forced live on the page | **Yes** | Woblo's page does not mention this. PixelPeek advantage | Done |

## Suggested build order

Each step is useful on its own, cheapest and most reusable first.

1. **Contrast checker (#2).** Reuses the colors already captured. Adds an AA/AAA badge in the Colors section.
2. **Page scan engine.** One content-side pass that gathers all colors, fonts, sizes, radii, shadows and gradients on the page. Feeds #5, #6, #8, #9, #10.
3. **Colors + Fonts views (#5, #6).** New panel views or tabs over the scan.
4. **Assets (#7).** Find `img`, `picture`, inline `svg`, CSS `background-image`, `video` and Lottie JSON. Download needs the `downloads` permission, and ZIP needs a small library.
5. **Design system + exports (#8, #9, #10).** Built from the scan. Tailwind, CSS vars, JSON and `DESIGN.md` are mostly formatting once the scan exists.
6. **Side panel mode (#4).** Optional. Floating panel already covers the use case.
7. **Page Clone (#11).** Last. Inlining CSS, images and fonts reliably is the hardest piece.

## Where PixelPeek can be different

- Variants and forced states are already ahead of Woblo's listed features.
- Ideas for later: a responsive-breakpoint preview per element, an animation and transition inspector, and a diff of two locked elements.
- Woblo's free tier caps exports. PixelPeek could make exports uncapped as a selling point.

## Decisions needed before building

- **Accounts and plans:** Woblo uses backend-signed tokens. PixelPeek has no backend now, so the suggestion is none: free and local. This keeps the "nothing leaves your machine" story.
- **Permissions:** assets and downloads add `downloads`. Reading cross-origin assets or CSS reliably may need broader host access, which means a bigger install warning.
- **Visual design:** keep the current dark theme. Do not copy Woblo's look.
