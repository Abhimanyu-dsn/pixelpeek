import type { PageScan } from '../scan/page-scan';
import { parseColor, rgbaToHex } from '../scan/color-math';
import { tokenColor } from '../scan/tokens';
import type { DeclaredToken } from '../scan/tokens';

// A design system the way Figma keeps one: variables (tokens the product named), colour styles,
// text styles, effect styles, spacing and radius, and components. Every value here is read from the
// page; nothing is generated. Names are the site's own where it has them, otherwise a plain label
// that makes no claim (a hex, "H1", "Shadow 1").

export interface UsedColor {
  hex: string;
  count: number;
  // How many times it fills a surface, colours text, draws a border, or fills an icon.
  surface: number;
  text: number;
  border: number;
  icon: number;
  // Declared tokens that hold exactly this colour.
  tokens: string[];
}

export interface TextStyle {
  // From the element it appears on: "H1", "Button", "Link", "Text".
  name: string;
  family: string;
  size: string;
  weight: number;
  lineHeight: string;
  letterSpacing: string;
  count: number;
}

export interface StyleValue {
  // The site's token name when it has one, else a plain label or the value itself.
  name: string;
  value: string;
  count: number;
  tokens: string[];
}

export interface DesignSystem {
  source: { url: string; title: string };
  // The custom properties the site declares: its variables.
  tokens: DeclaredToken[];
  colors: UsedColor[];
  fonts: { family: string; weights: number[]; source: string | null }[];
  textStyles: TextStyle[];
  shadows: StyleValue[];
  radii: StyleValue[];
  spacing: StyleValue[];
  gradients: StyleValue[];
}

// Shadows are written many ways ("0 4px 12px rgba(9,30,66,.15)" in a stylesheet, "rgba(9, 30, 66, 0.15) 0px
// 4px 12px 0px" once computed), so they are compared by their numbers and colour.
function norm(v: string): string {
  const text = v.replace(/\s+/g, ' ').trim().toLowerCase();
  const color = text.match(/(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b)/)?.[1];
  const rgba = color ? parseColor(color) : null;
  if (!rgba || !/\d+(px)?\s+-?\d+/.test(text.replace(color as string, ''))) return text;
  const nums = (text.replace(color as string, '').match(/-?\d*\.?\d+/g) ?? []).map(Number);
  while (nums.length < 4) nums.push(0);
  return `shadow:${nums.slice(0, 4).join(',')}|${rgbaToHex(rgba)}${rgba.a < 1 ? `@${rgba.a}` : ''}`;
}

// value -> the names of declared tokens whose current value is exactly that.
function tokenIndex(tokens: DeclaredToken[]): { color: Map<string, string[]>; other: Map<string, string[]> } {
  const color = new Map<string, string[]>();
  const other = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, name: string): void => {
    const list = map.get(key) ?? [];
    if (list.length < 6 && !list.includes(name)) list.push(name);
    map.set(key, list);
  };
  for (const t of tokens) {
    if (t.kind === 'color') {
      const hex = tokenColor(t.resolved);
      if (hex) add(color, hex, t.name);
    } else {
      add(other, norm(t.resolved), t.name);
    }
  }
  return { color, other };
}

const TAG_LABEL: Record<string, string> = {
  H1: 'H1', H2: 'H2', H3: 'H3', H4: 'H4', H5: 'H5', H6: 'H6',
  BUTTON: 'Button', INPUT: 'Input', TEXTAREA: 'Input', SELECT: 'Input', A: 'Link', LABEL: 'Label', LI: 'List item', TD: 'Table cell', TH: 'Table head',
};

function buildTextStyles(scan: PageScan): TextStyle[] {
  const styles = scan.textStyles.filter((t) => t.size >= 8 && t.size <= 200).slice(0, 16);
  const seen = new Map<string, number>();
  const out = styles.map((t) => {
    const dominant = Object.entries(t.tags).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const base = TAG_LABEL[dominant] ?? 'Text';
    seen.set(base, (seen.get(base) ?? 0) + 1);
    return { base, style: t };
  });
  return out
    .sort((a, b) => b.style.size - a.style.size || b.style.count - a.style.count)
    .map(({ base, style }) => ({
      // Two styles with the same label are told apart by size and weight, never by an invented rank.
      name: (seen.get(base) ?? 0) > 1 ? `${base} ${Math.round(style.size * 10) / 10}/${style.weight}` : base,
      family: style.family,
      size: `${Math.round(style.size * 10) / 10}px`,
      weight: style.weight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      count: style.count,
    }));
}

const blur = (v: string): number => {
  const m = v.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/);
  return m ? parseFloat(m[3]) : 0;
};

const RADIUS_NAME = /radius|rounded|corner/i;
const SPACE_NAME = /space|spacing|gap|pad|margin|inset|gutter/i;

const lead = (v: string): number => parseFloat(v) || 0;

export function buildDesignSystem(scan: PageScan): DesignSystem {
  const index = tokenIndex(scan.tokens);
  // Declared tokens holding this value; `only` limits them by name (a radius is not a spacing step).
  const otherTokens = (value: string, only?: RegExp): string[] => (index.other.get(norm(value)) ?? []).filter((n) => !only || only.test(n));

  const colors: UsedColor[] = scan.colors
    .map((c) => ({
      hex: c.hex,
      count: c.count,
      surface: c.background,
      text: c.text,
      border: c.border,
      icon: c.icon,
      tokens: index.color.get(c.hex) ?? [],
    }));

  const shadows = scan.shadows
    .slice(0, 6)
    .sort((a, b) => blur(a.value) - blur(b.value))
    .map((s, i) => {
      const tokens = otherTokens(s.value);
      return { name: tokens[0] ?? `Shadow ${i + 1}`, value: s.value, count: s.count, tokens };
    });

  const radii = scan.radii
    .slice(0, 10)
    .sort((a, b) => lead(a.value) - lead(b.value))
    .map((r) => ({ name: otherTokens(r.value, RADIUS_NAME)[0] ?? r.value, value: r.value, count: r.count, tokens: otherTokens(r.value, RADIUS_NAME) }));

  const spacing = scan.spacing
    .slice(0, 14)
    // Em-based padding leaves values like 19.92px; only whole and half pixels are worth listing.
    .filter((s) => Number.isInteger(parseFloat(s.value) * 2))
    .sort((a, b) => lead(a.value) - lead(b.value))
    .map((s) => ({ name: otherTokens(s.value, SPACE_NAME)[0] ?? s.value, value: s.value, count: s.count, tokens: otherTokens(s.value, SPACE_NAME) }));

  const gradients = scan.gradients.slice(0, 6).map((g, i) => {
    const tokens = otherTokens(g.value);
    return { name: tokens[0] ?? `Gradient ${i + 1}`, value: g.value, count: g.count, tokens };
  });

  return {
    source: { url: scan.url, title: scan.title },
    tokens: scan.tokens,
    colors,
    fonts: scan.fonts.map((f) => ({ family: f.family, weights: f.weights, source: f.source })),
    textStyles: buildTextStyles(scan),
    shadows,
    radii,
    spacing,
    gradients,
  };
}
