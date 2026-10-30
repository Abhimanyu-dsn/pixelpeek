# Chrome Web Store listing: PixelPeek

Copy each block into the matching field in the Developer Dashboard.

## Store listing tab

**Name**
PixelPeek

**Summary** (the manifest description; limit 132 characters, this is 126)
Inspect any element, copy it to Figma as editable layers, and pull colours, fonts, assets and the design system from any page.

**Category**
Developer Tools

**Language**
English

**Description**

PixelPeek is a free inspector for designers and developers. Click the toolbar icon on any page, hover an element to read it the way a design tool shows it, and take what you need: into Figma, into code, or into your own files.

FOR DESIGNERS
• Hover card: size, font, text and fill colours with contrast ratio, padding and radius, on every element you point at.
• Every colour in a selection: select a section and see all the colours inside it, not just its own.
• Copy as Figma layers: copy an element, the visible area or the whole page, then paste into Figma as editable rectangles, text, gradients, shadows, images and icons.
• Design system, read from the page: the site's own CSS variables (with dark-mode values), the colours it uses grouped by role, its text styles, shadows, spacing, radius and components. Nothing is generated or guessed.
• Assets: images, SVGs, icons, video and CSS backgrounds, one by one or as a ZIP.
• Responsive preview: see the page inside phone, tablet and desktop mockups at their real CSS sizes, with a phone or tablet user agent and touch input switched on, like Chrome's device toolbar.
• Spacing guides and Alt-measure: draw margin and padding on the page, and hold Alt to measure the distance between two elements.
• Contrast checker with AA and AAA results, including text on gradients.

FOR DEVELOPERS
• Tailwind classes for the selected element, click any class to copy it.
• Copy as AI prompt: the element's values, ready to paste into an AI coding tool.
• Raw CSS, copy all or by value.
• Export the page's design system as CSS variables, Tailwind v4, SCSS, DTCG tokens, JSON or DESIGN.md. The site's own variable names are kept.
• Download the whole page as one self-contained HTML file.

QUICK KEYS
• F while hovering: copy the element as Figma layers.
• S while hovering: save the element to your library.
• Esc: leave PixelPeek.

PRIVATE AND FREE
No account, no tracking, no ads. PixelPeek works entirely in your browser. Nothing you inspect is sent anywhere. Your saved elements stay on your computer.

PixelPeek only runs on the page where you click its icon, and stops when you press Esc or click the icon again.

## Privacy practices tab

**Single purpose**
Inspect the elements of the web page you are viewing and extract its design information (colours, fonts, spacing, assets and design tokens) so it can be copied into design tools or code.

**Permission justifications**

- `activeTab`: lets PixelPeek run on the tab where the user clicks the toolbar icon, and only that tab, without asking for access to every site.
- `scripting`: used to inject PixelPeek's inspector into that tab when the user clicks the icon.
- `storage`: keeps the user's saved elements (the Saved library) and the position of the floating tool pill and panel on their own computer, in `chrome.storage.local`.
- `debugger`: used only by the Responsive preview, and only while the user has a phone or tablet preview open. It sets the device's user agent and touch input on the current tab (the same two switches as Chrome's own device toolbar) so a site shows the mobile version it would show on that device. It is attached when the preview opens and detached when it closes. It never reads page data through the debugger, and nothing is recorded or sent anywhere.

**Host permissions**
None requested.

**Remote code**
No. All code ships inside the extension package.

**Data usage (what to tick in the dashboard)**
PixelPeek does not collect or transmit user data. In the data-usage section leave every category unticked ("Personally identifiable information", "Health", "Financial", "Authentication", "Personal communications", "Location", "Web history", "User activity", "Website content").

Tick all three certifications at the bottom:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**
The public address of `privacy-policy.html` once you host it (see PUBLISHING.md).

## Graphics

- Store icon 128×128: `icons/icon128.png` (already in the package).
- Screenshots (1280×800), upload in this order, with these captions if the dashboard asks:
  1. `screenshots/1-hover-card.png`: "Hover any element to read its size, font, colours and contrast."
  2. `screenshots/2-all-colors-in-a-selection.png`: "Select a section and see every colour inside it."
  3. `screenshots/3-design-system.png`: "The site's own design system: variables, colours, text styles."
  4. `screenshots/4-responsive-preview.png`: "Preview the page inside real device mockups."
  5. `screenshots/5-tailwind-and-code-export.png`: "Tailwind classes, CSS and exports for developers."
- Small promo tile 440×280: `promo-tile-440x280.png` (required).
- Marquee promo tile 1400×560: `marquee-1400x560.png` (optional).
