import type { ShadowLayer } from '../types';
import { COLOR_PATTERN, splitTopLevel, toHex } from './color';

// Computed box-shadow looks like: "rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, inset 0px 1px 0px rgb(255,255,255)"
export function parseShadows(value: string): ShadowLayer[] {
  if (!value || value === 'none') return [];

  return splitTopLevel(value).map((layer) => {
    const inset = /\binset\b/.test(layer);
    const colorMatch = layer.match(COLOR_PATTERN);
    const color = colorMatch ? colorMatch[0] : '';
    const rest = layer.replace(color, '').replace(/\binset\b/, '');
    const nums = (rest.match(/-?\d*\.?\d+(?:px)?/g) ?? []).map((n) => (n.endsWith('px') ? n : `${n}px`));
    const [x = '0px', y = '0px', blur = '0px', spread = '0px'] = nums;
    return {
      type: inset ? 'Inner' : 'Drop',
      x,
      y,
      blur,
      spread,
      color: color ? toHex(color) : 'transparent',
    };
  });
}
