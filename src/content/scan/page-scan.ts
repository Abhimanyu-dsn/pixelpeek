import { HOST_ID } from '../shadow-root';
import { getReadableSheets, prefetchStylesheets } from '../variants/sheets';
import { measureContrast, resolveBackground, hasOwnText } from './contrast';
import type { BackgroundCache } from './contrast';
import { parseColor, rgbaToHex } from './color-math';
import { readTokens } from './tokens';
import type { DeclaredToken } from './tokens';

export interface ColorStat {
  hex: string;
  count: number;
  text: number;
  background: number;
  border: number;
  // SVG fills and strokes: icons and illustrations.
  icon: number;
}

export interface ContrastPair {
  fg: string;
  bg: string;
  ratio: number;
  count: number;
  large: boolean;
  aa: boolean;
  aaa: boolean;
}

export interface FontStat {
  family: string;
  count: number;
  weights: number[];
  sizes: number[];
  // Where the font file or stylesheet comes from; null for system fonts.
  source: string | null;
  headings: number;
}

export interface TextStyleStat {
  size: number;
  lineHeight: string;
  weight: number;
  family: string;
  letterSpacing: string;
  count: number;
  // How often each element type carries this style, e.g. { H1: 3, P: 1 }.
  tags: Record<string, number>;
}

export interface ValueStat {
  value: string;
  count: number;
}

export interface PageScan {
  url: string;
  title: string;
  elementCount: number;
  // True when the page had more elements than the scan reads.
  truncated: boolean;
  colors: ColorStat[];
  pairs: ContrastPair[];
  fonts: FontStat[];
  textStyles: TextStyleStat[];
  radii: ValueStat[];
  shadows: ValueStat[];
  gradients: ValueStat[];
  spacing: ValueStat[];
  // The custom properties the site itself declares (its own design tokens).
  tokens: DeclaredToken[];
  unreadableSheets: number;
}

const MAX_ELEMENTS = 8000;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'HEAD', 'TITLE', 'BR', 'WBR', 'TEMPLATE']);
const SVG_SHAPES = new Set(['path', 'circle', 'rect', 'ellipse', 'polygon', 'polyline', 'line', 'g']);

function bump<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function toStats(map: Map<string, number>): ValueStat[] {
  return Array.from(map, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

export function firstFamily(fontFamily: string): string {
  const first = fontFamily.split(',')[0] ?? '';
  return first.trim().replace(/^["']|["']$/g, '');
}

interface FontSources {
  // family (lower-cased) -> first font file URL declared for it.
  faces: Map<string, string>;
  // family (lower-cased) -> stylesheet URL that requests it (Google Fonts style links).
  links: Map<string, string>;
}

function readFontSources(): FontSources {
  const faces = new Map<string, string>();
  const links = new Map<string, string>();

  for (const sheet of getReadableSheets(document).sheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, '').toLowerCase();
      const src = rule.style.getPropertyValue('src');
      const url = src.match(/url\(\s*["']?([^"')]+)["']?\s*\)/)?.[1];
      if (!family || !url || faces.has(family)) continue;
      try {
        faces.set(family, new URL(url, sheet.href ?? document.baseURI).href);
      } catch {
        faces.set(family, url);
      }
    }
  }

  for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[href*="fonts.googleapis.com"], link[href*="fonts.bunny.net"], link[href*="use.typekit.net"]'))) {
    // css?family=Inter:400,700|Roboto  and  css2?family=Inter:wght@400;700&family=Roboto
    for (const part of link.href.matchAll(/[?&]family=([^&]+)/g)) {
      const name = decodeURIComponent(part[1]).split(':')[0].replace(/\+/g, ' ').split('|')[0].toLowerCase();
      if (name) links.set(name, link.href);
    }
  }
  return { faces, links };
}

export async function scanPage(): Promise<PageScan> {
  // Cross-origin stylesheets are only readable once downloaded; font sources need them.
  await prefetchStylesheets(document);

  const colors = new Map<string, ColorStat>();
  const pairs = new Map<string, ContrastPair>();
  const fontMap = new Map<string, { count: number; weights: Set<number>; sizes: Set<number>; headings: number }>();
  const textStyles = new Map<string, TextStyleStat>();
  const radii = new Map<string, number>();
  const shadows = new Map<string, number>();
  const gradients = new Map<string, number>();
  const spacing = new Map<string, number>();
  const bgCache: BackgroundCache = new WeakMap();

  const addColor = (css: string, role: 'text' | 'background' | 'border' | 'icon'): void => {
    const rgba = parseColor(css);
    if (!rgba || rgba.a === 0) return;
    const hex = rgbaToHex(rgba);
    let stat = colors.get(hex);
    if (!stat) {
      stat = { hex, count: 0, text: 0, background: 0, border: 0, icon: 0 };
      colors.set(hex, stat);
    }
    stat.count++;
    stat[role]++;
  };

  const all = Array.from(document.body?.querySelectorAll('*') ?? []);
  const elements = all.length > MAX_ELEMENTS ? all.slice(0, MAX_ELEMENTS) : all;
  let counted = 0;

  for (const el of elements) {
    if (SKIP_TAGS.has(el.tagName) || el.id === HOST_ID) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none') continue;
    counted++;

    const isSvgShape = el instanceof SVGElement && SVG_SHAPES.has(el.tagName.toLowerCase());
    if (isSvgShape) {
      if (style.fill !== 'none') addColor(style.fill, 'icon');
      if (style.stroke !== 'none') addColor(style.stroke, 'icon');
    } else {
      addColor(style.backgroundColor, 'background');
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        if (parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none') {
          addColor(style.getPropertyValue(`border-${side.toLowerCase()}-color`), 'border');
        }
      }
    }

    if (style.backgroundImage.includes('gradient(')) bump(gradients, style.backgroundImage);
    if (style.boxShadow !== 'none') bump(shadows, style.boxShadow);
    if (style.borderRadius !== '0px') bump(radii, style.borderRadius);

    for (const prop of ['padding-top', 'padding-left', 'margin-top', 'margin-left', 'row-gap', 'column-gap']) {
      const v = style.getPropertyValue(prop);
      if (/^\d+(\.\d+)?px$/.test(v) && parseFloat(v) > 0) bump(spacing, v);
    }

    if (isSvgShape || !hasOwnText(el)) continue;

    addColor(style.color, 'text');
    const family = firstFamily(style.fontFamily);
    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10) || 400;

    const font = fontMap.get(family) ?? { count: 0, weights: new Set<number>(), sizes: new Set<number>(), headings: 0 };
    font.count++;
    font.weights.add(weight);
    font.sizes.add(size);
    if (/^H[1-3]$/.test(el.tagName)) font.headings++;
    fontMap.set(family, font);

    const styleKey = `${family}|${size}|${weight}|${style.lineHeight}|${style.letterSpacing}`;
    const tag = el.tagName;
    const existing = textStyles.get(styleKey);
    if (existing) {
      existing.count++;
      existing.tags[tag] = (existing.tags[tag] ?? 0) + 1;
    } else {
      textStyles.set(styleKey, { size, weight, family, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, count: 1, tags: { [tag]: 1 } });
    }

    const fg = parseColor(style.color);
    if (fg && fg.a > 0) {
      const info = measureContrast(fg, resolveBackground(el, bgCache), size, weight);
      const key = `${info.fg}|${info.bg}|${info.large}`;
      const pair = pairs.get(key);
      if (pair) pair.count++;
      else pairs.set(key, { fg: info.fg, bg: info.bg, ratio: info.ratio, count: 1, large: info.large, aa: info.aa, aaa: info.aaa });
    }
  }

  const sources = readFontSources();
  const fonts: FontStat[] = Array.from(fontMap, ([family, f]) => {
    const key = family.toLowerCase();
    return {
      family,
      count: f.count,
      weights: Array.from(f.weights).sort((a, b) => a - b),
      sizes: Array.from(f.sizes).sort((a, b) => a - b),
      source: sources.faces.get(key) ?? sources.links.get(key) ?? null,
      headings: f.headings,
    };
  }).sort((a, b) => b.count - a.count);

  return {
    url: location.href,
    title: document.title,
    elementCount: counted,
    truncated: all.length > MAX_ELEMENTS,
    colors: Array.from(colors.values()).sort((a, b) => b.count - a.count),
    pairs: Array.from(pairs.values()).sort((a, b) => b.count - a.count),
    fonts,
    textStyles: Array.from(textStyles.values()).sort((a, b) => b.count - a.count),
    radii: toStats(radii),
    shadows: toStats(shadows),
    gradients: toStats(gradients),
    spacing: toStats(spacing),
    tokens: readTokens(),
    unreadableSheets: getReadableSheets(document).unreadable,
  };
}
