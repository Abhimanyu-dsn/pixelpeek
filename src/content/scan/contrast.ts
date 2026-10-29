import { composite, contrastRatio, parseColor, rgbaToHex } from './color-math';
import type { RGBA } from './color-math';

export interface ContrastInfo {
  ratio: number;
  fg: string;
  bg: string;
  large: boolean;
  aa: boolean;
  aaa: boolean;
  // A photo or other image sits behind the text, so no honest ratio exists.
  onImage: boolean;
  // The text sits on a gradient: the ratio is the worst one across its colours.
  gradient: boolean;
}

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };

interface Background {
  color: RGBA;
  onImage: boolean;
  // The colours of a gradient behind the text, when there is one.
  stops?: RGBA[];
}

const COLOR_IN_GRADIENT = /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}\b)/g;

function gradientStops(image: string, base: RGBA): RGBA[] {
  if (!image.includes('gradient(')) return [];
  const out: RGBA[] = [];
  for (const m of image.matchAll(COLOR_IN_GRADIENT)) {
    const c = parseColor(m[1]);
    if (c && c.a > 0) out.push(c.a < 1 ? composite(c, base) : c);
  }
  return out;
}

export type BackgroundCache = WeakMap<Element, Background>;

// The colour actually seen behind an element: every ancestor's translucent background painted
// over the next, down to the first opaque one (or white, the browser's canvas).
export function resolveBackground(el: Element, cache: BackgroundCache = new WeakMap()): Background {
  const cached = cache.get(el);
  if (cached) return cached;

  const style = getComputedStyle(el);
  const own = parseColor(style.backgroundColor);
  const hasImage = style.backgroundImage !== 'none';
  const parent = el.parentElement;

  const isPhoto = hasImage && style.backgroundImage.includes('url(');

  let result: Background;
  if (own && own.a >= 1) {
    const stops = hasImage && !isPhoto ? gradientStops(style.backgroundImage, own) : [];
    result = stops.length ? { color: stops[0], stops, onImage: false } : { color: own, onImage: isPhoto };
  } else {
    const below = parent ? resolveBackground(parent, cache) : { color: WHITE, onImage: false };
    const base = own && own.a > 0 ? composite(own, below.color) : below.color;
    const stops = hasImage && !isPhoto ? gradientStops(style.backgroundImage, base) : [];
    result = stops.length
      ? { color: stops[0], stops, onImage: below.onImage }
      : { color: base, onImage: isPhoto || below.onImage, stops: below.stops };
  }
  cache.set(el, result);
  return result;
}

export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

export function measureContrast(fg: RGBA, bg: Background, fontSizePx: number, fontWeight: number): ContrastInfo {
  // Translucent text is blended with what is behind it first, like the browser does.
  const candidates = bg.stops && bg.stops.length ? bg.stops : [bg.color];
  let worst = candidates[0];
  let ratio = Infinity;
  let text = fg;
  for (const c of candidates) {
    const t = fg.a < 1 ? composite(fg, c) : fg;
    const r = contrastRatio(t, c);
    if (r < ratio) {
      ratio = r;
      worst = c;
      text = t;
    }
  }
  const large = isLargeText(fontSizePx, fontWeight);
  return {
    ratio,
    gradient: candidates.length > 1,
    fg: rgbaToHex({ ...text, a: 1 }),
    bg: rgbaToHex({ ...worst, a: 1 }),
    large,
    aa: ratio >= (large ? 3 : 4.5),
    aaa: ratio >= (large ? 4.5 : 7),
    onImage: bg.onImage,
  };
}

const FORM_TAGS = new Set(['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);

export function hasOwnText(el: Element): boolean {
  if (FORM_TAGS.has(el.tagName)) return true;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  }
  return false;
}

export function readContrast(el: Element, style: CSSStyleDeclaration, cache?: BackgroundCache): ContrastInfo | undefined {
  if (!hasOwnText(el)) return undefined;
  const fg = parseColor(style.color);
  if (!fg || fg.a === 0) return undefined;
  return measureContrast(fg, resolveBackground(el, cache), parseFloat(style.fontSize) || 16, parseInt(style.fontWeight, 10) || 400);
}
