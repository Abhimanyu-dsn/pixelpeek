import { escapeHtml } from './html';
import { buildAiPrompt } from '../dev/ai-prompt';
import type { ElementCapture } from '../types';
import type { PageScan } from '../scan/page-scan';
import type { ComponentGroup } from '../scan/components';
import { assetPreview, formatBytes } from '../assets/collect';
import type { Asset, AssetKind } from '../assets/collect';
import type { DesignSystem } from '../system/build';
import { tokenColor } from '../scan/tokens';
import type { DeclaredToken } from '../scan/tokens';
import { buildExport, EXPORT_LABELS } from '../system/export';
import type { ExportFormat } from '../system/export';
import type { FigmaResult } from '../figma/to-svg';
import type { CloneSummary } from './backend';
import type { SavedItem } from '../library/store';
import { CATEGORY_LABELS, DEVICES, QUICK_START, deviceById } from '../devices/devices';
import type { DeviceCategory } from '../devices/devices';

export type Tone = '' | 'ok' | 'warn';

export interface ViewState {
  capture: ElementCapture | null;
  scan: PageScan | null;
  scanning: boolean;
  scanError: string | null;
  system: DesignSystem | null;
  components: ComponentGroup[] | null;
  componentsLoading: boolean;
  failingOnly: boolean;
  guidesOn: boolean;
  assets: Asset[];
  assetsLoading: boolean;
  assetStatus: { text: string; tone: Tone };
  busy: boolean;
  figma: FigmaResult | null;
  figmaStatus: { text: string; tone: Tone };
  exportFormat: ExportFormat;
  clone: CloneSummary | null;
  cloneStatus: string;
  saved: SavedItem[];
  deviceQuery: string;
  deviceOpen: DeviceCategory | null;
  // Cards the user opened or closed; everything else follows its default.
  cards: Record<string, boolean>;
}

// ---------------------------------------------------------------------------------------------
// Pieces every tab is built from
// ---------------------------------------------------------------------------------------------

const ico = (body: string): string =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const I = {
  palette: ico('<path d="M12 3a9 9 0 100 18c1.7 0 2-1.2 1.4-2.2-.7-1.2.1-2.8 1.6-2.8H17a4 4 0 004-4c0-4.4-4-9-9-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8" r="1"/>'),
  type: ico('<path d="M4 20l6-16 6 16M6.5 14h7M17 20h4M19 11v9"/>'),
  effect: ico('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'),
  play: ico('<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>'),
  layout: ico('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
  spacing: ico('<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 7v4M11 7v3M15 7v4M19 7v3"/>'),
  figma: ico('<path d="M8 3h4a3 3 0 010 6H8z"/><path d="M12 3h4a3 3 0 010 6h-4z"/><path d="M8 9h4a3 3 0 010 6H8z"/><circle cx="15" cy="12" r="3"/><path d="M8 15a3 3 0 103 3v-3z"/>'),
  info: ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  image: ico('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>'),
  svg: ico('<path d="M12 3l9 5v8l-9 5-9-5V8z"/><path d="M12 12l9-4M12 12v9M12 12L3 8"/>'),
  star: ico('<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>'),
  video: ico('<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>'),
  wand: ico('<path d="M15 4l5 5L9 20l-5-5zM13 6l5 5M5 3v3M3.5 4.5h3M19 15v3M17.5 16.5h3"/>'),
  boxes: ico('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
  tokens: ico('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  code: ico('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>'),
  file: ico('<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>'),
  download: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16"/></svg>`,
  chevron: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`,
  phone: ico('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
  tablet: ico('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M11 18h2"/>'),
  desktop: ico('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  watch: ico('<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l1-4h4l1 4M9 18l1 4h4l1-4"/>'),
  responsive: ico('<path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3"/>'),
};

const esc = escapeHtml;
const rescan = '<button class="pp-btn" data-pp-act="rescan">Rescan</button>';
const empty = (text: string): string => `<div class="pp-empty">${text}</div>`;
const note = (text: string): string => `<p class="pp-note" style="margin:0 0 8px">${text}</p>`;
const status = (s: { text: string; tone: Tone }): string => (s.text ? `<p class="pp-status${s.tone ? ` pp-${s.tone}` : ''}">${esc(s.text)}</p>` : '');
const warn = (error: string): string => `<div class="pp-empty">Couldn't read this page</div><p class="pp-status pp-warn">${esc(error)}</p>`;
const ratioText = (ratio: number): string => `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;

// Where a font comes from: its file or stylesheet, a font every computer has, or (honestly) unknown.
const SYSTEM_FONTS = /^(arial|helvetica|helvetica neue|times|times new roman|georgia|courier|courier new|verdana|tahoma|trebuchet ms|impact|segoe ui|system-ui|ui-sans-serif|ui-serif|ui-monospace|sans-serif|serif|monospace|cursive|fantasy|-apple-system|blinkmacsystemfont|menlo|consolas|monaco)$/i;
function fontOrigin(family: string, source: string | null): string {
  if (source) return ` · <a href="${esc(source)}" target="_blank" rel="noopener noreferrer">source</a>`;
  if (SYSTEM_FONTS.test(family)) return ' · system font';
  return ' · no font file found (not loaded, or in a stylesheet PixelPeek cannot read)';
}

interface CardOptions {
  // Shown to the right of the title, e.g. a count.
  meta?: string;
  // Starts closed.
  closed?: boolean;
  // Extra buttons for the header (before the chevron).
  actions?: string;
}

// A collapsible card: icon, title, optional header buttons, and a chevron.
function card(s: ViewState, id: string, title: string, icon: string, body: string, o: CardOptions = {}): string {
  const open = s.cards[id] ?? !o.closed;
  return `
    <section class="pp-card${open ? ' pp-card-open' : ''}" data-pp-anchor="${id.split(':')[1] ?? id}">
      <div class="pp-card-head" data-pp-act="card" data-pp-value="${esc(id)}" role="button" tabindex="0" aria-expanded="${open}">
        <span class="pp-card-ico">${icon}</span>
        <h3>${esc(title)}</h3>
        ${o.meta ? `<span class="pp-card-meta">${o.meta}</span>` : ''}
        ${o.actions ?? ''}
        <span class="pp-card-chev">${I.chevron}</span>
      </div>
      ${open ? `<div class="pp-card-body">${body}</div>` : ''}
    </section>`;
}

// A label and value; clicking copies `copy`. `copy` left out means the value is only for reading.
function value(label: string, text: string, copy?: string, swatch?: string): string {
  const sw = swatch ? `<span class="pp-swatch" style="background:${esc(swatch)}"></span>` : '';
  const inner = `<span class="pp-cv-k">${esc(label)}</span><span class="pp-cv-v">${sw}${esc(text)}</span>`;
  return copy !== undefined
    ? `<button class="pp-cv" data-pp-act="copy" data-pp-copy="${esc(copy)}" title="Click to copy">${inner}<span class="pp-cv-i">⧉</span></button>`
    : `<div class="pp-cv pp-cv-off">${inner}</div>`;
}

// A square of colour that copies its hex when clicked, with a "Copy" hint on hover.
function square(hex: string, caption: string, copy = hex): string {
  return `
    <button class="pp-sq" data-pp-act="copy" data-pp-copy="${esc(copy)}" title="Copy ${esc(copy)}">
      <span class="pp-sq-fill" style="background:${esc(hex)}"><span class="pp-sq-copy">Copy</span></span>
      <span class="pp-sq-hex">${esc(hex)}</span>
      <span class="pp-sq-sub">${caption}</span>
    </button>`;
}

const valueGrid = (...items: string[]): string => `<div class="pp-cv-grid">${items.filter(Boolean).join('')}</div>`;

// ---------------------------------------------------------------------------------------------
// Styles tab: one element
// ---------------------------------------------------------------------------------------------

const TEXT_TAGS = new Set(['input', 'button', 'textarea', 'select']);
const px = (n: number): string => `${Math.round(n * 10) / 10}px`;
const edge = (t: number, r: number, b: number, l: number): string =>
  t === r && r === b && b === l ? px(t) : t === b && r === l ? `${px(t)} ${px(r)}` : `${px(t)} ${px(r)} ${px(b)} ${px(l)}`;
const isZero = (v: string | undefined): boolean => !v || parseFloat(v) === 0;

function boxModel(capture: ElementCapture): string {
  const { margin, border, padding, content } = capture.layout.boxModel;
  const n = (v: number): string => (v ? String(Math.round(v * 10) / 10) : '–');
  return `
    <div class="pp-boxmodel" aria-label="Box model">
      <div class="pp-bm pp-bm-margin"><span class="pp-bm-name">margin</span><span class="pp-bm-t">${n(margin.top)}</span>
        <div class="pp-bm pp-bm-border"><span class="pp-bm-name">border</span><span class="pp-bm-t">${n(border.top)}</span>
          <div class="pp-bm pp-bm-padding"><span class="pp-bm-name">padding</span><span class="pp-bm-t">${n(padding.top)}</span>
            <div class="pp-bm pp-bm-content">${Math.round(content.width)} × ${Math.round(content.height)}</div>
            <span class="pp-bm-b">${n(padding.bottom)}</span><span class="pp-bm-l">${n(padding.left)}</span><span class="pp-bm-r">${n(padding.right)}</span>
          </div>
          <span class="pp-bm-b">${n(border.bottom)}</span><span class="pp-bm-l">${n(border.left)}</span><span class="pp-bm-r">${n(border.right)}</span>
        </div>
        <span class="pp-bm-b">${n(margin.bottom)}</span><span class="pp-bm-l">${n(margin.left)}</span><span class="pp-bm-r">${n(margin.right)}</span>
      </div>
    </div>`;
}

const ROLE_WORD: Record<string, string> = { background: 'fill', text: 'text', border: 'border', icon: 'icon', gradient: 'gradient' };
const COLORS_SHOWN = 24;

// Every colour inside the selected element, its own first, then everything inside it.
function colorsCard(s: ViewState, c: ElementCapture): string {
  const palette = c.layout.palette;
  const all = s.cards['styles:colors:all'] === true;
  const shown = all ? palette : palette.slice(0, COLORS_SHOWN);
  const caption = (p: (typeof palette)[number]): string => `${p.roles.map((r) => ROLE_WORD[r]).join('/')}${p.count > 1 ? ` · ${p.count}×` : ''}`;

  const own = shown.filter((p) => p.own);
  const inside = shown.filter((p) => !p.own);
  const group = (title: string, items: typeof palette): string =>
    items.length ? `${title ? `<div class="pp-sub"><span>${title}</span></div>` : ''}<div class="pp-squares">${items.map((p) => square(p.hex, caption(p))).join('')}</div>` : '';
  const body = own.length && inside.length
    ? `${group('On this element', own)}${group(`Inside it · ${palette.length - own.length}`, inside)}`
    : group('', shown);
  const more = palette.length > COLORS_SHOWN
    ? `<button class="pp-btn pp-btn-sm" style="margin-top:10px" data-pp-act="card" data-pp-value="styles:colors:all" aria-expanded="${all}">${all ? 'Show fewer' : `Show all ${palette.length}`}</button>`
    : '';

  const gradients = c.layout.fills
    .map((f) => `<button class="pp-grad" style="background:${esc(f.raw)}" data-pp-act="copy" data-pp-copy="background-image: ${esc(f.raw)};" title="Copy gradient"><span>Copy gradient</span></button>`)
    .join('');

  const k = c.layout.contrast;
  const tag = (pass: boolean, label: string): string => `<span class="pp-tag ${pass ? 'pp-tag-pass' : 'pp-tag-fail'}">${label} ${pass ? 'pass' : 'fail'}</span>`;
  const contrast = !k
    ? ''
    : k.onImage
      ? '<div class="pp-contrast"><span class="pp-pair-hex">Text sits over an image, so its contrast cannot be measured.</span></div>'
      : `<div class="pp-contrast"><span class="pp-contrast-ratio" title="Text colour against what is behind it">${ratioText(k.ratio)}</span>${tag(k.aa, 'AA')}${tag(k.aaa, 'AAA')}${k.large ? '<span class="pp-pair-hex">large text</span>' : ''}${k.gradient ? '<span class="pp-pair-hex">worst point of the gradient</span>' : ''}</div>`;

  if (!palette.length && !gradients) return '';
  return card(s, 'styles:colors', 'Colors', I.palette, `${body}${more}${gradients}${contrast}`, { meta: String(palette.length) });
}

function typographyCard(s: ViewState, c: ElementCapture): string {
  const t = c.layout.typography;
  if (!t || !(c.text || TEXT_TAGS.has(c.tagName))) return '';
  const first = (t.fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim();

  const extras: string[] = [];
  if (!['start', 'left'].includes(t.textAlign)) extras.push(value('Align', t.textAlign, `text-align: ${t.textAlign};`));
  if (t.textTransform !== 'none') extras.push(value('Case', t.textTransform, `text-transform: ${t.textTransform};`));
  if (t.textDecoration !== 'none') extras.push(value('Decoration', t.textDecoration, `text-decoration: ${t.textDecoration};`));
  if (t.truncation !== 'none') extras.push(value('Truncation', t.truncation));

  const body = `
    <button class="pp-fam" data-pp-act="copy" data-pp-copy="font-family: ${esc(t.fontFamily)};" title="Copy font-family">
      <span class="pp-fam-sample" style="font-family:${esc(t.fontFamily)}">Aa</span>
      <span class="pp-fam-info"><b>${esc(first)}</b><span>${esc(t.fontFamily)}</span></span>
      <span class="pp-cv-i">⧉</span>
    </button>
    ${valueGrid(
      value('Size', t.fontSize, `font-size: ${t.fontSize};`),
      value('Line height', t.lineHeight, `line-height: ${t.lineHeight};`),
      value('Weight', t.fontWeight, `font-weight: ${t.fontWeight};`),
      t.letterSpacing !== 'normal' ? value('Spacing', t.letterSpacing, `letter-spacing: ${t.letterSpacing};`) : '',
      ...extras,
    )}`;
  return card(s, 'styles:typography', 'Typography', I.type, body);
}

function effectCard(s: ViewState, c: ElementCapture): string {
  const { stroke, cornerRadius: r, effects } = c.layout;
  const items: string[] = [];

  if (stroke) {
    const sides = (['top', 'right', 'bottom', 'left'] as const).filter((side) => parseFloat(stroke[side].width) > 0 && stroke[side].style !== 'none');
    const first = stroke[sides[0]];
    if (sides.length === 4 && sides.every((side) => stroke[side].width === first.width && stroke[side].color === first.color && stroke[side].style === first.style)) {
      const line = `${first.width} ${first.style} ${first.color}`;
      items.push(value('Stroke', line, `border: ${line};`, first.color));
    } else {
      for (const side of sides) {
        const line = `${stroke[side].width} ${stroke[side].style} ${stroke[side].color}`;
        items.push(value(`Stroke ${side}`, line, `border-${side}: ${line};`, stroke[side].color));
      }
    }
  }

  const corners = [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft];
  if (!corners.every(isZero)) {
    const text = corners.every((v) => v === corners[0]) ? corners[0] : corners.join(' ');
    items.push(value('Radius', text, `border-radius: ${text};`));
  }

  effects.shadows.forEach((sh, i) => {
    const line = `${sh.type === 'Inner' ? 'inset ' : ''}${sh.x} ${sh.y} ${sh.blur}${sh.spread !== '0px' ? ` ${sh.spread}` : ''} ${sh.color}`;
    items.push(value(`${sh.type === 'Inner' ? 'Inner shadow' : 'Shadow'}${effects.shadows.length > 1 ? ` ${i + 1}` : ''}`, line, `box-shadow: ${line};`, sh.color));
  });
  if (effects.opacity) {
    items.push(value('Opacity', effects.opacity, `opacity: ${effects.opacity};`));
  }
  if (!items.length) return '';
  return card(s, 'styles:effect', 'Effect', I.effect, valueGrid(...items));
}

function animationCard(s: ViewState, c: ElementCapture): string {
  const motion = c.layout.animation;
  if (!motion) return '';
  const items: string[] = [];
  for (const t of motion.transitions) {
    const line = `${t.property} ${t.duration} ${t.easing}${parseFloat(t.delay) ? ` ${t.delay}` : ''}`;
    items.push(value('Transition', line, `transition: ${line};`));
  }
  for (const a of motion.animations) {
    const line = `${a.name} ${a.duration} ${a.easing}${parseFloat(a.delay) ? ` ${a.delay}` : ''} ${a.iterations}`;
    items.push(value('Animation', line, `animation: ${line};`));
  }
  const frames = motion.keyframes
    .map((k) => {
      const text = `@keyframes ${k.name} {\n${k.steps.map((st) => `  ${st.offset} { ${st.css} }`).join('\n')}\n}`;
      return `<button class="pp-code-copy" data-pp-act="copy" data-pp-copy="${esc(text)}" title="Copy keyframes"><pre class="pp-code">${esc(text)}</pre></button>`;
    })
    .join('');
  return card(s, 'styles:animation', 'Animation', I.play, `${valueGrid(...items)}${frames}`);
}

function layoutCard(s: ViewState, c: ElementCapture): string {
  const { boxModel: b, display, position, autoLayout: auto } = c.layout;
  const items: string[] = [value('Size', `${Math.round(b.content.width)} × ${Math.round(b.content.height)}`, `width: ${Math.round(b.content.width)}px;\nheight: ${Math.round(b.content.height)}px;`)];

  const padding = edge(b.padding.top, b.padding.right, b.padding.bottom, b.padding.left);
  if (b.padding.top || b.padding.right || b.padding.bottom || b.padding.left) {
    items.push(value('Padding', padding, `padding: ${padding};`));
  }
  const margin = edge(b.margin.top, b.margin.right, b.margin.bottom, b.margin.left);
  if (b.margin.top || b.margin.right || b.margin.bottom || b.margin.left) {
    items.push(value('Margin', margin, `margin: ${margin};`));
  }
  if (display.includes('flex') || display.includes('grid')) {
    items.push(value('Display', display, `display: ${display};`));
  }
  if (position !== 'static') {
    items.push(value('Position', position, `position: ${position};`));
  }
  if (auto && !isZero(auto.gap)) items.push(value('Parent gap', auto.gap, `gap: ${auto.gap};`));

  const guides = `<button class="pp-btn" data-pp-act="guides" aria-pressed="${s.guidesOn}">${I.spacing} ${s.guidesOn ? 'Hide' : 'Show'} spacing on the page</button>`;
  return card(s, 'styles:layout', 'Layout', I.layout, `${valueGrid(...items)}${boxModel(c)}<div class="pp-btn-row" style="margin-top:8px">${guides}</div>`);
}

// ---------------------------------------------------------------------------------------------
// Styles tab: the whole page
// ---------------------------------------------------------------------------------------------

function pageColorsCard(s: ViewState, scan: PageScan): string {
  const squares = scan.colors.slice(0, 24).map((col) => square(col.hex, `${col.count} use${col.count === 1 ? '' : 's'}`)).join('');
  const failing = scan.pairs.filter((p) => !p.aa);
  const pairs = (s.failingOnly ? failing : scan.pairs).slice(0, 12);
  const tag = (pass: boolean, label: string): string => `<span class="pp-tag ${pass ? 'pp-tag-pass' : 'pp-tag-fail'}">${label} ${pass ? 'pass' : 'fail'}</span>`;
  const rows = pairs
    .map(
      (p) => `
      <div class="pp-pair">
        <span class="pp-pair-sample" style="background:${esc(p.bg)};color:${esc(p.fg)}">Aa</span>
        <div class="pp-pair-info"><div class="pp-pair-ratio">${ratioText(p.ratio)}${p.large ? ' <span class="pp-pair-hex">large</span>' : ''}</div>
          <div class="pp-pair-hex">${esc(p.fg)} on ${esc(p.bg)} · ${p.count}×</div></div>
        <div>${tag(p.aa, 'AA')} ${tag(p.aaa, 'AAA')}</div>
      </div>`,
    )
    .join('');
  const body = `
    ${scan.colors.length ? `<div class="pp-squares">${squares}</div>` : empty('No colours found')}
    ${scan.colors.length > 24 ? `<p class="pp-status">Showing the 24 most used of ${scan.colors.length}.</p>` : ''}
    <div class="pp-sub"><span>Contrast: ${failing.length} of ${scan.pairs.length} text styles fail AA</span>
      <button class="pp-chip" data-pp-act="failing" aria-pressed="${s.failingOnly}">Failing only</button></div>
    ${rows || empty(s.failingOnly ? 'Every text style passes AA.' : 'No text found')}`;
  return card(s, 'styles:colors', 'Colors', I.palette, body, { meta: String(scan.colors.length), actions: rescan.replace('class="pp-btn"', 'class="pp-btn pp-btn-sm"') });
}

function pageTypographyCard(s: ViewState, scan: PageScan): string {
  const families = scan.fonts
    .map((f) => {
      const sizes = f.sizes.length > 1 ? `${f.sizes[0]}–${f.sizes[f.sizes.length - 1]}px` : `${f.sizes[0]}px`;
      const source = fontOrigin(f.family, f.source);
      return `
        <div class="pp-fam pp-fam-static">
          <button class="pp-fam-sample" data-pp-act="copy" data-pp-copy="font-family: ${esc(JSON.stringify(f.family))};" title="Copy font-family" style="font-family:${esc(JSON.stringify(f.family))}, sans-serif">Aa</button>
          <span class="pp-fam-info"><b>${esc(f.family)}</b><span>${f.weights.join(', ')} · ${sizes} · ${f.count}×${source}</span></span>
        </div>`;
    })
    .join('');
  const scale = scan.textStyles
    .slice()
    .sort((a, b) => b.size - a.size || b.weight - a.weight)
    .slice(0, 10)
    .map((t) => {
      const css = `font: ${t.weight} ${t.size}px/${t.lineHeight} ${t.family.includes(' ') ? `"${t.family}"` : t.family};`;
      return value(`${t.size}px`, `${t.weight} · ${t.lineHeight}`, css);
    });
  return card(s, 'styles:typography', 'Typography', I.type, `${families || empty('No text found')}${scale.length ? `<div class="pp-sub"><span>Type scale</span></div>${valueGrid(...scale)}` : ''}`, { meta: `${scan.fonts.length} families` });
}

function pageEffectCard(s: ViewState, scan: PageScan): string {
  const list = (label: string, rows: { value: string; count: number }[], prop: string): string[] =>
    rows.slice(0, 4).map((r) => value(`${label} · ${r.count}×`, r.value, `${prop}: ${r.value};`));
  const items = [...list('Shadow', scan.shadows, 'box-shadow'), ...list('Radius', scan.radii, 'border-radius'), ...list('Gradient', scan.gradients, 'background-image')];
  if (!items.length) return '';
  return card(s, 'styles:effect', 'Effect', I.effect, valueGrid(...items), { closed: true });
}

function pageSpacingCard(s: ViewState, scan: PageScan): string {
  if (!scan.spacing.length) return '';
  return card(s, 'styles:layout', 'Spacing in use', I.spacing, valueGrid(...scan.spacing.slice(0, 10).map((v) => value(`${v.count}×`, v.value, v.value))), { closed: true });
}

export function stylesTab(s: ViewState): string {
  if (s.capture) {
    return [colorsCard(s, s.capture), typographyCard(s, s.capture), effectCard(s, s.capture), animationCard(s, s.capture), layoutCard(s, s.capture)].join('');
  }
  if (s.scanError) return warn(s.scanError);
  if (s.scanning || !s.scan) return empty('Reading the page…');
  return `${note('The whole page. Click any element to inspect just that one.')}${pageColorsCard(s, s.scan)}${pageTypographyCard(s, s.scan)}${pageEffectCard(s, s.scan)}${pageSpacingCard(s, s.scan)}`;
}

// ---------------------------------------------------------------------------------------------
// Figma tab
// ---------------------------------------------------------------------------------------------

export function figmaTab(s: ViewState): string {
  const f = s.figma;
  const warnings = f?.warnings.length ? `<ul class="pp-list">${f.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
  const copy = `
    <p class="pp-status" style="margin:0 0 10px">Editable Figma layers: boxes with fills, strokes, radii and shadows, real text, images and icons. Then click the Figma canvas and press Ctrl+V (⌘V on Mac).</p>
    ${s.capture ? `<button class="pp-btn pp-btn-primary pp-btn-wide" data-pp-act="figma-element" ${s.busy ? 'disabled' : ''}>${I.figma} Copy <b>${esc(s.capture.selector)}</b> for Figma</button>
      <div class="pp-sub"><span>Or the page</span></div>` : ''}
    <div class="pp-btn-row">
      <button class="pp-btn ${s.capture ? '' : 'pp-btn-primary'}" data-pp-act="figma-run" data-pp-value="viewport" ${s.busy ? 'disabled' : ''}>Copy visible area</button>
      <button class="pp-btn" data-pp-act="figma-run" data-pp-value="page" ${s.busy ? 'disabled' : ''}>Copy whole page</button>
    </div>
    ${status(s.figmaStatus)}${f ? `<p class="pp-status">${f.layers} layer${f.layers === 1 ? '' : 's'} · ${Math.round(f.width)} × ${Math.round(f.height)}px</p>` : ''}
    ${warnings}
    ${f ? '<div class="pp-btn-row" style="margin-top:10px"><button class="pp-btn" data-pp-act="figma-copy-pending">Copy layers again</button></div>' : ''}`;
  const expect = `<ul class="pp-list" style="margin:0">
      <li>Layers match how the browser laid the page out. They are not auto layout.</li>
      <li>Text uses the page's fonts; Figma shows a missing-font notice for fonts you do not have.</li>
      <li>Rotated or scaled elements, inner shadows and conic gradients are simplified.</li>
      <li>Pages are capped at 4,000 elements and 20,000px tall.</li></ul>`;
  return card(s, 'figma:copy', 'Copy for Figma', I.figma, copy) + card(s, 'figma:expect', 'What to expect', I.info, expect, { closed: true });
}

// ---------------------------------------------------------------------------------------------
// Assets tab
// ---------------------------------------------------------------------------------------------

const KINDS: { kind: AssetKind; title: string; icon: string }[] = [
  { kind: 'image', title: 'Images', icon: I.image },
  { kind: 'svg', title: 'SVG', icon: I.svg },
  { kind: 'icon', title: 'Icons', icon: I.star },
  { kind: 'video', title: 'Video', icon: I.video },
  { kind: 'lottie', title: 'Lottie', icon: I.wand },
];

export function assetsTab(s: ViewState): string {
  const tile = (a: Asset): string => {
    const preview = assetPreview(a);
    const thumb = preview ? `<img src="${esc(preview)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : a.kind;
    const size = [a.format, formatBytes(a.bytes), a.width && a.height ? `${a.width}×${a.height}` : ''].filter(Boolean).join(' · ');
    return `
      <div class="pp-asset" title="${esc(a.name)}">
        <div class="pp-asset-thumb">${thumb}</div>
        <button class="pp-asset-dl" data-pp-act="asset-dl" data-pp-value="${esc(a.id)}" title="Download ${esc(a.name)}" aria-label="Download ${esc(a.name)}">${I.download}</button>
        <div class="pp-asset-meta">${esc(a.name)}</div><div class="pp-asset-meta pp-asset-sub">${esc(size)}</div>
      </div>`;
  };

  const cards = KINDS.map(({ kind, title, icon }) => {
    const list = s.assets.filter((a) => a.kind === kind);
    if (!list.length) return '';
    const zip = `<button class="pp-btn pp-btn-sm" data-pp-act="assets-zip" data-pp-value="${kind}" ${s.busy ? 'disabled' : ''} title="Download these as a ZIP">${I.download} ZIP</button>`;
    return card(s, `assets:${kind}`, title, icon, `<div class="pp-assets">${list.map(tile).join('')}</div>`, { meta: String(list.length), actions: zip });
  }).join('');

  return `
    <div class="pp-btn-row" style="margin-bottom:10px">
      <button class="pp-btn pp-btn-primary" data-pp-act="assets-zip" data-pp-value="all" ${s.assets.length && !s.busy ? '' : 'disabled'}>${I.download} Download all (ZIP)</button>
      ${rescan}
    </div>
    ${s.capture ? `<p class="pp-note" style="margin:0 0 8px">Inside <b>${esc(s.capture.selector)}</b>. Clear the selection to see the whole page.</p>` : ''}
    ${status(s.assetStatus)}
    ${cards || empty(s.assetsLoading ? 'Reading the page…' : s.capture ? 'No images, icons or videos inside this element' : 'No assets found on this page')}`;
}

// ---------------------------------------------------------------------------------------------
// Design System tab: the site's own variables, colours, text styles, effects, spacing, components
// ---------------------------------------------------------------------------------------------

const TOKENS_SHOWN = 40;
const hexOf = (v: string): string => tokenColor(v) ?? '';

function tokenRow(t: DeclaredToken): string {
  const hex = t.kind === 'color' ? hexOf(t.resolved) : '';
  const darkHex = t.dark && t.kind === 'color' ? hexOf(t.dark) : '';
  const shown = t.alias ? `${t.alias}${hex ? ` · ${hex}` : ''}` : t.value;
  return `
    <button class="pp-tok" data-pp-act="copy" data-pp-copy="var(${esc(t.name)})" title="Copy var(${esc(t.name)})">
      ${t.kind === 'color' ? `<span class="pp-tok-sw" style="background:${esc(hex || t.resolved)}"></span>` : '<span class="pp-tok-sw pp-tok-none"></span>'}
      <span class="pp-tok-main"><b>${esc(t.name)}</b><span>${esc(shown)}</span></span>
      ${t.dark ? `<span class="pp-tok-dark" title="Dark mode: ${esc(t.dark)}">${darkHex ? `<span class="pp-tok-sw" style="background:${esc(darkHex)}"></span>` : ''}<em>dark</em></span>` : ''}
    </button>`;
}

function variablesCard(s: ViewState, ds: DesignSystem): string {
  const groups: [string, DeclaredToken[]][] = [
    ['Colors', ds.tokens.filter((t) => t.kind === 'color')],
    ['Spacing, size and radius', ds.tokens.filter((t) => t.kind === 'dimension')],
    ['Fonts', ds.tokens.filter((t) => t.kind === 'font')],
    ['Shadows', ds.tokens.filter((t) => t.kind === 'shadow')],
    ['Other', ds.tokens.filter((t) => t.kind === 'other')],
  ];
  const body = ds.tokens.length
    ? groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => {
          const open = s.cards[`system:vars:${title}`] === true;
          const rows = (open ? list : list.slice(0, TOKENS_SHOWN)).map(tokenRow).join('');
          const more = list.length > TOKENS_SHOWN
            ? `<button class="pp-btn pp-btn-sm" data-pp-act="card" data-pp-value="system:vars:${esc(title)}" aria-expanded="${open}">${open ? 'Show fewer' : `Show all ${list.length}`}</button>`
            : '';
          return `<div class="pp-sub"><span>${title} · ${list.length}</span></div><div class="pp-toks">${rows}</div>${more}`;
        })
        .join('')
    : `<p class="pp-note" style="margin:0">This site does not declare CSS variables, so it has no named tokens. The cards below show what the page actually uses.</p>`;
  return card(s, 'system:variables', 'Variables', I.tokens, body, {
    meta: ds.tokens.length ? `declared · ${ds.tokens.length}` : 'none declared',
    actions: rescan.replace('class="pp-btn"', 'class="pp-btn pp-btn-sm"'),
  });
}

function colorStylesCard(s: ViewState, ds: DesignSystem): string {
  const roles: [string, 'surface' | 'text' | 'border' | 'icon'][] = [
    ['Surface', 'surface'], ['Text', 'text'], ['Border', 'border'], ['Icon and fill', 'icon'],
  ];
  const body = roles
    .map(([title, key]) => {
      const list = ds.colors.filter((c) => c[key] > 0).sort((a, b) => b[key] - a[key]);
      if (!list.length) return '';
      const open = s.cards[`system:colors:${key}`] === true;
      const shown = open ? list : list.slice(0, 12);
      const squares = shown.map((c) => square(c.hex, `${c.tokens[0] ? `${c.tokens[0]} · ` : ''}${c[key]}×`)).join('');
      const more = list.length > 12
        ? `<button class="pp-btn pp-btn-sm" style="margin-top:8px" data-pp-act="card" data-pp-value="system:colors:${key}" aria-expanded="${open}">${open ? 'Show fewer' : `Show all ${list.length}`}</button>`
        : '';
      return `<div class="pp-sub"><span>${title} · ${list.length}</span></div><div class="pp-squares">${squares}</div>${more}`;
    })
    .join('');
  return card(s, 'system:colors', 'Colors', I.palette, body || empty('No colours found'), { meta: `${ds.colors.length} in use` });
}

function textStylesCard(s: ViewState, ds: DesignSystem): string {
  const fonts = ds.fonts
    .map((f) => {
      const source = fontOrigin(f.family, f.source);
      const family = JSON.stringify(f.family);
      return `
        <button class="pp-fam" data-pp-act="copy" data-pp-copy="font-family: ${esc(family)};" title="Copy font-family">
          <span class="pp-fam-sample" style="font-family:${esc(family)}, sans-serif">Aa</span>
          <span class="pp-fam-info"><b>${esc(f.family)}</b><span>${f.weights.join(', ')}${source}</span></span>
          <span class="pp-cv-i">⧉</span>
        </button>`;
    })
    .join('');
  const styles = ds.textStyles
    .map((t) => {
      const family = t.family.includes(' ') ? `"${t.family}"` : t.family;
      const css = `font: ${t.weight} ${t.size}/${t.lineHeight} ${family};${t.letterSpacing !== 'normal' ? `\nletter-spacing: ${t.letterSpacing};` : ''}`;
      return `
        <button class="pp-fam" data-pp-act="copy" data-pp-copy="${esc(css)}" title="Copy text style">
          <span class="pp-fam-sample" style="font-family:${esc(JSON.stringify(t.family))}, sans-serif;font-weight:${t.weight}">Aa</span>
          <span class="pp-fam-info"><b>${esc(t.name)}</b><span>${esc(t.size)} / ${esc(t.lineHeight)} · ${t.weight}${t.letterSpacing !== 'normal' ? ` · ${esc(t.letterSpacing)}` : ''} · ${t.count}×</span></span>
          <span class="pp-cv-i">⧉</span>
        </button>`;
    })
    .join('');
  const body = `${fonts ? `<div class="pp-sub" style="margin-top:0"><span>Fonts · ${ds.fonts.length}</span></div>${fonts}` : ''}${styles ? `<div class="pp-sub"><span>Text styles · ${ds.textStyles.length}</span></div>${styles}` : ''}`;
  return card(s, 'system:typography', 'Typography', I.type, body || empty('No text found'));
}

function effectsCard(s: ViewState, ds: DesignSystem): string {
  const shadows = ds.shadows
    .map((sh) => `
      <button class="pp-fx" data-pp-act="copy" data-pp-copy="box-shadow: ${esc(sh.value)};" title="Copy box-shadow">
        <span class="pp-fx-box" style="box-shadow:${esc(sh.value)}"></span>
        <span class="pp-fam-info"><b>${esc(sh.name)}</b><span>${esc(sh.value)} · ${sh.count}×</span></span>
      </button>`)
    .join('');
  const gradients = ds.gradients
    .map((g) => `
      <button class="pp-fx" data-pp-act="copy" data-pp-copy="background-image: ${esc(g.value)};" title="Copy gradient">
        <span class="pp-fx-box" style="background:${esc(g.value)}"></span>
        <span class="pp-fam-info"><b>${esc(g.name)}</b><span>${esc(g.value)} · ${g.count}×</span></span>
      </button>`)
    .join('');
  if (!shadows && !gradients) return '';
  return card(s, 'system:effects', 'Effects', I.effect, `${shadows ? `<div class="pp-sub" style="margin-top:0"><span>Shadows · ${ds.shadows.length}</span></div>${shadows}` : ''}${gradients ? `<div class="pp-sub"><span>Gradients · ${ds.gradients.length}</span></div>${gradients}` : ''}`);
}

function spacingCard(s: ViewState, ds: DesignSystem): string {
  if (!ds.spacing.length && !ds.radii.length) return '';
  const grid = (rows: DesignSystem['spacing'], prop: (v: string) => string): string =>
    valueGrid(...rows.map((r) => value(r.tokens[0] ?? `${r.count}×`, r.value, prop(r.value))));
  const body = `${ds.spacing.length ? `<div class="pp-sub" style="margin-top:0"><span>Spacing in use</span></div>${grid(ds.spacing, (v) => v)}` : ''}${ds.radii.length ? `<div class="pp-sub"><span>Corner radius in use</span></div>${grid(ds.radii, (v) => `border-radius: ${v};`)}` : ''}`;
  return card(s, 'system:spacing', 'Spacing and radius', I.spacing, body, { closed: true });
}

function componentsHtml(groups: ComponentGroup[] | null, loading: boolean): string {
  if (loading || !groups) return empty('Finding components…');
  if (!groups.length) return empty('No buttons, inputs, cards or badges found');
  return groups
    .map(
      (group) => `
      <div class="pp-sub"><span>${group.kind}s · ${group.variants.reduce((n, v) => n + v.count, 0)}</span></div>
      ${group.variants
        .map((v) => `
          <div class="pp-comp">
            <div class="pp-comp-preview"><span style="${esc(v.previewStyle)}">${esc(v.label)}</span></div>
            <div class="pp-comp-details">${v.details.map((d) => `<span><i>${esc(d.label)}</i>${d.label === 'Fill' || d.label === 'Text' ? `<span class="pp-swatch" style="background:${esc(d.value)}"></span>` : ''}${esc(d.value)}</span>`).join('')}</div>
            <div class="pp-comp-meta"><span>${v.count}× · ${esc(v.size)}</span>
              <button class="pp-card-copy" data-pp-act="copy" data-pp-copy="${esc(v.tailwind.join(' '))}" title="Copy Tailwind classes">⧉ Tailwind</button></div>
          </div>`)
        .join('')}`,
    )
    .join('');
}

export function systemTab(s: ViewState): string {
  if (s.scanError) return warn(s.scanError);
  const ds = s.system;
  if (s.scanning || !s.scan || !ds) return empty('Reading the page…');

  return (
    variablesCard(s, ds) +
    colorStylesCard(s, ds) +
    textStylesCard(s, ds) +
    effectsCard(s, ds) +
    spacingCard(s, ds) +
    card(s, 'system:components', 'Components', I.boxes, componentsHtml(s.components, s.componentsLoading)) +
    `<div class="pp-btn-row" style="margin-top:12px"><button class="pp-btn pp-btn-primary" data-pp-act="tab" data-pp-value="export">Export these as code →</button></div>`
  );
}

// ---------------------------------------------------------------------------------------------
// Export tab (the developer side)
// ---------------------------------------------------------------------------------------------

const EXPORT_ORDER: ExportFormat[] = ['css', 'tailwind', 'scss', 'dtcg', 'json', 'md'];

export function exportTab(s: ViewState): string {
  const parts: string[] = [];

  if (s.capture) {
    const c = s.capture;
    const chips = c.layout.tailwind.length
      ? `<div class="pp-sub"><span>Tailwind classes · click one to copy</span><button class="pp-card-copy" data-pp-act="copy" data-pp-copy="${esc(c.layout.tailwind.join(' '))}">⧉ all</button></div>
         <div class="pp-tw">${c.layout.tailwind.map((cls) => `<button class="pp-tw-chip" data-pp-act="copy" data-pp-copy="${esc(cls)}" title="Copy ${esc(cls)}">${esc(cls)}</button>`).join('')}</div>`
      : '';
    const css = c.layout.rawCss.join('\n');
    const body = `
      <div class="pp-btn-row" style="margin-bottom:8px">
        <button class="pp-btn" data-pp-act="copy" data-pp-copy="${esc(buildAiPrompt(c))}">Copy as AI prompt</button>
        <button class="pp-btn" data-pp-act="copy" data-pp-copy="${esc(css)}">Copy all as CSS</button>
      </div>
      ${chips}
      ${css ? `<div class="pp-sub"><span>CSS</span></div><button class="pp-code-copy" data-pp-act="copy" data-pp-copy="${esc(css)}" title="Copy CSS"><pre class="pp-code">${esc(css)}</pre></button>` : ''}`;
    parts.push(card(s, 'export:element', c.selector, I.code, body));
  }

  let system: string;
  if (s.scanError) system = warn(s.scanError);
  else if (s.scanning || !s.system) system = empty('Reading the page…');
  else {
    const file = buildExport(s.system, s.exportFormat);
    const formats = EXPORT_ORDER.map((f) => `<button class="pp-chip" data-pp-act="export-format" data-pp-value="${f}" aria-pressed="${s.exportFormat === f}">${EXPORT_LABELS[f]}</button>`).join('');
    system = `
      <div class="pp-chips">${formats}</div>
      <div class="pp-btn-row">
        <button class="pp-btn pp-btn-primary" data-pp-act="export-download">${I.download} Download ${esc(file.filename)}</button>
        <button class="pp-btn" data-pp-act="export-copy">Copy</button>
      </div>
      <pre class="pp-code">${esc(file.text)}</pre>`;
  }
  parts.push(card(s, 'export:system', 'Design system', I.tokens, system, { closed: !!s.capture, actions: rescan.replace('class="pp-btn"', 'class="pp-btn pp-btn-sm"') }));

  const result = s.clone;
  const warnings = result?.warnings.length ? `<ul class="pp-list">${result.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
  const label = s.busy ? 'Saving…' : result ? 'Download again' : 'Download as HTML';
  parts.push(
    card(
      s,
      'export:clone',
      'Whole page as HTML',
      I.file,
      `<p class="pp-status" style="margin:0 0 10px">One HTML file with its styles, fonts and images inside, so it opens offline. Scripts are removed: it is a static snapshot.</p>
       <button class="pp-btn pp-btn-primary" data-pp-act="clone-run" ${s.busy ? 'disabled' : ''}>${I.download} ${label}</button>
       ${s.cloneStatus ? `<p class="pp-status">${esc(s.cloneStatus)}</p>` : ''}
       ${result ? `<p class="pp-status pp-ok">Saved ${esc(result.filename)} (${result.sizeMb.toFixed(1)} MB).</p>${warnings}` : ''}`,
    ),
  );
  return parts.join('');
}

// ---------------------------------------------------------------------------------------------
// Saved, Account, Devices
// ---------------------------------------------------------------------------------------------

export function savedView(s: ViewState): string {
  const save = s.capture
    ? `<button class="pp-btn pp-btn-primary pp-btn-wide" data-pp-act="save-element">Save <b>${esc(s.capture.selector)}</b></button>`
    : '<p class="pp-note" style="margin:0 0 8px">Select an element to save it here.</p>';
  if (!s.saved.length) return `${save}${empty('Nothing saved yet.')}`;

  const rows = s.saved
    .map((item) => {
      let host = item.url;
      try {
        host = new URL(item.url).hostname.replace(/^www\./, '');
      } catch {
        /* keep the raw url */
      }
      const swatches = item.colors.map((c) => `<span class="pp-swatch" title="${esc(`${c.role} ${c.value}`)}" style="background:${esc(c.value)}"></span>`).join('');
      return `
        <div class="pp-saved">
          <div class="pp-saved-head"><b>${esc(item.selector)}</b><span>${item.width} × ${item.height}</span></div>
          <div class="pp-saved-meta">${esc(host)} · ${new Date(item.savedAt).toLocaleDateString()} ${swatches}</div>
          ${item.text ? `<div class="pp-saved-text">“${esc(item.text)}”</div>` : ''}
          <div class="pp-btn-row" style="margin-top:8px">
            <button class="pp-btn" data-pp-act="saved-tailwind" data-pp-value="${esc(item.id)}">Copy Tailwind</button>
            <button class="pp-btn" data-pp-act="saved-css" data-pp-value="${esc(item.id)}">Copy CSS</button>
            <button class="pp-btn" data-pp-act="saved-remove" data-pp-value="${esc(item.id)}">Remove</button>
          </div>
        </div>`;
    })
    .join('');
  return `${save}<div class="pp-sub"><span>${s.saved.length} saved</span><button class="pp-btn pp-btn-sm" data-pp-act="saved-clear">Clear all</button></div>${rows}`;
}

export function accountView(): string {
  return `
    <div class="pp-account">
      <div class="pp-account-avatar" aria-hidden="true">?</div>
      <b>You are not signed in</b>
      <p class="pp-status">PixelPeek works fully without an account. An account is planned for things that need a server, such as syncing your Saved library between computers and sharing it.</p>
      <button class="pp-btn" disabled title="Not available yet">Sign in with Google</button>
      <p class="pp-note">Nothing you inspect leaves your computer today.</p>
    </div>`;
}

const CATEGORY_ICONS: Record<DeviceCategory, string> = {
  responsive: I.responsive, phones: I.phone, tablets: I.tablet, desktop: I.desktop, watches: I.watch,
};

export function devicesView(s: ViewState): string {
  const q = s.deviceQuery.trim().toLowerCase();
  const row = (id: string): string => {
    const d = deviceById(id)!;
    return `<button class="pp-dev-row" data-pp-act="device-open" data-pp-value="${d.id}"><span>${esc(d.name)}</span><span class="pp-dev-size">${d.category === 'responsive' ? 'any size' : `${d.width} × ${d.height}`}</span></button>`;
  };

  let list: string;
  if (q) {
    const hits = DEVICES.filter((d) => d.name.toLowerCase().includes(q) || CATEGORY_LABELS[d.category].toLowerCase().includes(q));
    list = hits.length ? hits.map((d) => row(d.id)).join('') : empty('No devices match');
  } else {
    list = (Object.keys(CATEGORY_LABELS) as DeviceCategory[])
      .map((cat) => {
        const devices = DEVICES.filter((d) => d.category === cat);
        const open = s.deviceOpen === cat;
        return `
          <button class="pp-dev-cat" data-pp-act="device-cat" data-pp-value="${cat}" aria-expanded="${open}">
            <span class="pp-dev-cat-name">${CATEGORY_ICONS[cat]} ${CATEGORY_LABELS[cat].toUpperCase()}</span>
            <span class="pp-dev-cat-count">${devices.length} ${I.chevron}</span>
          </button>
          ${open ? `<div class="pp-dev-list">${devices.map((d) => row(d.id)).join('')}</div>` : ''}`;
      })
      .join('');
  }

  const quick = deviceById(QUICK_START)!;
  return `
    <div class="pp-dev-search"><input type="search" placeholder="Search devices…" value="${esc(s.deviceQuery)}" data-pp-device-search aria-label="Search devices"></div>
    <div class="pp-dev-groups">${list}</div>
    <p class="pp-note" style="text-align:center;margin:12px 0 8px">Click a device to see this page inside it.</p>
    <button class="pp-btn pp-btn-dark pp-btn-wide" data-pp-act="device-open" data-pp-value="${quick.id}">${I.phone} Quick Start ${esc(quick.name)}</button>
  `;
}
