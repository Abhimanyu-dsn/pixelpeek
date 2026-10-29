# PixelPeek: the complete guide

> **Update, version 0.8.0.** The interface was redesigned after this guide was written. Where this file describes the bottom dock, the side panel, floating element cards, the Toolbar/Panel/PagePanel classes or the Variants UI, `README.md` is current: one overlay panel (icons, heading, five tabs), responsive device preview, Layout guide, Animation, Components, Copy as Figma Layers, Tailwind and AI prompt, Saved library. Chrome's side panel was removed (it resizes the page); Variants has no UI for now; the Account icon is a placeholder.


Version 0.7.0 (see "What changed in 0.7.0" in README.md: Copy as Figma Layers, Tailwind and AI prompt per element, a Saved library, Alt-measuring, an exit pill, designers-first ordering; Variants is switched off by a flag). A Chrome extension (Manifest V3) for designers. It lets you point at anything on a web page and read it the way a design tool would, check how it looks in its hover/focus/active states, and pull the colours, fonts, assets and a design system out of the whole page. It is free, has no account and no server, and nothing leaves your machine.

This file explains what PixelPeek is, how to use it, how it works inside, where its limits are, and where it is going.

---

## 1. Contents

1. [What PixelPeek is for](#2-what-pixelpeek-is-for)
2. [Install and run](#3-install-and-run)
3. [Using it](#4-using-it)
4. [Feature reference](#5-feature-reference)
5. [How it works inside](#6-how-it-works-inside)
6. [Project layout](#7-project-layout)
7. [Permissions and privacy](#8-permissions-and-privacy)
8. [Known limitations](#9-known-limitations)
9. [Testing notes](#10-testing-notes)
10. [Decisions and history](#11-decisions-and-history)
11. [Roadmap](#12-roadmap)

## 2. What PixelPeek is for

Designers and front-end builders constantly ask the same questions of a live site: what font is that, what is that grey, how much padding is there, what does the button do on hover, which images and icons are on this page, can I get its colours as tokens. DevTools answers all of this but in CSS terms and across many panels. PixelPeek answers in design-tool terms (Figma vocabulary) in one place.

It has three families of features:

| Family | What it answers |
|---|---|
| **Inspect** | "What are the exact values of this one element?" Hover to outline, click to lock, read the Layout panel. |
| **Variants** | "What does this element look like on hover, focus, active, disabled, selected?" The state is forced live on the real page. |
| **Page-wide tools** | "What is on the whole page?" Colors (with contrast), Fonts, Assets, a generated design System, and a Clone of the page. |

The product direction is to match the feature set of Woblo (woblo.in), keep its own look, and add features that make it different. Forced-state variants are already something Woblo's page does not list. The full comparison is in `md files/COMPARE-woblo.md`.

## 3. Install and run

You need Node.js and Chrome 114 or newer.

```bash
npm install
npm run build        # one-off build into dist/
npm run watch        # rebuild on change (you still reload the extension by hand)
```

Load it:

1. Open `chrome://extensions`.
2. Turn on Developer mode (top right).
3. Click "Load unpacked" and pick the `dist/` folder.
4. After any rebuild, click the reload icon on PixelPeek's card. MV3 has no automatic reload.

Run it: open any normal web page and click the PixelPeek icon in Chrome's toolbar. Click the icon again, press **Esc**, or use the ✕ in the dock to close it.

PixelPeek cannot run on `chrome://` pages, the Chrome Web Store, or other pages Chrome blocks extensions from. On those the icon shows a red "!" badge for two seconds instead.

## 4. Using it

### The basic flow

1. Click the toolbar icon. A **dock** appears at the bottom of the page.
2. Move the mouse over the page. A blue outline and a tag chip (for example `p`, `button`) follow the element under the cursor.
3. **Click** to lock that element. By default Chrome's **side panel** opens on the right with the element's Layout.
4. With an element locked you can move around the page structure with the keyboard (see below).
5. Click the dock's tool buttons for page-wide views.
6. Press **Esc** or ✕ to exit completely.

### While PixelPeek is on, the page is frozen

PixelPeek behaves like an inspector cursor, not a visitor. Clicks, double-clicks, right-clicks, hover events and form submits are blocked before the page sees them, so links don't navigate, buttons don't fire and hover menus don't open. Scrolling still works. Everything returns to normal when you close PixelPeek.

### Keyboard

| Key | Effect |
|---|---|
| Click | Lock the hovered element |
| ↑ | Lock the parent |
| ↓ | Lock the first child |
| ← / → | Lock the previous / next sibling |
| Esc | Close PixelPeek completely (same as the ✕) |

### Unlocking without closing

With an element locked, click **outside** it twice. The first outside click only pulses the panel (a warning); the second unlocks so you can pick another element. Clicking inside the locked element or inside PixelPeek's own UI never counts.

### The dock

A pill at the bottom centre of the page.

| Button | Does |
|---|---|
| Inspect | Back to hovering and locking elements |
| Colors | Page palette and contrast checks |
| Fonts | Font families and type scale |
| Assets | Images, SVGs, icons, video, Lottie |
| System | Generated design system and exports |
| Clone | Save the page as one HTML file |
| Window icon | Switch between the side panel and floating panels |
| ✕ | Close PixelPeek |

Locking an element from any page-wide view returns to Inspect.

### Side panel or floating panel

- **Side panel (default).** Everything opens in Chrome's side panel. It has its own tabs (Inspect, Colors, Fonts, Assets, System, Clone) and the dock follows whichever you choose. The panel is shared by every tab and follows the one in front; on a tab where PixelPeek isn't running it says so. It closes when PixelPeek is closed.
- **Floating.** Press the window icon in the dock. The element's Layout appears in a draggable card next to the element, and the page-wide views appear in a card on the right of the page.
- If Chrome refuses to open the side panel, PixelPeek switches to floating by itself so you are never left with nothing.

The side panel can only be opened right after a click or key press (a Chrome rule). That is why it opens when you lock an element or press a dock button, not on its own.

## 5. Feature reference

### 5.1 Inspect and the Layout panel

Values are shown in design-tool terms. Every value has a copy button; every section has "section" to copy its CSS; "Copy all as CSS" copies the lot as plain `property: value;` lines.

| Section | What it shows |
|---|---|
| Typography | Font, size, line height, weight, letter spacing, alignment, decoration, case, truncation, approximate paragraph spacing |
| Colors | Background, text and border colours as hex, with swatches. **Text contrast**: ratio plus pass/fail for AA and AAA at normal and large sizes |
| Fill (gradient) | Each gradient layer: type, angle, colour stops |
| Stroke (per side) | Width, style and colour for top, right, bottom, left |
| Corner radius | Each corner separately |
| Effects | Opacity and each shadow layer (drop or inner: x, y, blur, spread, colour) |
| Position | X and Y relative to the parent, rotation, width, height, position, display |
| Margin & padding | Shown only when non-zero |
| Auto layout | The parent's flex/grid direction, alignment, distribution, gap and padding; the element's index and spacing to its siblings |
| Resize behaviour | **A guess** (Fixed / Hug / Fill) inferred from display and flex behaviour, labelled as such and not copyable |
| Raw CSS | The computed declarations, untouched |

Notes:

- The element's **selector** is shown in the header (`#id`, or `tag.class.class`).
- X/Y are measured from the parent's padding box, not the page. For rotated elements they are approximate (the browser reports the rotated bounding box).
- Text contrast is measured against the real colour behind the text: every ancestor's translucent background is composited down to the first opaque one, or white. If a background image sits behind the text, the panel says the ratio is against the colour only.
- Large text means at least 24px, or at least 18.66px and bold.

### 5.2 Variants

The round button in the panel header (cursor with a dashed box) switches to variants mode.

- **What it lists.** The states of the locked element that the page's own CSS defines: Hover, Focus, Active, Disabled, and state classes or attributes such as `.is-active`, `.selected`, `[aria-selected="true"]`, `[aria-expanded="true"]`, `[data-state="open"]`.
- **Choosing one.** The list collapses to a dropdown showing the chosen state. The Layout below shows that state's values, and the **real element on the page changes** to match.
- **Switching or leaving.** Pick another from the dropdown, or press the button again to put the element back.
- **Empty state.** "No variants available" when the CSS defines none for this element. If some stylesheets could not be read, the panel says how many, because states may be missing.
- **If something fails.** An error message replaces an endless spinner; the console logs `[PixelPeek] ...` lines.

How a state is forced (see section 6.4): Focus is a real `.focus()`, Disabled is the real `disabled` attribute, class and attribute states are real toggles, and Hover/Active (which a script can't trigger) apply the rule's declared properties as inline styles with `!important`. Everything changed is logged and undone so the page is never left in a stuck state.

### 5.3 Colors

- **Palette.** Every colour used on the page with how many times, most used first (up to 48 shown). Colours come from text, backgrounds, borders and SVG fills/strokes. Click a swatch to copy its hex.
- **Contrast.** Every text-colour/background-colour pair with its ratio, a sample, how many elements use it, and AA / AAA pass or fail for its text size. "Failing only" filters to the problems. The heading counts failures, for example "1 of 5 fail AA".
- Rescan re-reads the page (useful after the page changed).

### 5.4 Fonts

- **Families.** For each: a live sample in that font, weights used, size range, number of elements, and the **source**: the font file URL from `@font-face`, or the Google Fonts / Bunny / Typekit stylesheet that requests it. System fonts say so.
- **Type scale.** Every combination of size, line height, weight and family, with usage counts. Click a row to copy it as a `font:` declaration.

### 5.5 Assets

Finds:

- `<img>` images (at the resolution the page chose) and CSS `background-image` URLs
- Inline `<svg>` elements (serialised to standalone files; `currentColor` is replaced with the actual colour)
- Icons (anything 64px or smaller, plus the favicon and apple-touch-icon)
- `<video>` sources and posters
- Lottie files (`<lottie-player>` and friends, and `.lottie` / lottie `.json` requests)
- The page's share image (`og:image`)

Filter by kind (All, Images, SVG, Icons, Video, Lottie). Download one file with its button, or **Download all (ZIP)** for the current filter. The ZIP is written by PixelPeek itself (no library). The status line reports what was saved and what was skipped.

If a file's host blocks reading it (CORS), a single download opens it in a new tab so you can save it by hand, and the ZIP leaves it out.

### 5.6 System (design system)

Built from what the Colors and Fonts scan found:

- **Colour scales.** Primary, secondary and accent are the page's most-used vivid colours (at least 30 degrees apart in hue; fills count double against text, since brand colours show up as buttons and bars). Each becomes an 11-step scale (50 to 950) in which the nearest step is replaced by the real colour. The neutral scale takes the tint of the page's most-used grey.
- **Semantic colours.** Error, warning, success and info, only when the page has a vivid colour in that hue range.
- **Fonts.** Sans, heading and mono.
- **Type scale.** The page's sizes named `xs` to `8xl` around its most common size, with line-height ratios.
- **Radii, shadows, gradients, spacing.** The values the page actually uses, named by size.

Export formats (each can be copied or downloaded). The design system is read from the page (declared CSS variables, colours, text styles, effects, spacing, components) and nothing is generated, so the old 50–950 scales and the shadcn export are gone:

| Format | File |
|---|---|
| CSS variables | `tokens.css` |
| Tailwind v4 | `theme.css` (`@import "tailwindcss"` plus an `@theme` block) |
| SCSS | `tokens.scss` |
| DTCG tokens | `tokens.json` |
| JSON | `design-system.json` |
| DESIGN.md | `DESIGN.md`, a spec for AI coding agents |

Treat the output as a strong starting point, not gospel: names are assigned by sorted size, not read from the site's source.

### 5.7 Clone

Saves the page as one self-contained `.html` file:

- Scripts, preloads, inline event handlers and CSP meta tags are removed.
- `<link>` stylesheets are inlined as `<style>`; every `url(...)` in CSS (fonts, images) is made absolute and embedded as a data URI where it can be read (files over about 3 MB, or past 40 MB total, stay as links).
- `<img>` elements are embedded at their current resolution and lose `srcset` / lazy loading.
- A `<base>` tag points anything left over at the live site.

The result opens offline as a static snapshot. The panel lists what could not be made self-contained.

## 6. How it works inside

### 6.1 Pieces and where they run

PixelPeek has three runtime pieces:

| Piece | Runs in | Job |
|---|---|---|
| Background service worker (`background.js`) | The extension | Injects `content.js` on toolbar click; opens the side panel when asked |
| Content script (`content.js`) | The web page (isolated world) | Everything that touches the page: picker, capture, scans, variants, downloads, dock, floating panels |
| Side panel page (`sidepanel.html` + `sidepanel.js`) | The extension | Renders the same panels as the page does, and asks the content script for data |

The content script is injected on demand by `chrome.scripting.executeScript`, so PixelPeek needs no always-on access to any site. Injecting it a second time (clicking the icon while it is running) tears the first instance down, which is how the icon toggles it off.

### 6.2 UI isolation

All on-page UI lives in a **closed Shadow DOM** attached to a host `<div id="pixelpeek-host">`. The page's CSS can't touch it and `document.querySelector('#pixelpeek-host').shadowRoot` is `null`. A click inside the shadow root is seen by outside listeners as a click on the host, which is how PixelPeek tells its own clicks from page clicks.

The same stylesheet (`src/styles/panel.css`) styles the side panel; at load it rewrites `:host` to `:root`.

### 6.3 The picker and the page guard

`picker.ts` listens at the window level in the capture phase for mouse move, click, key down, scroll and resize. Hover uses `elementFromPoint` throttled with `requestAnimationFrame`. It ignores `<html>`, `<body>` and its own host.

`page-guard.ts` is built *after* the picker on purpose, so the picker's listeners run first. It then stops the page from seeing clicks, presses, hovers, submits and drags (stopImmediatePropagation plus preventDefault), except events that came from PixelPeek's own UI. Mouse-move and mouse-up are hidden from the page but not from other window-level listeners, because the panel's drag handling needs them.

### 6.4 Variants engine (`src/content/variants/`)

- **`sheets.ts`**: cross-origin stylesheets throw `SecurityError` on `cssRules`. PixelPeek re-downloads them with a plain CORS `fetch` (no credentials, 8 s timeout, 8 MB cap) and parses the text into a constructable stylesheet that is only ever read, never attached to the page. Works when the host allows CORS (most CDNs do).
- **`selector.ts`**: a small selector parser that finds the *subject* of each selector (the part after the last combinator) and tokenises it into classes, ids, attributes, tags and pseudo-classes.
- **`scanner.ts`**: walks every readable rule (including `@media`, `@supports`, `@layer` and `@import`, with a cycle guard and depth limit), keeps selectors with exactly one state token, removes that token, and asks `el.matches()` whether the rest still matches the locked element. Rules that only reach the element through a parent's state (`.card:hover .btn`) are ignored. Per-rule results are cached in a `WeakMap`; one unreadable rule is skipped, never fatal.
- **`detect.ts`**: merges matches into labelled variants (later rules win per property).
- **`force.ts`**: `VariantForcer` snapshots the element on lock and keeps an **undo log** of exactly what it touched (inline property and priority, added class, attribute value, previous focus). Reverting replays the log and never overwrites something the page changed itself in the meantime. It runs before applying another variant, on leaving variants mode, on unlock, before locking another element, on close, and on `pagehide`. Inline `transition: none` plus a forced reflow makes the computed values the final state, not mid-transition.

### 6.5 Capture (`src/content/capture.ts` and `capture/`)

`captureElement(el)` reads `getComputedStyle` and geometry once and produces a plain-data `ElementCapture` (types in `types.ts`). Helpers parse shadows, gradients, colours, rotation, auto layout and the resize guess. Because it is plain data, it can be sent between the page and the side panel as JSON.

### 6.6 Page scan, assets, system, clone

- **`scan/page-scan.ts`** reads up to 8,000 elements with `getComputedStyle` and tallies colours, text/background pairs, fonts, type styles, radii, shadows, gradients and spacing. Background colours are resolved through a per-scan cache so each ancestor is computed once. About 7,000 elements scan in under a second.
- **`scan/color-math.ts`, `scan/contrast.ts`**: colour parsing (regex, then a 1x1 canvas for `oklch()`/`color-mix()` etc.), HSL conversion, WCAG luminance and contrast.
- **`assets/`**: `collect.ts` finds assets, `download.ts` saves files, `zip.ts` writes a stored (uncompressed) ZIP with CRC-32.
- **`system/build.ts`, `system/export.ts`**: scan to tokens, tokens to each format.
- **`clone/clone.ts`**: the page-to-HTML pipeline described in 5.7.

**Downloads need no permission.** Files are saved by creating an object URL for a Blob and clicking a throwaway `<a download>`. The `downloads` permission is never requested.

### 6.7 The backend abstraction (floating vs side panel)

The page-wide views are written once in `PagePanel.ts` against a small `PageBackend` interface (`scan`, `collectAssets`, `downloadAsset`, `downloadZip`, `clone`).

- **Floating panel**: `LocalBackend` calls straight into the scans.
- **Side panel**: `RemoteBackend` sends a message to the content script and awaits the reply.

The element panel (`Panel.ts`) has a `docked` mode that fills its container instead of floating beside the element, and is used in the side panel with callbacks that message the page for variants.

### 6.8 Messaging (`src/content/bridge/`)

Every message has a string field `pp`.

| Direction | Messages |
|---|---|
| Page to background | `open-side` (gets `{ok}` back) |
| Page to side panel | `view`, `lock` (with the capture), `unlock`, `closed`, `progress` (zip/clone) |
| Side panel to page | `ping` (returns view and current capture), `scan`, `assets`, `asset-download`, `assets-zip`, `clone`, `variants`, `variant-select`, `view-changed`, `close` |

The page answers with a JSON reply, or `{error}` if a handler threw, so the side panel can show it. The side panel ignores messages from tabs other than the one it is showing.

**Opening the side panel.** `chrome.sidePanel.open()` only works during a live user gesture. The click or key press calls the background immediately, and the background calls `open()` as its first action with nothing awaited before it. The manifest's `side_panel.default_path` makes the panel available on every tab. If `open()` rejects, the page falls back to floating panels.

### 6.9 Build

`esbuild.config.mjs` bundles three IIFE entries (`background`, `content`, `sidepanel`) into `dist/`, loads `.css` as text, copies `manifest.json`, `sidepanel.html` and the icons. TypeScript is strict (`noUnusedLocals`, `noUnusedParameters`). Type-check with `npx tsc --noEmit`. There is no test framework.

## 7. Project layout

```
manifest.json            MV3 manifest (permissions, side panel, icons)
sidepanel.html           Shell page for the side panel
esbuild.config.mjs       Build
src/
  background/index.ts    Injects content.js; opens the side panel
  content/
    index.ts             Wires everything together (activate / deactivate)
    picker.ts            Hover, lock, keyboard, outside-click logic
    page-guard.ts        Freezes the page while active
    shadow-root.ts       Closed shadow host + stylesheet
    capture.ts           Element -> ElementCapture
    capture/             color, gradient, shadow, auto-layout/resize helpers
    types.ts             Shared data types
    panel/
      Panel.ts           Element Layout panel (floating or docked) + variants mode
      LayoutTab.ts       Renders the Layout sections
      layout-sections.ts Builds the sections (incl. contrast rows)
      VariantsView.ts    Variant list / dropdown rendering
      PagePanel.ts       Colors, Fonts, Assets, System, Clone views
      Toolbar.ts         The dock
      backend.ts         PageBackend interface
      local-backend.ts   Backend that runs in the page
      copy.ts, drag.ts, placement.ts
    variants/            sheets, selector, scanner, detect, force
    scan/                page-scan, contrast, color-math
    assets/              collect, download, zip
    system/              build (tokens), export (formats)
    clone/clone.ts       Page to single HTML
    bridge/              protocol (message types), listener (page side)
  sidepanel/
    index.ts             Side panel UI controller
    remote-backend.ts    Backend that messages the page
  styles/panel.css       The light theme, shared by page and side panel
md files/
  PLAN-variants.md       Original variants plan
  COMPARE-woblo.md       Feature comparison with Woblo
  PIXELPEEK-GUIDE.md     This file
```

## 8. Permissions and privacy

`manifest.json` requests only:

| Permission | Why |
|---|---|
| `activeTab` | Act on the tab you clicked the icon on |
| `scripting` | Inject `content.js` into that tab |
| `sidePanel` | Chrome's side panel |
| `storage` | The Saved library (kept on this computer) |

There are no host permissions, no `downloads`, no `tabs`. There is no backend, no analytics and no network call to any server of ours. The only network requests PixelPeek makes are ones for files that are already part of the page you are on: stylesheets (to read variants and fonts), and assets/images/fonts (to download or clone them), made with credentials omitted.

An earlier "Design Understanding" feature (a model-written explanation of each element, via a proxy) was removed completely. It needed an API key and a server, and was judged not useful.

## 9. Known limitations

- **Cross-origin files.** Anything from another domain is readable only if that host sends CORS headers. When not: the variants list says how many stylesheets it could not read; a single asset opens in a new tab instead of downloading and is skipped from the ZIP; the clone keeps a link to the live site for it.
- **Variants.** Not detected: nested CSS (`.btn { &:hover {} }`), `:focus-visible`, `:is()` / `:where()`, and combined states (`.btn.active:hover`). When several hover rules compete, later rules win; specificity isn't modelled. The lock-time Layout is read while the pointer is over the element, so it can include native `:hover` styling.
- **Page frozen.** Native CSS `:hover` styling and keyboard activation of an already-focused element can't be blocked from a script.
- **Page scan.** Reads the first 8,000 elements. Colours inside canvas, video frames and image pixels are not sampled. Contrast over gradients or images is measured against the background colour only.
- **Design system.** Scales and names are generated, so they are a starting point.
- **Clone.** Canvas is blank, video still streams from the live site, JavaScript-built content is captured as it looks at that moment, scripts don't run in the copy.
- **Side panel.** Opens only from a click or key press; shared across tabs; closed with the extension. Not tested yet in a real Chrome profile beyond a stand-in API (see below).
- **Restricted pages.** No `chrome://`, Web Store, or other pages Chrome blocks.

## 10. Testing notes

There is no automated test suite. Verification so far:

- Type-check with `npx tsc --noEmit` and build with `npm run build`.
- Behaviour was checked in the Claude desktop app's browser pane by serving the built `dist/content.js` from a local server and injecting it into local test pages (a page with gradients, shadows, low-contrast text, SVG and images) and static copies of real pages. The shadow root is closed, so tests temporarily patch `attachShadow` to be open to read the DOM.
- The ZIP output was validated with Python's `zipfile`. The cloned HTML was checked for scripts, the PixelPeek host, and embedded fonts/images.
- The side panel's messaging and UI were tested with a stand-in for the `chrome.*` APIs wired through a `BroadcastChannel`. That proves the protocol and rendering, **not** Chrome's real `sidePanel.open()` user-gesture behaviour, which has to be checked in a real Chrome: reload the extension, click the icon on a site, click an element, and the side panel should open. If it doesn't, check the service worker console on `chrome://extensions` for `[PixelPeek] Could not open the side panel`.
- Variants were verified end to end on a local page with real `:hover` / `:focus` / `:disabled` rules, and on real sites with cross-origin CSS.

## 11. Decisions and history

In order, roughly:

1. **Phase 1.** Picker, Layout panel, copy buttons, smart placement and drag.
2. **Figma vocabulary.** Layout rebuilt around shadows, gradients, per-side stroke, per-corner radius, position/rotation, auto layout, resize guess, raw CSS.
3. **Design Understanding** (model-based explanation) built, then **removed entirely** as not useful.
4. **Restyles.** Atlassian-style light theme, then a dark theme, then back to the **light theme as the final choice**.
5. **Close behaviour.** ✕ and Esc exit completely; a double outside-click only unlocks.
6. **Variants** (CSS state detection, force engine, revert logic, UI), then hardening: cross-origin stylesheet download, page guard, error states.
7. **Woblo parity.** Contrast checker, page scan, Colors/Fonts/Assets/System/Clone, design-system exports.
8. **Side panel mode.** First behind a dock button, then made the default so that clicking an element opens it; floating panels kept as the fallback.

Standing decisions: free forever with no accounts or usage caps; no `downloads` permission; light theme; page-wide tools are for everything Woblo offers, plus things Woblo doesn't.

## 12. Roadmap

Not built yet, in no fixed order:

- Verify the side panel in a real Chrome profile and fix whatever the user-gesture rules turn up.
- Detect nested CSS and `:focus-visible` in variants; model specificity.
- Differentiators over Woblo: responsive-breakpoint preview per element, animation/transition inspector, comparing two locked elements.
- Export/import of the design system to more targets.
- An automated test suite (the shadow-root-open test harness could become one).
- Packaging for the Chrome Web Store (icons exist; listing text, screenshots and a privacy statement still needed).

