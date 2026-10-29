import { toHex } from '../capture/color';
import { parseGradients } from '../capture/parse-gradient';
import { parseShadows } from '../capture/parse-shadow';
import { hasOwnText } from '../scan/contrast';

// Turns an element's computed style into Tailwind utility classes. Values that sit on Tailwind's
// default scale get the named class (`px-6`, `text-lg`, `font-medium`); everything else becomes an
// arbitrary value (`text-[56px]`), so the classes reproduce the element rather than approximate it.

const px = (v: string): number => parseFloat(v) || 0;
const fmt = (n: number): string => String(Math.round(n * 100) / 100);
const arb = (n: number): string => `[${fmt(n)}px]`;

// Tailwind's spacing scale is 4px steps (plus the half steps below 16px).
function spacing(n: number): string {
  if (n === 1) return 'px';
  if (n % 4 === 0 && n <= 384) return fmt(n / 4);
  if (n % 2 === 0 && n < 16) return fmt(n / 4);
  return arb(n);
}

const underscores = (s: string): string => s.replace(/\s+/g, '_');

const FONT_SIZES: Record<number, string> = {
  12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl', 24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl', 72: '7xl', 96: '8xl', 128: '9xl',
};
const WEIGHTS: Record<number, string> = {
  100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black',
};
const LEADINGS: Record<string, string> = { '1': 'none', '1.25': 'tight', '1.375': 'snug', '1.5': 'normal', '1.625': 'relaxed', '2': 'loose' };
const TRACKINGS: Record<string, string> = { '-0.05': 'tighter', '-0.025': 'tight', '0.025': 'wide', '0.05': 'wider', '0.1': 'widest' };
const RADII: Record<number, string> = { 2: 'sm', 4: '', 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl' };
const JUSTIFY: Record<string, string> = {
  'flex-start': 'start', start: 'start', center: 'center', 'flex-end': 'end', end: 'end',
  'space-between': 'between', 'space-around': 'around', 'space-evenly': 'evenly',
};
const ITEMS: Record<string, string> = {
  'flex-start': 'start', start: 'start', center: 'center', 'flex-end': 'end', end: 'end', baseline: 'baseline', stretch: 'stretch',
};
const Z_NAMED = new Set([0, 10, 20, 30, 40, 50]);

function fontFamilyClass(family: string): string {
  const first = (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
  if (!first) return '';
  if (/mono|courier|consolas|menlo/i.test(first)) return 'font-mono';
  if (/^(serif|georgia|times)/i.test(first)) return 'font-serif';
  if (/^(ui-sans-serif|system-ui|-apple-system|blinkmacsystemfont|sans-serif|segoe ui|helvetica|arial)/i.test(first)) return 'font-sans';
  return `font-[${first.replace(/\s+/g, '_')}]`;
}

// padding / margin: p-4, px-4 py-2, or one side at a time.
function boxClasses(prefix: 'p' | 'm', t: number, r: number, b: number, l: number): string[] {
  if (!t && !r && !b && !l) return [];
  if (t === r && r === b && b === l) return [`${prefix}-${spacing(t)}`];
  const out: string[] = [];
  if (l === r && l) out.push(`${prefix}x-${spacing(l)}`);
  else {
    if (l) out.push(`${prefix}l-${spacing(l)}`);
    if (r) out.push(`${prefix}r-${spacing(r)}`);
  }
  if (t === b && t) out.push(`${prefix}y-${spacing(t)}`);
  else {
    if (t) out.push(`${prefix}t-${spacing(t)}`);
    if (b) out.push(`${prefix}b-${spacing(b)}`);
  }
  return out;
}

function radiusClass(prefix: string, r: number): string {
  if (r >= 9999) return `${prefix}-full`;
  const named = RADII[r];
  if (named !== undefined) return named ? `${prefix}-${named}` : prefix;
  return `${prefix}-${arb(r)}`;
}

function parentContentWidth(parent: Element | null): number {
  if (!parent) return 0;
  const s = getComputedStyle(parent);
  return parent.getBoundingClientRect().width - px(s.paddingLeft) - px(s.paddingRight) - px(s.borderLeftWidth) - px(s.borderRightWidth);
}

export function buildTailwind(el: Element, s: CSSStyleDeclaration): string[] {
  const out: string[] = [];
  const rect = el.getBoundingClientRect();

  // Layout
  if (s.display !== 'inline') out.push(s.display === 'none' ? 'hidden' : s.display === 'inline-block' ? 'inline-block' : s.display);
  if (s.position !== 'static') out.push(s.position);
  if (s.position !== 'static' && s.position !== 'relative') {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const v = s[side];
      if (v && v !== 'auto') out.push(px(v) === 0 ? `${side}-0` : `${side}-${arb(px(v))}`);
    }
  }
  const z = parseInt(s.zIndex, 10);
  if (!Number.isNaN(z) && z !== 0) out.push(Z_NAMED.has(z) ? `z-${z}` : `z-[${z}]`);

  if (s.display.includes('flex')) {
    if (s.flexDirection === 'column') out.push('flex-col');
    else if (s.flexDirection === 'row-reverse') out.push('flex-row-reverse');
    else if (s.flexDirection === 'column-reverse') out.push('flex-col-reverse');
    if (s.flexWrap === 'wrap') out.push('flex-wrap');
    const j = JUSTIFY[s.justifyContent];
    if (j && j !== 'start') out.push(`justify-${j}`);
    const a = ITEMS[s.alignItems];
    if (a && a !== 'stretch') out.push(`items-${a}`);
  }
  if (s.display.includes('flex') || s.display.includes('grid')) {
    const gx = px(s.columnGap);
    const gy = px(s.rowGap);
    if (gx && gx === gy) out.push(`gap-${spacing(gx)}`);
    else {
      if (gx) out.push(`gap-x-${spacing(gx)}`);
      if (gy) out.push(`gap-y-${spacing(gy)}`);
    }
  }

  // Size
  const parent = el.parentElement;
  const fullWidth = parent && Math.abs(rect.width - parentContentWidth(parent)) < 1.5 && s.display !== 'inline';
  // Fixed sizes only where the element's size is its own: images, SVG, empty shapes, form fields.
  // A box that holds text or other elements takes its size from them, or from its parent.
  const media = ['IMG', 'VIDEO', 'CANVAS', 'IFRAME'].includes(el.tagName) || el instanceof SVGElement;
  const field = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
  const hasContent = el.children.length > 0 || !!(el.textContent ?? '').trim();
  if (rect.width) {
    if (fullWidth) out.push('w-full');
    else if (media || field || !hasContent) out.push(`w-${arb(rect.width)}`);
  }
  if (rect.height && (media || (!hasContent && s.display !== 'inline'))) out.push(`h-${arb(rect.height)}`);

  // Spacing
  out.push(...boxClasses('m', px(s.marginTop), px(s.marginRight), px(s.marginBottom), px(s.marginLeft)));
  out.push(...boxClasses('p', px(s.paddingTop), px(s.paddingRight), px(s.paddingBottom), px(s.paddingLeft)));

  // Typography: only worth listing where there is text to set.
  const hasText = hasOwnText(el);
  const family = hasText ? fontFamilyClass(s.fontFamily) : '';
  if (family) out.push(family);
  const size = hasText ? px(s.fontSize) : 0;
  if (size) out.push(FONT_SIZES[size] ? `text-${FONT_SIZES[size]}` : `text-${arb(size)}`);
  const weight = hasText ? parseInt(s.fontWeight, 10) : 0;
  if (weight && weight !== 400) out.push(WEIGHTS[weight] ? `font-${WEIGHTS[weight]}` : `font-[${weight}]`);
  if (hasText && s.fontStyle === 'italic') out.push('italic');
  if (s.lineHeight !== 'normal' && size) {
    const ratio = fmt(px(s.lineHeight) / size);
    out.push(LEADINGS[ratio] ? `leading-${LEADINGS[ratio]}` : `leading-${arb(px(s.lineHeight))}`);
  }
  if (s.letterSpacing !== 'normal' && px(s.letterSpacing) && size) {
    const ratio = fmt(Math.round((px(s.letterSpacing) / size) * 1000) / 1000);
    out.push(TRACKINGS[ratio] ? `tracking-${TRACKINGS[ratio]}` : `tracking-${arb(px(s.letterSpacing))}`);
  }
  if (hasText && !['start', 'left'].includes(s.textAlign)) out.push(`text-${s.textAlign}`);
  if (hasText && s.textTransform !== 'none') out.push(s.textTransform === 'capitalize' ? 'capitalize' : s.textTransform);
  if (hasText && s.textDecorationLine.includes('underline')) out.push('underline');
  if (hasText && s.textDecorationLine.includes('line-through')) out.push('line-through');
  if (s.whiteSpace === 'nowrap') out.push('whitespace-nowrap');
  if (s.textOverflow === 'ellipsis' && s.whiteSpace === 'nowrap' && s.overflow !== 'visible') out.push('truncate');
  if (hasText) out.push(`text-[${toHex(s.color)}]`);

  // Fill
  const bg = toHex(s.backgroundColor);
  if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') out.push(`bg-[${bg}]`);
  const gradients = parseGradients(s.backgroundImage);
  if (gradients.length) out.push(`bg-[${underscores(gradients.map((g) => g.raw).join(','))}]`);

  // Stroke
  const widths = (['Top', 'Right', 'Bottom', 'Left'] as const).map((side) =>
    s.getPropertyValue(`border-${side.toLowerCase()}-style`) === 'none' ? 0 : px(s.getPropertyValue(`border-${side.toLowerCase()}-width`)),
  );
  const [bt, br, bb, bl] = widths;
  // Sub-pixel widths are the browser snapping a 1px border to a high-density screen.
  const borderW = (n: number): string => (n === 1 || (n > 0 && n < 1) ? '' : n === 0 ? '-0' : [2, 4, 8].includes(n) ? `-${n}` : `-${arb(n)}`);
  if (bt || br || bb || bl) {
    if (bt === br && br === bb && bb === bl) out.push(`border${borderW(bt)}`);
    else {
      if (bt) out.push(`border-t${borderW(bt)}`);
      if (br) out.push(`border-r${borderW(br)}`);
      if (bb) out.push(`border-b${borderW(bb)}`);
      if (bl) out.push(`border-l${borderW(bl)}`);
    }
    if (s.borderTopStyle === 'dashed' || s.borderTopStyle === 'dotted') out.push(`border-${s.borderTopStyle}`);
    const side = widths.findIndex((w) => w > 0);
    const color = s.getPropertyValue(`border-${['top', 'right', 'bottom', 'left'][side]}-color`);
    out.push(`border-[${toHex(color)}]`);
  }

  // Radius
  const radii = [px(s.borderTopLeftRadius), px(s.borderTopRightRadius), px(s.borderBottomRightRadius), px(s.borderBottomLeftRadius)];
  if (radii.some(Boolean)) {
    if (radii.every((r) => r === radii[0])) {
      const percent = s.borderTopLeftRadius.endsWith('%') && px(s.borderTopLeftRadius) >= 50;
      out.push(radiusClass('rounded', percent ? 9999 : radii[0]));
    } else {
      (['tl', 'tr', 'br', 'bl'] as const).forEach((corner, i) => {
        if (radii[i]) out.push(radiusClass(`rounded-${corner}`, radii[i]));
      });
    }
  }

  // Effects
  const shadows = parseShadows(s.boxShadow);
  if (shadows.length) {
    out.push(
      `shadow-[${shadows
        .map((sh) => `${sh.type === 'Inner' ? 'inset_' : ''}${sh.x}_${sh.y}_${sh.blur}${sh.spread !== '0px' ? `_${sh.spread}` : ''}_${sh.color}`)
        .join(',')}]`,
    );
  }
  const opacity = parseFloat(s.opacity);
  if (opacity < 1) out.push(Math.round(opacity * 100) % 5 === 0 ? `opacity-${Math.round(opacity * 100)}` : `opacity-[${fmt(opacity)}]`);
  if (s.overflow !== 'visible') out.push(`overflow-${s.overflow === 'clip' ? 'clip' : s.overflow}`);
  if (s.objectFit !== 'fill' && el.tagName === 'IMG') out.push(`object-${s.objectFit}`);

  return out.filter(Boolean);
}
