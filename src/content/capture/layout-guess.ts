import type { AutoLayout, EdgeValues, ResizeMode } from '../types';

const num = (v: string): number => parseFloat(v) || 0;

export function isFlexOrGrid(style: CSSStyleDeclaration): boolean {
  return /flex|grid/.test(style.display);
}

// transform: matrix(a, b, ...) or matrix3d(a, b, ...) -> degrees; undefined when not rotated.
export function readRotation(transform: string): string | undefined {
  if (!transform || transform === 'none') return undefined;
  const m = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!m) return undefined;
  const [a, b] = m[1].split(',').map((n) => parseFloat(n));
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI * 100) / 100;
  return deg === 0 ? undefined : `${deg}deg`;
}

function mainAxisLabel(value: string): 'start' | 'center' | 'end' {
  if (value === 'center') return 'center';
  if (/end|right/.test(value) && !value.startsWith('space')) return 'end';
  return 'start';
}

function crossAxisLabel(value: string): 'start' | 'center' | 'end' | 'stretch' | 'baseline' {
  if (value === 'center') return 'center';
  if (value === 'baseline' || value === 'first baseline' || value === 'last baseline') return 'baseline';
  if (/end/.test(value)) return 'end';
  if (value === 'normal' || value === 'stretch') return 'stretch';
  return 'start';
}

// Figma's alignment is a 9-point grid: (Top|Center|Bottom) x (Left|Center|Right).
function nineGrid(horizontal: 'start' | 'center' | 'end', vertical: 'start' | 'center' | 'end'): string {
  const v = { start: 'Top', center: 'Center', end: 'Bottom' }[vertical];
  const h = { start: 'left', center: 'center', end: 'right' }[horizontal];
  if (v === 'Center' && h === 'center') return 'Center';
  if (v === 'Center') return `Center ${h}`;
  return `${v} ${h}`;
}

export function describeAutoLayout(parentStyle: CSSStyleDeclaration): AutoLayout | undefined {
  if (!isFlexOrGrid(parentStyle)) return undefined;

  const padding: EdgeValues = {
    top: num(parentStyle.paddingTop),
    right: num(parentStyle.paddingRight),
    bottom: num(parentStyle.paddingBottom),
    left: num(parentStyle.paddingLeft),
  };
  const gap = parentStyle.gap === 'normal' ? '0px' : parentStyle.gap;
  const isGrid = /grid/.test(parentStyle.display);

  const justify = parentStyle.justifyContent;
  const distribute = justify.startsWith('space-')
    ? `Space ${justify.replace('space-', '')}`
    : 'Packed';

  if (isGrid) {
    const cross = crossAxisLabel(parentStyle.alignItems);
    const h = mainAxisLabel(parentStyle.justifyItems === 'normal' ? 'start' : parentStyle.justifyItems);
    return {
      direction: 'Grid',
      gap,
      align: nineGrid(h, cross === 'stretch' || cross === 'baseline' ? 'start' : cross),
      distribute: 'Packed',
      padding,
    };
  }

  const horizontalFlow = parentStyle.flexDirection.startsWith('row');
  const main = mainAxisLabel(justify);
  const cross = crossAxisLabel(parentStyle.alignItems);
  const crossPos = cross === 'stretch' || cross === 'baseline' ? 'start' : cross;
  const align = horizontalFlow ? nineGrid(main, crossPos) : nineGrid(crossPos, main);

  return {
    direction: horizontalFlow ? 'Horizontal' : 'Vertical',
    gap,
    align: cross === 'stretch' ? `${align} (children stretch)` : align,
    distribute,
    padding,
  };
}

const INTRINSIC_TAGS = new Set(['img', 'video', 'canvas', 'svg', 'iframe', 'input', 'textarea', 'select']);

// Computed styles can't reveal whether width was authored as `auto` or a pixel value,
// so this is an inference from display, flex behaviour and how the size relates to the parent.
export function guessResize(
  el: Element,
  style: CSSStyleDeclaration,
  parent: Element | null,
  parentStyle: CSSStyleDeclaration | null,
): { width: ResizeMode; height: ResizeMode } {
  const tag = el.tagName.toLowerCase();
  const inline = (el as HTMLElement).style;
  const flexParent = parentStyle !== null && /flex/.test(parentStyle.display);
  const rowFlow = flexParent && parentStyle.flexDirection.startsWith('row');
  const grow = num(style.flexGrow);
  const alignSelf = style.alignSelf === 'auto' ? parentStyle?.alignItems ?? 'normal' : style.alignSelf;
  const stretches = alignSelf === 'normal' || alignSelf === 'stretch';
  const inlineLevel = /^(inline|inline-block|inline-flex|inline-grid|table-cell)$/.test(style.display);

  const parentContentWidth = (() => {
    if (!parent || !parentStyle) return 0;
    const r = parent.getBoundingClientRect();
    return (
      r.width -
      num(parentStyle.paddingLeft) - num(parentStyle.paddingRight) -
      num(parentStyle.borderLeftWidth) - num(parentStyle.borderRightWidth)
    );
  })();
  const width = el.getBoundingClientRect().width;

  const axis = (kind: 'width' | 'height'): ResizeMode => {
    const authored = kind === 'width' ? inline.width : inline.height;
    if (authored) return authored.endsWith('%') && parseFloat(authored) >= 99 ? 'Fill' : 'Fixed';
    if (INTRINSIC_TAGS.has(tag)) return 'Fixed';

    if (flexParent) {
      const isMain = (kind === 'width') === rowFlow;
      if (isMain) {
        if (grow > 0) return 'Fill';
        return style.flexBasis === 'auto' ? 'Hug' : 'Fixed';
      }
      return stretches ? 'Fill' : 'Hug';
    }

    if (inlineLevel) return 'Hug';
    if (kind === 'width') return Math.abs(width - parentContentWidth) <= 1 ? 'Fill' : 'Fixed';
    return 'Hug';
  };

  return { width: axis('width'), height: axis('height') };
}
