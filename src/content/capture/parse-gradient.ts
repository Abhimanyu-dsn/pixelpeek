import type { GradientLayer } from '../types';
import { COLOR_PATTERN, splitTopLevel, toHex } from './color';

const KEYWORD_ANGLES: Record<string, number> = {
  'to top': 0,
  'to right': 90,
  'to bottom': 180,
  'to left': 270,
  'to top right': 45,
  'to right top': 45,
  'to bottom right': 135,
  'to right bottom': 135,
  'to bottom left': 225,
  'to left bottom': 225,
  'to top left': 315,
  'to left top': 315,
};

function roundAngle(n: number): string {
  return `${Math.round(n * 100) / 100}deg`;
}

function normalizeAngle(input: string): string {
  const keyword = KEYWORD_ANGLES[input.trim()];
  if (keyword !== undefined) return roundAngle(keyword);
  const m = input.match(/^(-?[\d.]+)(deg|turn|rad|grad)$/);
  if (!m) return input;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'turn': return roundAngle(n * 360);
    case 'rad': return roundAngle((n * 180) / Math.PI);
    case 'grad': return roundAngle(n * 0.9);
    default: return roundAngle(n);
  }
}

function parseLayer(raw: string): GradientLayer {
  const m = raw.match(/^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s);
  if (!m || m[1] || m[2] === 'conic') return { type: 'Other', stops: [], raw };

  const type = m[2] === 'linear' ? 'Linear' : 'Radial';
  const args = splitTopLevel(m[3]);
  let angle: string | undefined;

  // A leading argument without a color is the direction (linear) or shape/position (radial).
  if (args.length && !COLOR_PATTERN.test(args[0])) {
    const descriptor = args.shift() as string;
    if (type === 'Linear') angle = normalizeAngle(descriptor);
  } else if (type === 'Linear') {
    angle = '180deg';
  }

  const stops = args.map((arg) => {
    const colorMatch = arg.match(COLOR_PATTERN);
    if (!colorMatch) return { color: arg };
    const position = arg.replace(colorMatch[0], '').trim();
    return { color: toHex(colorMatch[0]), position: position || undefined };
  });

  return { type, angle, stops, raw };
}

export function parseGradients(value: string): GradientLayer[] {
  if (!value || value === 'none') return [];
  return splitTopLevel(value)
    .filter((layer) => layer.includes('gradient('))
    .map(parseLayer);
}
