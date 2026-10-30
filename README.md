# PixelPeek

Chrome extension for designers: hover any element on a page and read it the way a design tool shows it, copy it into Figma as editable layers, pull the colours, fonts, assets and a design system out of the whole page, and preview the page inside real device mockups. Free, no account, and nothing leaves your computer.

## Build

```bash
npm install
npm run build
```

Outputs to `dist/`. `npm run watch` rebuilds on change (you still reload the extension in `chrome://extensions`: MV3 has no auto-reload).

## Load as an unpacked extension

1. Open `chrome://extensions` and turn on Developer mode.
2. Click "Load unpacked" and select the `dist/` folder.
3. Click the PixelPeek icon on any web page to start. Press **Esc**, click the **Stop inspecting** pill at the top of the page, or click the icon again to exit.

Permissions: `activeTab`, `scripting`, `storage` (for the Saved library), and `debugger` (only for the responsive preview's mobile emulation, below). No `downloads`, no host permissions: files are saved straight from the page.

## The panel

One panel hovers over the right side of the page. It is `position: fixed`, so the page keeps its own width and layout.

**The tool pill.** A small frosted-glass dot floats over the page. Hover it and it opens into four tools: **Inspect**, **Responsive preview**, **Saved** and **Copy to Figma**. Drag it by its top mark to put it anywhere; it remembers where you left it. Once an element is selected the pill steps aside and the same four tools appear in a row at the top of the panel. Copy to Figma copies the selected element, or the last element you hovered if nothing is selected.

**The panel opens when you select.** While you pick an element only the floating pill is on screen, so nothing on the page is covered. Click an element and the panel opens with its details, with the four tools as icons in a row at its top. Hold that row to drag the panel anywhere; double-click it to put the panel back at the edge (the spot is remembered). The ✕ next to the name clears the selection and the panel closes again. Turn Inspect off to open the panel for the whole page.

**Two sections, top to bottom.** A light-grey section with what is selected (plus the Account icon) and the five tabs; then the white details.
**Selection:** the selected element's selector and size, with a ✕ to clear the selection. With nothing selected it says "Whole page".
**Tabs:** Styles, Figma, Assets, Design System, Export. Designer-facing tabs come first, code last.

**Cards.** Inside each tab every group of information is a collapsible card with an icon (click the header to fold it).
- **Styles, one element:** *Colors* (every colour in the element and everything inside it, as square swatches: hover shows Copy, click copies the hex; the contrast ratio with AA/AAA), *Typography* (a font card plus size, line height, weight chips, and align/case/decoration only when they are not the default), *Effect* (stroke, radius, shadows, opacity: only what the element has), *Animation* (only when it has any), *Layout* (size, padding, margin, display, position, a box-model diagram, and a switch to draw spacing on the page).
- **Values you can paste** are click-to-copy chips; values that are only informative (a guess, a pass/fail, a label) are shown but not copyable.
- **Assets:** one card per kind (Images, SVG, Icons, Video, Lottie), each with its own ZIP. **Design System:** Variables, Colors, Typography, Effects, Spacing and radius, Components. **Export:** the element, the design system, the whole page as HTML. **Figma:** Copy for Figma, What to expect.

**Hover card.** While you inspect, a small card follows the element under the pointer with its basics: size, font, text and fill colours (with contrast), padding, margin, radius and layout. **Click to select** it, and the panel opens. Without selecting, press **F** to copy the hovered element as Figma layers or **S** to save it. While the page scrolls, the highlight stays on its element and the card hides until scrolling stops.

**Dock (switched off).** The bottom bar of shortcuts is built but disabled; set `DOCK_ENABLED` in `src/content/features.ts` to bring it back.

**Spacing and margins.** The Spacing switch in Styles > Layout draws margin (orange) and padding (green) with their pixel values on the element under the pointer, and on the selected element. It is on or off until you change it; Styles > Layout guide has the same switch.

### Styles
With an element selected: **Colors** (every colour in the element and everything inside it, contrast ratio and AA/AAA, gradients), **Typography**, **Effect** (stroke, corner radius, shadows, opacity), **Animation** (transitions, animations and their `@keyframes`), **Layout guide** (position, spacing, auto layout, resize guess, a box-model diagram, and *Show guides on page* to draw margin and padding on the element).
With nothing selected: the same blocks for the whole page (palette with contrast pairs, font families and type scale, shadows/radii/gradients, spacing).

### Figma
**Copy as Figma Layers** for the selected element, the visible area or the whole page. PixelPeek draws the page as SVG; click the Figma canvas and press Ctrl+V (⌘V on Mac) and it becomes editable layers: rectangles with fills, gradients, strokes, radii and drop shadows, real text, embedded images and icons, groups named after the elements. It reproduces the browser's layout; it is not auto layout. Rotated or scaled elements, inner shadows, conic gradients and iframes are simplified, and the panel lists what was.

### Assets
Images, SVGs, icons, video, Lottie, CSS backgrounds, favicon and share image, with format and size. Download one or a ZIP. With an element selected, only the assets inside it are listed (a shape inside an icon lists the whole icon); clear the selection for the whole page.

### Design System
Read from the page, never generated. The way Figma organises a system:
- **Variables:** the CSS custom properties the site declares (`--brand-500`…), with their real names and values, aliases (`--text → --ink-900`) and dark-mode values from `.dark`, `[data-theme=dark]` or `prefers-color-scheme`. Sites with none say so.
- **Colors:** the colours the page actually uses, grouped by role (surface, text, border, icon), with how often each is used and the variable that holds it, if any.
- **Typography:** the fonts, and the text styles in use (family, size, weight, line height, letter spacing), named after the element they appear on (H1, Button, Link, Text).
- **Effects:** the real shadows and gradients. **Spacing and radius:** the values in use, with variable names where the site has them.
- **Components:** every distinct button, input, card and badge style with count, live preview, its real fill, text colour, border, radius, padding and font, and Tailwind.

### Export
For developers: the selected element's **Tailwind classes** (click one to copy it), **Copy as AI prompt**, **Copy all as CSS** and raw CSS; the whole page's design system as CSS variables, Tailwind v4, SCSS, DTCG, JSON or `DESIGN.md` (the site's own variable names are kept; values it never named get plain names such as `color-0c66e4`); and **Download as HTML** (the page as one self-contained file).

### Responsive preview
The phone icon opens a device list (Responsive, Phones, Tablets, Desktop, Watches, with search and *Quick Start iPhone 16 Pro*). Choosing one shows the page inside a mockup of that device at its real CSS size, so media queries answer as they would on the device. Rotate, reload, and for *Responsive* type any size. Esc closes the preview (a second Esc exits PixelPeek).
**It switches the browser to a phone or tablet, the way Chrome's device toolbar does.** While a phone or tablet preview is open, PixelPeek uses Chrome's `debugger` permission to send that device's user agent (iPhone and iPad as Safari, Pixel, Galaxy and Android tablets as Chrome) and to turn on touch input (`hover: none`, `pointer: coarse`), then loads the page, so sites that choose their layout from the user agent send their mobile version. The top bar says "iOS browser on" or "Android browser on". Chrome shows its own "PixelPeek started debugging this browser" bar for as long as the preview is open, and everything is switched back when you close it. Laptops, monitors and watches, and custom sizes of 1024px or more, change nothing.
While a preview is open only the preview scrolls and reacts: the page behind it is held still (scrolling past the end of the phone does not carry on into the site) and nothing behind it can be hovered, picked or saved. Closing the preview gives the page back.
Limits: the page is loaded in a frame, which sites can forbid; PixelPeek says so and offers a real browser window of that size instead. If Chrome's DevTools is open on the same tab the switch can fail, and the bar says "Frame only"; close DevTools and press Reload. The device pixel ratio is not emulated.

### Measuring and exit
Hover shows `tag · width × height`. With an element selected, hold **Alt** over another element to see the pixel distances between them.

### Saved
Save an element from the Saved view; it keeps its selector, size, text, colours, Tailwind and CSS on this computer (`chrome.storage.local`).

## The page stays frozen while PixelPeek is on
Clicks, double-clicks, right-clicks, hovers and form submits are blocked before the page sees them, so links do not navigate and buttons do not fire. Scrolling still works. Native CSS `:hover` styling and keyboard activation of an already-focused element cannot be blocked from a script.

## Not built or switched off
- **Variants** (forced hover/focus/state previews): the detection and forcing engine is kept in `src/content/variants/`, but its UI is removed for now.
- **Account / Google sign-in:** the Account icon is a placeholder. There is nothing to sync yet.
- **Side panel:** removed; Chrome's side panel resizes the page, which the overlay does not.

## Known limitations
- Files from other domains are readable only if the host allows CORS; otherwise an asset opens in a new tab, and the clone and Figma copy keep a link or leave it empty.
- Page scan reads the first 8,000 elements; Figma and clone cap pages at 4,000 elements / 20,000px.
- Contrast over gradients or images is measured against the background colour only.
- A site that declares no CSS variables has no named tokens; its system is then only what the page uses. Variables in stylesheets the browser will not let the extension read are missed.



