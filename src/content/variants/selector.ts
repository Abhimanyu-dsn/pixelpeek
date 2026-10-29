// A small CSS selector tokenizer, just enough to find the *subject* compound of a selector
// (the part that targets the element itself) and the simple selectors inside it. It is
// escape-aware (Tailwind emits `.hover\:bg-x:hover`) and ignores anything inside quotes,
// brackets or parentheses, so `:not(:hover)` and `[data-x="a,b"]` are not misread.

export interface SelectorToken {
  kind: 'class' | 'id' | 'attribute' | 'pseudo-class' | 'pseudo-element' | 'tag' | 'universal' | 'other';
  // Offsets within the subject compound.
  start: number;
  end: number;
  // Unescaped identifier; lower-cased for pseudo-classes, pseudo-elements and attribute names.
  name: string;
  attr?: { operator: string; value: string };
}

const HEX = /[0-9a-fA-F]/;
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

// Returns the index just past the escape that starts at `i` (which must be a backslash).
function skipEscape(s: string, i: number): number {
  let j = i + 1;
  if (j >= s.length) return j;
  if (HEX.test(s[j])) {
    let digits = 0;
    while (j < s.length && digits < 6 && HEX.test(s[j])) {
      j++;
      digits++;
    }
    if (/\s/.test(s[j] ?? '')) j++;
    return j;
  }
  return j + 1;
}

function readIdent(s: string, i: number): { name: string; end: number } {
  let name = '';
  let j = i;
  while (j < s.length) {
    const ch = s[j];
    if (ch === '\\') {
      const end = skipEscape(s, j);
      const raw = s.slice(j + 1, end).trim();
      if (raw && HEX.test(raw[0])) {
        name += String.fromCodePoint(parseInt(raw.slice(0, 6), 16));
      } else {
        name += s[j + 1] ?? '';
      }
      j = end;
    } else if (/[\w-]/.test(ch) || ch.charCodeAt(0) > 127) {
      name += ch;
      j++;
    } else {
      break;
    }
  }
  return { name, end: j };
}

// Splits on `separator` where it is not nested in (), [] or quotes (selector lists use commas, declaration lists semicolons).
export function splitTopLevel(text: string, separator = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      const end = skipEscape(text, i);
      current += text.slice(i, end);
      i = end - 1;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === separator && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function findClosing(s: string, open: number, openCh: string, closeCh: string): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      i = skipEscape(s, i) - 1;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === openCh) depth++;
    else if (ch === closeCh && --depth === 0) return i;
  }
  return s.length - 1;
}

function parseAttribute(inner: string): { name: string; operator: string; value: string } {
  const m = inner.match(/^\s*([^\s~|^$*=]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))\s*(?:[isIS])?)?\s*$/);
  if (!m) return { name: inner.trim().toLowerCase(), operator: '', value: '' };
  return { name: m[1].toLowerCase(), operator: m[2] ?? '', value: m[3] ?? m[4] ?? m[5] ?? '' };
}

// Finds where the subject compound (after the last combinator at depth 0) begins.
function findSubjectStart(selector: string): number {
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '\\') {
      i = skipEscape(selector, i) - 1;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (/\s/.test(ch) || ch === '>' || ch === '+' || ch === '~')) start = i + 1;
  }
  return start;
}

export function parseSubject(selector: string): { subjectStart: number; tokens: SelectorToken[] } {
  const subjectStart = findSubjectStart(selector);
  const s = selector.slice(subjectStart);
  const tokens: SelectorToken[] = [];
  let i = 0;

  while (i < s.length) {
    const start = i;
    const ch = s[i];

    if (ch === '.' || ch === '#') {
      const id = readIdent(s, i + 1);
      tokens.push({ kind: ch === '.' ? 'class' : 'id', start, end: id.end, name: id.name });
      i = Math.max(id.end, i + 1);
    } else if (ch === '[') {
      const close = findClosing(s, i, '[', ']');
      const attr = parseAttribute(s.slice(i + 1, close));
      tokens.push({
        kind: 'attribute',
        start,
        end: close + 1,
        name: attr.name,
        attr: { operator: attr.operator, value: attr.value },
      });
      i = close + 1;
    } else if (ch === ':') {
      const isElement = s[i + 1] === ':';
      const id = readIdent(s, i + (isElement ? 2 : 1));
      let end = id.end;
      if (s[end] === '(') end = findClosing(s, end, '(', ')') + 1;
      const name = id.name.toLowerCase();
      const kind = isElement || LEGACY_PSEUDO_ELEMENTS.has(name) ? 'pseudo-element' : 'pseudo-class';
      tokens.push({ kind, start, end, name });
      i = Math.max(end, i + 1);
    } else if (ch === '*') {
      tokens.push({ kind: 'universal', start, end: i + 1, name: '*' });
      i++;
    } else {
      const id = readIdent(s, i);
      if (id.end > i) {
        tokens.push({ kind: 'tag', start, end: id.end, name: id.name.toLowerCase() });
        i = id.end;
      } else {
        tokens.push({ kind: 'other', start, end: i + 1, name: ch });
        i++;
      }
    }
  }

  return { subjectStart, tokens };
}
