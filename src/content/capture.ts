import { collectColors } from './scan/element-colors';
import type { ElementCapture, EdgeValues, StrokeSide } from './types';
import { isVisibleColor, toHex } from './capture/color';
import { parseShadows } from './capture/parse-shadow';
import { parseGradients } from './capture/parse-gradient';
import { readContrast } from './scan/contrast';
import { buildTailwind } from './dev/tailwind';
import { readAnimation } from './capture/animation';
import { describeAutoLayout, guessResize, readRotation } from './capture/layout-guess';

let nextId = 0;

const num = (v: string): number => parseFloat(v) || 0;

function edgeValues(style: CSSStyleDeclaration, prefix: 'margin' | 'border' | 'padding'): EdgeValues {
  const suffix = prefix === 'border' ? '-width' : '';
  return {
    top: num(style.getPropertyValue(`${prefix}-top${suffix}`)),
    right: num(style.getPropertyValue(`${prefix}-right${suffix}`)),
    bottom: num(style.getPropertyValue(`${prefix}-bottom${suffix}`)),
    left: num(style.getPropertyValue(`${prefix}-left${suffix}`)),
  };
}

function buildSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const classes = Array.from(el.classList).slice(0, 2).join('.');
  return classes ? `${el.tagName.toLowerCase()}.${classes}` : el.tagName.toLowerCase();
}

function buildDomPath(el: Element): string[] {
  const path: string[] = [];
  let current: Element | null = el;
  while (current && current.tagName !== 'HTML') {
    path.unshift(buildSelector(current));
    current = current.parentElement;
  }
  return path;
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function childIndexLabel(el: Element, parent: Element): string {
  const siblings = Array.from(parent.children);
  const index = siblings.indexOf(el) + 1;
  return `${index}${ordinalSuffix(index)} of ${siblings.length}`;
}

function siblingGap(a: Element, b: Element, axis: 'vertical' | 'horizontal'): string {
  const rectA = a.getBoundingClientRect();
  const rectB = b.getBoundingClientRect();
  const gap = axis === 'vertical' ? rectB.top - rectA.bottom : rectB.left - rectA.right;
  return `${Math.round(gap)}px`;
}

const BLOCK_TEXT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);

function describeTruncation(style: CSSStyleDeclaration): string {
  const lineClamp = style.getPropertyValue('-webkit-line-clamp');
  if (lineClamp && lineClamp !== 'none') {
    return `${lineClamp} lines, then ellipsis`;
  }
  if (style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap' && style.overflow !== 'visible') {
    return 'single line, ellipsis';
  }
  return 'none';
}

// A 1px border on a screen with fewer than one device pixel per CSS pixel (browser zoomed out) computes
// to 0.8px or so. It is still the 1px the designer drew.
const hairline = (width: string): string => {
  const w = parseFloat(width);
  return w > 0 && w < 1 ? '1px' : width;
};

function readStrokeSide(style: CSSStyleDeclaration, side: 'top' | 'right' | 'bottom' | 'left'): StrokeSide {
  const cap = side[0].toUpperCase() + side.slice(1);
  const get = (part: string): string => style.getPropertyValue(`border-${side}-${part}`) || style.getPropertyValue(`border${cap}${part}`);
  return {
    width: hairline(get('width')),
    style: get('style'),
    color: toHex(get('color')),
  };
}

// Properties shown untouched in the Raw CSS section, with the default values that are skipped as noise.
const RAW_PROPERTIES: [string, string[]][] = [
  ['font-family', []],
  ['font-size', []],
  ['font-weight', []],
  ['line-height', ['normal']],
  ['letter-spacing', ['normal']],
  ['text-align', []],
  ['text-decoration-line', ['none']],
  ['text-transform', ['none']],
  ['color', []],
  ['background-color', ['rgba(0, 0, 0, 0)']],
  ['background-image', ['none']],
  ['border-top', []],
  ['border-right', []],
  ['border-bottom', []],
  ['border-left', []],
  ['border-radius', ['0px']],
  ['box-shadow', ['none']],
  ['opacity', ['1']],
  ['margin', ['0px']],
  ['padding', ['0px']],
  ['width', []],
  ['height', []],
  ['position', ['static']],
  ['display', []],
  ['transform', ['none']],
  ['overflow', ['visible']],
  ['z-index', ['auto']],
];

function buildRawCss(style: CSSStyleDeclaration): string[] {
  const lines: string[] = [];
  for (const [prop, defaults] of RAW_PROPERTIES) {
    const value = style.getPropertyValue(prop).trim();
    if (!value || defaults.includes(value)) continue;
    if (prop.startsWith('border-') && prop !== 'border-radius' && value.startsWith('0px none')) continue;
    lines.push(`${prop}: ${prop.startsWith('border-') && prop !== 'border-radius' ? value.replace(/^0\.\d+px/, '1px') : value};`);
  }
  return lines;
}

function ownText(el: Element): string | undefined {
  const text = Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 120) : undefined;
}

export function captureElement(el: Element): ElementCapture {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const parent = el.parentElement;
  const parentStyle = parent ? getComputedStyle(parent) : null;

  // An SVG shape draws its outline with stroke, not border: the same stroke on every side.
  const svgStroke: StrokeSide | null =
    el instanceof SVGElement && style.stroke !== 'none' && parseFloat(style.strokeWidth) > 0
      ? { width: `${Math.round(parseFloat(style.strokeWidth) * 100) / 100}px`, style: 'solid', color: toHex(style.stroke) }
      : null;
  const stroke = svgStroke
    ? { top: svgStroke, right: svgStroke, bottom: svgStroke, left: svgStroke }
    : {
        top: readStrokeSide(style, 'top'),
        right: readStrokeSide(style, 'right'),
        bottom: readStrokeSide(style, 'bottom'),
        left: readStrokeSide(style, 'left'),
      };
  const hasStroke = Object.values(stroke).some((s) => num(s.width) > 0 && s.style !== 'none');
  const firstStroke = Object.values(stroke).find((s) => num(s.width) > 0 && s.style !== 'none');

  const colors: ElementCapture['layout']['colors'] = [];
  if (isVisibleColor(style.backgroundColor)) {
    colors.push({ role: 'background', value: style.backgroundColor });
  }
  if (isVisibleColor(style.color)) {
    colors.push({ role: 'text', value: style.color });
  }
  if (firstStroke) {
    colors.push({ role: 'border', value: firstStroke.color });
  }

  let parentContext: ElementCapture['layout']['parentContext'] | undefined;
  if (parent && parentStyle) {
    parentContext = {
      display: parentStyle.display,
      direction: parentStyle.display.includes('flex') ? parentStyle.flexDirection : undefined,
      gap: /flex|grid/.test(parentStyle.display) ? parentStyle.gap : undefined,
      childIndex: childIndexLabel(el, parent),
    };
  }

  let siblingSpacing: ElementCapture['layout']['siblingSpacing'] | undefined;
  const prevSibling = el.previousElementSibling;
  const nextSibling = el.nextElementSibling;
  if (prevSibling || nextSibling) {
    const axis = parentContext?.direction?.startsWith('row') ? 'horizontal' : 'vertical';
    siblingSpacing = {
      previous: prevSibling ? siblingGap(prevSibling, el, axis) : undefined,
      next: nextSibling ? siblingGap(el, nextSibling, axis) : undefined,
    };
  }

  // Note: a rotated element's bounding rect is the rotated bounding box, so X/Y are
  // approximate for rotated elements.
  const parentRect = parent?.getBoundingClientRect();
  const offset = {
    x: Math.round((rect.left - (parentRect?.left ?? 0) - (parentStyle ? num(parentStyle.borderLeftWidth) : 0)) * 10) / 10,
    y: Math.round((rect.top - (parentRect?.top ?? 0) - (parentStyle ? num(parentStyle.borderTopWidth) : 0)) * 10) / 10,
  };

  return {
    id: `pp-${nextId++}`,
    selector: buildSelector(el),
    tagName: el.tagName.toLowerCase(),
    domPath: buildDomPath(el),
    text: ownText(el),
    layout: {
      typography: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        color: style.color,
        letterSpacing: style.letterSpacing,
        textAlign: style.textAlign,
        textDecoration: style.textDecorationLine,
        textTransform: style.textTransform,
        truncation: describeTruncation(style),
        paragraphSpacing:
          BLOCK_TEXT_TAGS.has(el.tagName.toLowerCase()) && num(style.marginBottom) > 0
            ? style.marginBottom
            : undefined,
      },
      colors,
      palette: collectColors(el),
      contrast: readContrast(el, style),
      fills: parseGradients(style.backgroundImage),
      stroke: hasStroke ? stroke : undefined,
      cornerRadius: {
        topLeft: style.borderTopLeftRadius,
        topRight: style.borderTopRightRadius,
        bottomRight: style.borderBottomRightRadius,
        bottomLeft: style.borderBottomLeftRadius,
      },
      effects: {
        opacity: style.opacity !== '1' ? style.opacity : undefined,
        shadows: parseShadows(style.boxShadow),
      },
      boxModel: {
        margin: edgeValues(style, 'margin'),
        border: edgeValues(style, 'border'),
        padding: edgeValues(style, 'padding'),
        content: { width: Math.round(rect.width), height: Math.round(rect.height) },
      },
      position: style.position as ElementCapture['layout']['position'],
      offset,
      rotation: readRotation(style.transform),
      display: style.display,
      parentContext,
      autoLayout: parentStyle ? describeAutoLayout(parentStyle) : undefined,
      resize: guessResize(el, style, parent, parentStyle),
      siblingSpacing,
      animation: readAnimation(style),
      tailwind: buildTailwind(el, style),
      rawCss: buildRawCss(style),
    },
  };
}
