import { HOST_ID } from '../shadow-root';
import { parseGradients } from '../capture/parse-gradient';
import { parseShadows } from '../capture/parse-shadow';
import { parseColor } from '../scan/color-math';
import { fetchBytes } from '../assets/download';

// "Copy as Figma Layers": the page (or one element) is drawn as SVG, which Figma turns into
// editable layers when pasted onto the canvas. Boxes become rectangles with their fills, strokes,
// radii and shadows; text becomes real text layers; images and inline SVG are embedded; the DOM
// nesting becomes layer groups named after the elements. It is a faithful picture of how the
// browser laid the page out, not an auto-layout rebuild: Figma has no way to infer that from SVG.

export type FigmaScope = 'element' | 'viewport' | 'page';

export interface FigmaResult {
  svg: string;
  // Rectangles, text runs, images and vectors written, i.e. the layers Figma will create.
  layers: number;
  width: number;
  height: number;
  warnings: string[];
}

const MAX_ELEMENTS = 4000;
const MAX_PAGE_HEIGHT = 20000;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_TOTAL_IMAGE_BYTES = 14_000_000;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'HEAD', 'TITLE', 'TEMPLATE', 'BR', 'WBR', 'SOURCE', 'TRACK']);
const CLIPPING = new Set(['hidden', 'auto', 'scroll', 'clip']);

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: string): number => parseFloat(v) || 0;
const r2 = (n: number): string => String(Math.round(n * 100) / 100);

let measureCtx: CanvasRenderingContext2D | null | undefined;
function ascentOf(font: string): { ascent: number; height: number } {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return { ascent: 0, height: 0 };
  measureCtx.font = font;
  const m = measureCtx.measureText('Mg');
  return { ascent: m.fontBoundingBoxAscent, height: m.fontBoundingBoxAscent + m.fontBoundingBoxDescent };
}

// "#RRGGBB" plus an opacity, from any CSS colour.
function paint(css: string): { fill: string; opacity: number } | null {
  const c = parseColor(css);
  if (!c || c.a === 0) return null;
  const h = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
  return { fill: `#${h(c.r)}${h(c.g)}${h(c.b)}`, opacity: c.a };
}

const fillAttrs = (css: string, attr = 'fill'): string => {
  const p = paint(css);
  if (!p) return `${attr}="none"`;
  return `${attr}="${p.fill}"${p.opacity < 1 ? ` ${attr}-opacity="${r2(p.opacity)}"` : ''}`;
};

function roundedPath(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number): string {
  const clamp = (r: number): number => Math.max(0, Math.min(r, w / 2, h / 2));
  [tl, tr, br, bl] = [clamp(tl), clamp(tr), clamp(br), clamp(bl)];
  return [
    `M${r2(x + tl)} ${r2(y)}`,
    `H${r2(x + w - tr)}`, tr ? `A${r2(tr)} ${r2(tr)} 0 0 1 ${r2(x + w)} ${r2(y + tr)}` : '',
    `V${r2(y + h - br)}`, br ? `A${r2(br)} ${r2(br)} 0 0 1 ${r2(x + w - br)} ${r2(y + h)}` : '',
    `H${r2(x + bl)}`, bl ? `A${r2(bl)} ${r2(bl)} 0 0 1 ${r2(x)} ${r2(y + h - bl)}` : '',
    `V${r2(y + tl)}`, tl ? `A${r2(tl)} ${r2(tl)} 0 0 1 ${r2(x + tl)} ${r2(y)}` : '',
    'Z',
  ].join('');
}

function radiusOf(value: string, size: number): number {
  return value.endsWith('%') ? (num(value) / 100) * size : num(value);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: [number, number, number, number];
}

// A shape for the box: a plain <rect> when the corners agree, a path when they differ.
function shape(b: Box, attrs: string, inset = 0): string {
  const x = b.x + inset;
  const y = b.y + inset;
  const w = Math.max(0, b.w - inset * 2);
  const h = Math.max(0, b.h - inset * 2);
  const r = b.r.map((v) => Math.max(0, v - inset)) as Box['r'];
  if (r.every((v) => v === r[0])) {
    return `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"${r[0] ? ` rx="${r2(Math.min(r[0], w / 2, h / 2))}"` : ''} ${attrs}/>`;
  }
  return `<path d="${roundedPath(x, y, w, h, r[0], r[1], r[2], r[3])}" ${attrs}/>`;
}

class Builder {
  defs: string[] = [];
  layers = 0;
  elements = 0;
  warnings = new Set<string>();
  private ids = 0;
  private images: { token: string; url: string }[] = [];
  private imageBytes = 0;
  skippedImages = 0;
  transformed = 0;

  constructor(private ox: number, private oy: number, private bounds: { w: number; h: number } | null) {}

  id(prefix: string): string {
    return `${prefix}${this.ids++}`;
  }

  // Images are fetched afterwards; until then the markup carries a token.
  imageToken(url: string): string {
    const token = `@@IMG${this.images.length}@@`;
    this.images.push({ token, url });
    return token;
  }

  async resolveImages(svg: string): Promise<string> {
    const cache = new Map<string, string | null>();
    const load = async (url: string): Promise<string | null> => {
      if (url.startsWith('data:')) return url;
      const blob = await fetchBytes(url);
      if (!blob || blob.size > MAX_IMAGE_BYTES || this.imageBytes + blob.size > MAX_TOTAL_IMAGE_BYTES) return null;
      this.imageBytes += blob.size;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    };
    await Promise.all(
      this.images.map(async ({ url }) => {
        if (!cache.has(url)) cache.set(url, await load(url));
      }),
    );
    let out = svg;
    for (const { token, url } of this.images) {
      const data = cache.get(url);
      if (!data) this.skippedImages++;
      out = out.replace(token, data ?? url);
    }
    return out;
  }

  // ---- drawing ----

  private shadowFilter(box: Box, shadows: ReturnType<typeof parseShadows>): string | null {
    const outer = shadows.filter((s) => s.type === 'Drop' && paint(s.color));
    if (shadows.some((s) => s.type === 'Inner')) this.warnings.add('Inner shadows are not copied.');
    if (!outer.length) return null;

    const id = this.id('shadow');
    let reach = 0;
    for (const s of outer) reach = Math.max(reach, Math.abs(num(s.x)) + Math.abs(num(s.y)) + num(s.blur) * 2 + Math.abs(num(s.spread)));
    let steps = '<feFlood flood-opacity="0" result="BackgroundImageFix"/>';
    let previous = 'BackgroundImageFix';
    outer.forEach((s, i) => {
      const p = paint(s.color)!;
      const rgb = [1, 3, 5].map((k) => (parseInt(p.fill.slice(k, k + 2), 16) / 255).toFixed(3));
      steps +=
        `<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>` +
        `<feOffset dx="${r2(num(s.x))}" dy="${r2(num(s.y))}"/>` +
        `<feGaussianBlur stdDeviation="${r2(num(s.blur) / 2)}"/>` +
        `<feComposite in2="hardAlpha" operator="out"/>` +
        `<feColorMatrix type="matrix" values="0 0 0 0 ${rgb[0]} 0 0 0 0 ${rgb[1]} 0 0 0 0 ${rgb[2]} 0 0 0 ${r2(p.opacity)} 0"/>` +
        `<feBlend mode="normal" in2="${previous}" result="effect${i + 1}"/>`;
      previous = `effect${i + 1}`;
    });
    steps += `<feBlend mode="normal" in="SourceGraphic" in2="${previous}" result="shape"/>`;
    this.defs.push(
      `<filter id="${id}" x="${r2(box.x - reach)}" y="${r2(box.y - reach)}" width="${r2(box.w + reach * 2)}" height="${r2(box.h + reach * 2)}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${steps}</filter>`,
    );
    return id;
  }

  private gradientFill(layer: ReturnType<typeof parseGradients>[number], box: Box): string | null {
    if (layer.type === 'Other' || layer.stops.length < 2) return null;
    const id = this.id('grad');
    const count = layer.stops.length;
    let len = 1;
    let attrs: string;
    if (layer.type === 'Linear') {
      const deg = num(layer.angle ?? '180');
      const rad = (deg * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      len = Math.abs(box.w * dx) + Math.abs(box.h * dy) || 1;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      attrs = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r2(cx - (dx * len) / 2)}" y1="${r2(cy - (dy * len) / 2)}" x2="${r2(cx + (dx * len) / 2)}" y2="${r2(cy + (dy * len) / 2)}">`;
    } else {
      len = Math.max(box.w, box.h) || 1;
      attrs = `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r2(box.x + box.w / 2)}" cy="${r2(box.y + box.h / 2)}" r="${r2(len / 2)}">`;
    }
    const stops = layer.stops
      .map((stop, i) => {
        const p = paint(stop.color);
        let offset = count === 1 ? 0 : i / (count - 1);
        if (stop.position) {
          offset = stop.position.endsWith('%') ? num(stop.position) / 100 : num(stop.position) / (layer.type === 'Linear' ? len : len / 2);
        }
        return `<stop offset="${r2(Math.max(0, Math.min(1, offset)))}" stop-color="${p?.fill ?? '#000000'}"${p && p.opacity < 1 ? ` stop-opacity="${r2(p.opacity)}"` : ''}/>`;
      })
      .join('');
    this.defs.push(`${attrs}${stops}</${layer.type === 'Linear' ? 'linearGradient' : 'radialGradient'}>`);
    return id;
  }

  private clip(box: Box): string {
    const id = this.id('clip');
    this.defs.push(`<clipPath id="${id}">${shape(box, '')}</clipPath>`);
    return id;
  }

  private image(url: string, box: Box, fit: string, name: string): string {
    this.layers++;
    const aspect = fit === 'cover' ? 'xMidYMid slice' : fit === 'fill' || fit === 'stretch' ? 'none' : 'xMidYMid meet';
    const clip = box.r.some(Boolean) || fit === 'cover' ? ` clip-path="url(#${this.clip(box)})"` : '';
    return `<image id="${esc(name)}" x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.w)}" height="${r2(box.h)}" preserveAspectRatio="${aspect}" href="${this.imageToken(url)}"${clip}/>`;
  }

  private placeholder(box: Box, name: string, note: string): string {
    this.warnings.add(note);
    this.layers++;
    return shape(box, `id="${esc(name)}" fill="#E5E7EB"`);
  }

  private text(el: Element, style: CSSStyleDeclaration): string {
    const out: string[] = [];
    const size = num(style.fontSize);
    const weight = style.fontWeight;
    const family = style.fontFamily;
    const { ascent } = ascentOf(`${style.fontStyle === 'italic' ? 'italic ' : ''}${weight} ${size}px ${family}`);
    const attrs =
      `font-family="${esc(family.replace(/"/g, "'"))}" font-size="${r2(size)}" font-weight="${weight}"` +
      `${style.fontStyle === 'italic' ? ' font-style="italic"' : ''}` +
      `${style.letterSpacing !== 'normal' ? ` letter-spacing="${r2(num(style.letterSpacing))}"` : ''}` +
      `${style.textDecorationLine !== 'none' ? ` text-decoration="${esc(style.textDecorationLine)}"` : ''} ${fillAttrs(style.color)}`;

    const transform = (s: string): string =>
      style.textTransform === 'uppercase' ? s.toUpperCase() : style.textTransform === 'lowercase' ? s.toLowerCase()
      : style.textTransform === 'capitalize' ? s.replace(/\b(\w)/g, (m) => m.toUpperCase()) : s;

    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      const text = node.textContent;
      // Browsers wrap text into lines; the words' rectangles tell which words ended up on which line.
      const lines: { top: number; left: number; words: string[] }[] = [];
      const range = document.createRange();
      for (const match of text.matchAll(/\S+/g)) {
        const start = match.index ?? 0;
        range.setStart(node, start);
        range.setEnd(node, start + match[0].length);
        const r = range.getClientRects()[0];
        if (!r || (!r.width && !r.height)) continue;
        const last = lines[lines.length - 1];
        if (last && Math.abs(last.top - r.top) < Math.max(3, size * 0.4)) last.words.push(match[0]);
        else lines.push({ top: r.top, left: r.left, words: [match[0]] });
      }
      for (const line of lines) {
        const content = transform(line.words.join(' '));
        this.layers++;
        out.push(`<text id="${esc(content.slice(0, 40))}" x="${r2(line.left - this.ox)}" y="${r2(line.top - this.oy + ascent)}" ${attrs} xml:space="preserve">${esc(content)}</text>`);
      }
    }
    return out.join('');
  }

  private inlineSvg(svg: SVGElement, box: Box, color: string, name: string): string {
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', r2(box.w));
    clone.setAttribute('height', r2(box.h));
    // An svg that scales with its viewBox keeps doing so; one without gets the box it occupies.
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${r2(box.w)} ${r2(box.h)}`);
    clone.removeAttribute('class');
    clone.removeAttribute('style');
    // `<use href="#symbol">` points at the page; carry the referenced shapes along.
    const wanted = new Set<string>();
    for (const use of Array.from(clone.querySelectorAll('use'))) {
      const ref = use.getAttribute('href') ?? use.getAttribute('xlink:href');
      if (ref?.startsWith('#')) wanted.add(ref.slice(1));
    }
    if (wanted.size) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      for (const id of wanted) {
        const target = document.getElementById(id);
        if (target) defs.appendChild(target.cloneNode(true));
      }
      clone.insertBefore(defs, clone.firstChild);
    }
    const markup = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, color);
    this.layers++;
    return `<g id="${esc(name)}" transform="translate(${r2(box.x)} ${r2(box.y)})">${markup}</g>`;
  }

  // ---- the walk ----

  draw(el: Element): string {
    if (SKIP_TAGS.has(el.tagName) || el.id === HOST_ID || this.elements >= MAX_ELEMENTS) {
      if (this.elements >= MAX_ELEMENTS) this.warnings.add(`Only the first ${MAX_ELEMENTS} elements were copied.`);
      return '';
    }
    this.elements++;

    const style = getComputedStyle(el);
    if (style.display === 'none' || (style.visibility === 'hidden' && !el.children.length)) return '';
    const opacity = parseFloat(style.opacity);
    if (opacity === 0) return '';

    const rect = el.getBoundingClientRect();
    const box: Box = {
      x: rect.left - this.ox,
      y: rect.top - this.oy,
      w: rect.width,
      h: rect.height,
      r: [
        radiusOf(style.borderTopLeftRadius, rect.width),
        radiusOf(style.borderTopRightRadius, rect.width),
        radiusOf(style.borderBottomRightRadius, rect.width),
        radiusOf(style.borderBottomLeftRadius, rect.width),
      ],
    };
    if (style.transform !== 'none') this.transformed++;

    // Outside the viewport (viewport scope): nothing of this box is visible, but descendants may be.
    const visible = !this.bounds || (box.x < this.bounds.w && box.y < this.bounds.h && box.x + box.w > 0 && box.y + box.h > 0);
    const name = layerName(el);
    const parts: string[] = [];

    if (visible && box.w > 0 && box.h > 0 && style.visibility !== 'hidden') {
      const fillable = paint(style.backgroundColor);
      const shadows = parseShadows(style.boxShadow);
      const filterId = fillable ? this.shadowFilter(box, shadows) : null;
      if (!fillable && shadows.length && shadows.some((s) => s.type === 'Drop')) this.warnings.add('Shadows on transparent boxes are not copied.');

      if (fillable) {
        this.layers++;
        parts.push(shape(box, `id="Background" ${fillAttrs(style.backgroundColor)}${filterId ? ` filter="url(#${filterId})"` : ''}`));
      }

      for (const layer of parseGradients(style.backgroundImage)) {
        const id = this.gradientFill(layer, box);
        if (id) {
          this.layers++;
          parts.push(shape(box, `id="Gradient" fill="url(#${id})"`));
        } else if (layer.type === 'Other') this.warnings.add('Conic and repeating gradients are not copied.');
      }
      for (const match of style.backgroundImage.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        try {
          const url = new URL(match[1], document.baseURI).href;
          const size = style.backgroundSize;
          parts.push(this.image(url, box, size.includes('cover') ? 'cover' : size.includes('100% 100%') ? 'fill' : 'contain', 'Background image'));
        } catch {
          /* an unparseable url is skipped */
        }
      }

      parts.push(...this.borders(style, box));

      if (el instanceof HTMLImageElement) {
        const url = el.currentSrc || el.src;
        if (url) {
          const inner: Box = { ...box, x: box.x + num(style.borderLeftWidth) + num(style.paddingLeft), y: box.y + num(style.borderTopWidth) + num(style.paddingTop), w: box.w - num(style.borderLeftWidth) - num(style.borderRightWidth) - num(style.paddingLeft) - num(style.paddingRight), h: box.h - num(style.borderTopWidth) - num(style.borderBottomWidth) - num(style.paddingTop) - num(style.paddingBottom) };
          parts.push(this.image(new URL(url, document.baseURI).href, inner, style.objectFit === 'cover' ? 'cover' : style.objectFit === 'fill' ? 'fill' : 'contain', name));
        }
      } else if (el instanceof SVGSVGElement) {
        parts.push(this.inlineSvg(el, box, style.color, name));
      } else if (el instanceof HTMLCanvasElement) {
        try {
          parts.push(this.image(el.toDataURL(), box, 'fill', name));
        } catch {
          parts.push(this.placeholder(box, name, 'Canvas elements that block reading were drawn as grey boxes.'));
        }
      } else if (el instanceof HTMLVideoElement) {
        parts.push(el.poster ? this.image(new URL(el.poster, document.baseURI).href, box, 'cover', name) : this.placeholder(box, name, 'Videos without a poster image were drawn as grey boxes.'));
      } else if (el instanceof HTMLIFrameElement) {
        parts.push(this.placeholder(box, name, 'Embedded frames (iframes) were drawn as grey boxes.'));
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        parts.push(this.formControlText(el, style, box));
      } else {
        parts.push(this.text(el, style));
      }
    }

    // Children, stacked the way the browser stacks them.
    const children = el instanceof SVGSVGElement ? [] : Array.from(el.children);
    const z = (c: Element): number => {
      const s = getComputedStyle(c);
      return s.position === 'static' ? 0 : parseInt(s.zIndex, 10) || 0;
    };
    const ordered = children.map((c, i) => ({ c, i, z: z(c) })).sort((a, b) => a.z - b.z || a.i - b.i);
    const childMarkup = ordered.map(({ c }) => this.draw(c)).join('');

    const drawn = parts.filter(Boolean);
    // A lone shape or text run is its own layer; wrapping it in a same-named group adds nothing.
    if (drawn.length === 1 && !childMarkup && opacity === 1) return drawn[0];

    let inner = drawn.join('');
    if (childMarkup) {
      if (CLIPPING.has(style.overflowX) || CLIPPING.has(style.overflowY)) {
        inner += `<g clip-path="url(#${this.clip(box)})">${childMarkup}</g>`;
      } else inner += childMarkup;
    }
    if (!inner) return '';

    return `<g id="${esc(name)}"${opacity < 1 ? ` opacity="${r2(opacity)}"` : ''}>${inner}</g>`;
  }

  private borders(style: CSSStyleDeclaration, box: Box): string[] {
    const sides = (['top', 'right', 'bottom', 'left'] as const).map((side) => ({
      side,
      w: style.getPropertyValue(`border-${side}-style`) === 'none' ? 0 : num(style.getPropertyValue(`border-${side}-width`)),
      color: style.getPropertyValue(`border-${side}-color`),
      dash: style.getPropertyValue(`border-${side}-style`),
    }));
    const active = sides.filter((s) => s.w > 0 && paint(s.color));
    if (!active.length) return [];

    const uniform = active.length === 4 && active.every((s) => s.w === active[0].w && s.color === active[0].color);
    if (uniform) {
      const w = active[0].w;
      const dash = active[0].dash === 'dashed' ? ` stroke-dasharray="${r2(w * 3)} ${r2(w * 3)}"` : active[0].dash === 'dotted' ? ` stroke-dasharray="${r2(w)} ${r2(w)}"` : '';
      this.layers++;
      // SVG strokes sit on the edge; CSS borders sit inside it.
      return [shape(box, `id="Border" fill="none" ${fillAttrs(active[0].color, 'stroke')} stroke-width="${r2(w)}"${dash}`, w / 2)];
    }
    return active.map((s) => {
      this.layers++;
      const [x, y, w, h] =
        s.side === 'top' ? [box.x, box.y, box.w, s.w]
        : s.side === 'bottom' ? [box.x, box.y + box.h - s.w, box.w, s.w]
        : s.side === 'left' ? [box.x, box.y, s.w, box.h]
        : [box.x + box.w - s.w, box.y, s.w, box.h];
      return `<rect id="Border ${s.side}" x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" ${fillAttrs(s.color)}/>`;
    });
  }

  private formControlText(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, style: CSSStyleDeclaration, box: Box): string {
    let content = '';
    let color = style.color;
    if (el instanceof HTMLSelectElement) content = el.selectedOptions[0]?.textContent?.trim() ?? '';
    else if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'range', 'file', 'color', 'hidden'].includes(el.type)) return '';
    else {
      content = el.value;
      if (!content && el.placeholder) {
        content = el.placeholder;
        color = 'rgba(0,0,0,0.4)';
      }
    }
    if (!content) return '';
    const size = num(style.fontSize);
    const { ascent, height } = ascentOf(`${style.fontWeight} ${size}px ${style.fontFamily}`);
    this.layers++;
    const y = box.y + box.h / 2 - height / 2 + ascent;
    return `<text id="${esc(content.slice(0, 40))}" x="${r2(box.x + num(style.borderLeftWidth) + num(style.paddingLeft))}" y="${r2(y)}" font-family="${esc(style.fontFamily.replace(/"/g, "'"))}" font-size="${r2(size)}" font-weight="${style.fontWeight}" ${fillAttrs(color)} xml:space="preserve">${esc(content)}</text>`;
  }
}

// What the layer panel in Figma will show.
function layerName(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const cls = Array.from(el.classList).find((c) => /^[a-z][\w-]{2,}$/i.test(c));
  return cls ? `${tag}.${cls}` : tag;
}

export async function buildFigmaSvg(root: Element, scope: FigmaScope): Promise<FigmaResult> {
  let ox = 0;
  let oy = 0;
  let width: number;
  let height: number;
  let bounds: { w: number; h: number } | null = null;
  let frameName: string;
  let background = '';

  if (scope === 'element') {
    const r = root.getBoundingClientRect();
    ox = r.left;
    oy = r.top;
    width = r.width;
    height = r.height;
    frameName = layerName(root);
  } else {
    root = document.body;
    const de = document.documentElement;
    if (scope === 'page') {
      // Page coordinates: viewport position plus how far the page is scrolled.
      ox = -window.scrollX;
      oy = -window.scrollY;
      width = Math.max(de.scrollWidth, window.innerWidth);
      height = Math.min(Math.max(de.scrollHeight, window.innerHeight), MAX_PAGE_HEIGHT);
    } else {
      width = window.innerWidth;
      height = window.innerHeight;
      bounds = { w: width, h: height };
    }
    frameName = document.title.slice(0, 60) || location.hostname;
    const canvasColor = [getComputedStyle(de).backgroundColor, getComputedStyle(document.body).backgroundColor].find((c) => paint(c)) ?? '#ffffff';
    background = `<rect id="Page background" width="${r2(width)}" height="${r2(height)}" ${fillAttrs(canvasColor)}/>`;
  }

  const builder = new Builder(ox, oy, bounds);
  if (background) builder.layers++;
  const body = builder.draw(root);
  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(width)}" height="${r2(height)}" viewBox="0 0 ${r2(width)} ${r2(height)}" fill="none">` +
    `${scope === 'element' ? body : `<g id="${esc(frameName)}">${background}${body}</g>`}` +
    `${builder.defs.length ? `<defs>${builder.defs.join('')}</defs>` : ''}</svg>`;
  svg = await builder.resolveImages(svg);

  const warnings = Array.from(builder.warnings);
  if (builder.skippedImages) warnings.push(`${builder.skippedImages} image${builder.skippedImages === 1 ? ' was' : 's were'} too large or blocked by the site, so Figma will show them empty.`);
  if (builder.transformed) warnings.push(`${builder.transformed} rotated or scaled element${builder.transformed === 1 ? ' was' : 's were'} drawn upright at ${builder.transformed === 1 ? 'its' : 'their'} final size and position.`);
  if (scope === 'page' && document.documentElement.scrollHeight > MAX_PAGE_HEIGHT) warnings.push(`The page is taller than ${MAX_PAGE_HEIGHT}px, so the bottom was cut off.`);
  return { svg, layers: builder.layers, width, height, warnings };
}
