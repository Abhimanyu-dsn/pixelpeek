import { HOST_ID } from '../shadow-root';
import { hasOwnText } from './contrast';
import { parseColor, rgbaToHex } from './color-math';

// Every colour inside an element: its own and all of its descendants'.

export type ColorRole = 'background' | 'text' | 'border' | 'icon' | 'gradient';

export interface InsideColor {
  hex: string;
  // Total uses across the element and everything in it.
  count: number;
  roles: ColorRole[];
  // True when the selected element itself uses it.
  own: boolean;
}

const MAX_ELEMENTS = 3000;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'TEMPLATE', 'BR', 'WBR']);
const SVG_SHAPES = new Set(['path', 'circle', 'rect', 'ellipse', 'polygon', 'polyline', 'line', 'g', 'text', 'use']);
const COLOR_IN_GRADIENT = /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}\b)/g;

export function collectColors(root: Element): InsideColor[] {
  const found = new Map<string, { count: number; roles: Set<ColorRole>; own: boolean }>();

  const add = (css: string, role: ColorRole, own: boolean): void => {
    const rgba = parseColor(css);
    if (!rgba || rgba.a === 0) return;
    const hex = rgbaToHex(rgba);
    const entry = found.get(hex) ?? { count: 0, roles: new Set<ColorRole>(), own: false };
    entry.count++;
    entry.roles.add(role);
    entry.own = entry.own || own;
    found.set(hex, entry);
  };

  const elements = [root, ...Array.from(root.querySelectorAll('*')).slice(0, MAX_ELEMENTS)];
  for (const el of elements) {
    if (SKIP_TAGS.has(el.tagName) || el.id === HOST_ID) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none') continue;
    const own = el === root;

    const isSvgShape = el instanceof SVGElement && SVG_SHAPES.has(el.tagName.toLowerCase());
    if (isSvgShape) {
      if (style.fill !== 'none') add(style.fill, 'icon', own);
      if (style.stroke !== 'none') add(style.stroke, 'icon', own);
      continue;
    }

    add(style.backgroundColor, 'background', own);
    // A border drawn the same on all four sides counts once.
    const borders = new Set<string>();
    for (const side of ['top', 'right', 'bottom', 'left']) {
      if (parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 && style.getPropertyValue(`border-${side}-style`) !== 'none') {
        borders.add(style.getPropertyValue(`border-${side}-color`));
      }
    }
    borders.forEach((color) => add(color, 'border', own));
    if (style.backgroundImage.includes('gradient(')) {
      for (const match of style.backgroundImage.matchAll(COLOR_IN_GRADIENT)) add(match[1], 'gradient', own);
    }
    if (hasOwnText(el)) add(style.color, 'text', own);
  }

  return Array.from(found, ([hex, v]) => ({ hex, count: v.count, roles: Array.from(v.roles), own: v.own })).sort(
    (a, b) => Number(b.own) - Number(a.own) || b.count - a.count,
  );
}
