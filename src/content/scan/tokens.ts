import { getReadableSheets } from '../variants/sheets';
import { hslToRgb, parseColor, rgbaToHex } from './color-math';

// The values a site's own authors named: CSS custom properties declared on :root / html / body, with
// the dark-mode values from `.dark`, `[data-theme=dark]` and `@media (prefers-color-scheme: dark)`.
// These are the closest thing a website has to Figma variables.

export type TokenKind = 'color' | 'dimension' | 'font' | 'shadow' | 'other';

export interface DeclaredToken {
  // With the leading dashes, as written: "--color-brand".
  name: string;
  kind: TokenKind;
  // As declared for the light (default) mode, e.g. "#0c66e4" or "var(--blue-600)".
  value: string;
  // What it computes to right now, on the page.
  resolved: string;
  // The token it points at, when the value is a plain var(--other).
  alias?: string;
  // The declared dark-mode value, when the site has one.
  dark?: string;
}

const MAX_TOKENS = 400;

const ROOT_SELECTOR = /^(:root|html|body|:host)$/i;
const DARK_SELECTOR = /(\.dark\b|\.theme-dark\b|\.dark-mode\b|\[data-(?:bs-)?(?:theme|mode|color-scheme)\s*[~^$*|]?=\s*["']?dark["']?\])/i;
const INTERNAL = /^--(tw-|webkit|moz|radix-|swiper-|wp-|cmdk-|sb-)/i;

// shadcn and Radix themes write colours as bare "H S% L%" triplets: "222.2 84% 4.9%".
const HSL_TRIPLET = /^(\d+(?:\.\d+)?)(?:deg)?\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%(?:\s*\/\s*[\d.]+%?)?$/;

export function tokenColor(value: string): string | null {
  const triplet = value.trim().match(HSL_TRIPLET);
  if (triplet) {
    return rgbaToHex(hslToRgb({ h: parseFloat(triplet[1]), s: parseFloat(triplet[2]) / 100, l: parseFloat(triplet[3]) / 100 }));
  }
  const rgba = parseColor(value);
  return rgba && rgba.a > 0 ? rgbaToHex(rgba) : null;
}

function classify(name: string, resolved: string): TokenKind {
  if (tokenColor(resolved)) return 'color';
  if (/^-?[\d.]+(px|rem|em|%|vw|vh|ch)$/.test(resolved) || /^calc\(/.test(resolved)) return 'dimension';
  if (/shadow|elevation/i.test(name) || /\d+(px|rem)\s+-?\d+(px|rem).*(rgba?\(|hsla?\(|#)/.test(resolved)) return 'shadow';
  if (/font|family/i.test(name) && !/size|weight|height/i.test(name)) return 'font';
  if (/,\s*(sans-serif|serif|monospace|system-ui|ui-)/i.test(resolved)) return 'font';
  return 'other';
}

type Target = 'light' | 'dark' | null;

function targetOf(selectorText: string, inDarkMedia: boolean): Target {
  const parts = selectorText.split(',').map((s) => s.trim());
  let found: Target = null;
  for (const part of parts) {
    if (ROOT_SELECTOR.test(part) && !inDarkMedia) found = found ?? 'light';
    else if (ROOT_SELECTOR.test(part) && inDarkMedia) found = 'dark';
    else if (DARK_SELECTOR.test(part) && /^(:root|html|body|\.dark|\.theme-dark|\.dark-mode|\[|:host)/i.test(part)) found = 'dark';
    // Tailwind's `:root:not(.light)` inside a dark media query.
    else if (inDarkMedia && /^(:root|html|body)(:not\([^)]*\)|\[[^\]]*\])*$/i.test(part)) found = 'dark';
  }
  return found;
}

function walk(rules: CSSRuleList, inDarkMedia: boolean, light: Map<string, string>, dark: Map<string, string>): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const target = targetOf(rule.selectorText, inDarkMedia);
      if (!target) continue;
      const into = target === 'dark' ? dark : light;
      for (let i = 0; i < rule.style.length; i++) {
        const prop = rule.style[i];
        if (!prop.startsWith('--')) continue;
        into.set(prop, rule.style.getPropertyValue(prop).trim());
      }
    } else if (rule instanceof CSSMediaRule) {
      const text = rule.conditionText || rule.media.mediaText;
      if (/prefers-color-scheme\s*:\s*dark/i.test(text)) walk(rule.cssRules, true, light, dark);
      else if (/prefers-color-scheme\s*:\s*light/i.test(text) || /^\s*(all|screen)\s*$/i.test(text)) walk(rule.cssRules, inDarkMedia, light, dark);
      // Other media queries (breakpoints) change values at certain widths, not the theme.
    } else if ('cssRules' in rule && (rule instanceof CSSSupportsRule || rule.constructor.name === 'CSSLayerBlockRule')) {
      walk((rule as CSSGroupingRule).cssRules, inDarkMedia, light, dark);
    }
  }
}

export function readTokens(): DeclaredToken[] {
  const light = new Map<string, string>();
  const dark = new Map<string, string>();

  for (const sheet of getReadableSheets(document).sheets) {
    try {
      walk(sheet.cssRules, false, light, dark);
    } catch {
      // A sheet that turns unreadable halfway is skipped.
    }
  }

  // Custom properties set inline on <html> (common for runtime theming).
  const inline = document.documentElement.style;
  for (let i = 0; i < inline.length; i++) {
    const prop = inline[i];
    if (prop.startsWith('--')) light.set(prop, inline.getPropertyValue(prop).trim());
  }

  const computed = getComputedStyle(document.documentElement);
  const out: DeclaredToken[] = [];
  for (const [name, value] of light) {
    if (INTERNAL.test(name) || !value) continue;
    const resolved = computed.getPropertyValue(name).trim() || value;
    const alias = value.match(/^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/)?.[1];
    out.push({ name, kind: classify(name, resolved), value, resolved, alias, dark: dark.get(name) });
    if (out.length >= MAX_TOKENS) break;
  }
  // Tokens that only exist for dark mode are still the site's own.
  for (const [name, value] of dark) {
    if (light.has(name) || INTERNAL.test(name) || out.length >= MAX_TOKENS) continue;
    const resolved = computed.getPropertyValue(name).trim() || value;
    out.push({ name, kind: classify(name, resolved), value: resolved, resolved, dark: value });
  }
  return out;
}
