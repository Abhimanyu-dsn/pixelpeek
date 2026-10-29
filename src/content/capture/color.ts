// Splits on `sep` only at parenthesis depth 0, so commas inside rgba(...) survive.
export function splitTopLevel(input: string, sep = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim());
}

export const COLOR_PATTERN = /rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/;

// rgb()/rgba() → #RRGGBB (or #RRGGBBAA when translucent). Anything else is returned untouched.
export function toHex(css: string): string {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (!m) return css;
  const h = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
  let hex = `#${h(+m[1])}${h(+m[2])}${h(+m[3])}`;
  if (m[4] !== undefined) {
    const alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (alpha < 1) hex += h(alpha * 255);
  }
  return hex.toUpperCase();
}

export function isVisibleColor(value: string): boolean {
  return value !== '' && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)';
}
