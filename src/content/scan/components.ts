import { HOST_ID } from '../shadow-root';
import { buildTailwind } from '../dev/tailwind';
import { parseColor, rgbaToHex } from './color-math';

// Recurring UI pieces on a page, grouped by how they look: every distinct style of button, input,
// card and badge, with how often it appears, a live preview and the Tailwind that reproduces it.

export type ComponentKind = 'Button' | 'Input' | 'Card' | 'Badge';

export interface ComponentVariant {
  count: number;
  label: string;
  tailwind: string[];
  // Inline CSS that draws a small copy of it in the panel.
  previewStyle: string;
  size: string;
  // The values that draw it, as the page really has them.
  details: { label: string; value: string }[];
}

export interface ComponentGroup {
  kind: ComponentKind;
  variants: ComponentVariant[];
}

const MAX_SCANNED = 6000;
const MAX_VARIANTS = 6;

const num = (v: string): number => parseFloat(v) || 0;
const visible = (c: string): boolean => {
  const p = parseColor(c);
  return !!p && p.a > 0.05;
};

function previewStyle(s: CSSStyleDeclaration, kind: ComponentKind): string {
  const css: string[] = [
    `background:${s.backgroundColor}`,
    `color:${s.color}`,
    `border:${s.borderTopWidth} ${s.borderTopStyle === 'none' ? 'solid' : s.borderTopStyle} ${s.borderTopColor}`,
    `border-radius:${s.borderTopLeftRadius}`,
    `padding:${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
    `font-family:${s.fontFamily}`,
    `font-size:${s.fontSize}`,
    `font-weight:${s.fontWeight}`,
    `line-height:${s.lineHeight}`,
    `letter-spacing:${s.letterSpacing}`,
  ];
  if (s.boxShadow !== 'none') css.push(`box-shadow:${s.boxShadow}`);
  if (s.textTransform !== 'none') css.push(`text-transform:${s.textTransform}`);
  if (kind === 'Card') css.push('width:100%', 'min-height:56px', 'box-sizing:border-box');
  else css.push('display:inline-block', 'box-sizing:border-box');
  return css.join(';');
}

function details(s: CSSStyleDeclaration): { label: string; value: string }[] {
  const hex = (c: string): string => {
    const p = parseColor(c);
    return p && p.a > 0 ? rgbaToHex(p) : '';
  };
  const edge = (t: string, r: string, b: string, l: string): string =>
    t === r && r === b && b === l ? t : t === b && r === l ? `${t} ${r}` : `${t} ${r} ${b} ${l}`;
  const border = num(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' ? `${s.borderTopWidth} ${hex(s.borderTopColor)}` : '';
  const out = [
    { label: 'Fill', value: hex(s.backgroundColor) },
    { label: 'Text', value: hex(s.color) },
    { label: 'Border', value: border },
    { label: 'Radius', value: s.borderTopLeftRadius !== '0px' ? s.borderTopLeftRadius : '' },
    { label: 'Padding', value: edge(s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft) },
    { label: 'Font', value: `${(s.fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim()} ${s.fontSize}/${s.fontWeight}` },
    { label: 'Shadow', value: s.boxShadow !== 'none' ? s.boxShadow : '' },
  ];
  return out.filter((d) => d.value && d.value !== '0px');
}

function signature(s: CSSStyleDeclaration): string {
  return [
    rgbaToHex(parseColor(s.backgroundColor) ?? { r: 0, g: 0, b: 0, a: 0 }),
    rgbaToHex(parseColor(s.color) ?? { r: 0, g: 0, b: 0, a: 1 }),
    s.borderTopWidth, s.borderTopColor, s.borderTopLeftRadius,
    s.paddingTop, s.paddingLeft, s.fontSize, s.fontWeight, s.boxShadow,
  ].join('|');
}

function classify(el: Element, s: CSSStyleDeclaration, rect: DOMRect): ComponentKind | null {
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    if (['button', 'submit', 'reset'].includes(type)) return 'Button';
    if (['hidden', 'checkbox', 'radio', 'range', 'file', 'color', 'image'].includes(type)) return null;
    return 'Input';
  }
  if (tag === 'TEXTAREA' || tag === 'SELECT') return 'Input';
  if (rect.width < 8 || rect.height < 8) return null;

  const hasFill = visible(s.backgroundColor);
  const hasBorder = num(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none';
  const radius = num(s.borderTopLeftRadius);
  const text = (el.textContent ?? '').trim();

  if (tag === 'BUTTON' || el.getAttribute('role') === 'button') return 'Button';
  if (tag === 'A' && (hasFill || hasBorder) && num(s.paddingLeft) >= 8 && text.length > 0 && text.length < 40 && rect.height < 90) return 'Button';
  // Pills and tags: small, filled, rounded, short text.
  if (hasFill && text.length > 0 && text.length <= 24 && rect.height <= 36 && radius >= rect.height / 2 - 1 && num(s.fontSize) <= 14 && el.children.length <= 1) return 'Badge';
  // Cards: bordered or shadowed, rounded, filled, big enough to hold things.
  if ((hasBorder || s.boxShadow !== 'none') && radius >= 4 && hasFill && rect.width >= 140 && rect.width <= 720 && rect.height >= 60 && el.children.length >= 1) return 'Card';
  return null;
}

export function scanComponents(): ComponentGroup[] {
  const groups = new Map<ComponentKind, Map<string, ComponentVariant>>();
  const all = Array.from(document.body?.querySelectorAll('*') ?? []).slice(0, MAX_SCANNED);

  for (const el of all) {
    if (el.id === HOST_ID || el.closest(`#${HOST_ID}`) || el instanceof SVGElement) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    const kind = classify(el, s, rect);
    if (!kind) continue;

    const key = signature(s);
    let byKey = groups.get(kind);
    if (!byKey) groups.set(kind, (byKey = new Map()));
    const existing = byKey.get(key);
    if (existing) {
      existing.count++;
      continue;
    }
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    byKey.set(key, {
      count: 1,
      label: kind === 'Input' ? (el as HTMLInputElement).placeholder || (el as HTMLInputElement).type || 'Input' : text.slice(0, 24) || kind,
      tailwind: buildTailwind(el, s).filter((c) => !/^(w|h)-/.test(c)),
      previewStyle: previewStyle(s, kind),
      size: `${Math.round(rect.width)} × ${Math.round(rect.height)}`,
      details: details(s),
    });
  }

  const order: ComponentKind[] = ['Button', 'Input', 'Card', 'Badge'];
  return order
    .filter((kind) => groups.has(kind))
    .map((kind) => ({
      kind,
      variants: Array.from(groups.get(kind)!.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_VARIANTS),
    }));
}
