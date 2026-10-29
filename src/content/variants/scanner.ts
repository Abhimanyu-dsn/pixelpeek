import type { VariantDeclaration } from '../types';
import { parseSubject, splitTopLevel } from './selector';
import { getReadableSheets } from './sheets';
import type { SelectorToken } from './selector';

export type PseudoState = 'hover' | 'focus' | 'active' | 'disabled';

export type StateToken =
  | { type: 'pseudo'; name: PseudoState }
  | { type: 'class'; name: string }
  | { type: 'attribute'; name: string; value: string };

export interface StateMatch {
  token: StateToken;
  declarations: VariantDeclaration[];
}

const PSEUDO_STATES = new Set<string>(['hover', 'focus', 'active', 'disabled']);

// Words that make a class or attribute a "state" (`.active`, `.is-selected`, `[aria-expanded]`, ...).
export const STATE_WORDS = new Set([
  'selected', 'active', 'disabled', 'current', 'open', 'expanded', 'checked', 'pressed', 'focused',
]);

const ATTRIBUTE_WORDS: Record<string, string> = {
  'aria-selected': 'selected',
  'aria-current': 'current',
  'aria-expanded': 'expanded',
  'aria-checked': 'checked',
  'aria-pressed': 'pressed',
  'aria-disabled': 'disabled',
  'data-active': 'active',
  'data-selected': 'selected',
  'data-open': 'open',
  open: 'open',
  checked: 'checked',
  selected: 'selected',
};

// aria-* attributes where `="false"` means "not in this state", so a `[aria-x="false"]` rule is no variant.
const BOOLEAN_ARIA = new Set(['aria-selected', 'aria-expanded', 'aria-checked', 'aria-pressed', 'aria-disabled', 'aria-current']);

export function stateWordOfClass(name: string): string | null {
  const word = name.toLowerCase().replace(/^(is|has)[-_]/, '');
  return STATE_WORDS.has(word) ? word : null;
}

export function stateWordOfAttribute(name: string, value: string): string | null {
  if (name === 'data-state') return STATE_WORDS.has(value.toLowerCase()) || value === 'on' ? value.toLowerCase() : null;
  return ATTRIBUTE_WORDS[name] ?? null;
}

function classifyState(token: SelectorToken): StateToken | null {
  if (token.kind === 'pseudo-class' && PSEUDO_STATES.has(token.name)) {
    return { type: 'pseudo', name: token.name as PseudoState };
  }

  if (token.kind === 'class' && stateWordOfClass(token.name)) {
    return { type: 'class', name: token.name };
  }

  if (token.kind === 'attribute' && token.attr) {
    const { operator, value } = token.attr;
    // `[disabled]` is the same state as `:disabled`, so both collapse into one variant.
    if (token.name === 'disabled' && !operator) return { type: 'pseudo', name: 'disabled' };

    if (!stateWordOfAttribute(token.name, value)) return null;
    if (token.name === 'data-state' && operator !== '=') return null;
    if (BOOLEAN_ARIA.has(token.name) && value === 'false') return null;

    const forced = operator === '=' ? value : BOOLEAN_ARIA.has(token.name) ? 'true' : '';
    return { type: 'attribute', name: token.name, value: forced };
  }

  return null;
}

// What is left of the subject after taking the state token out must still name something real,
// otherwise a bare `.active {}` or `:hover {}` rule would create a variant on every element.
function isRealSelector(token: SelectorToken): boolean {
  return ['class', 'id', 'attribute', 'tag', 'pseudo-class'].includes(token.kind);
}

function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

// Read from `cssText` rather than by indexing the declaration: Chrome reports empty strings for
// the longhands of any shorthand containing `var()` (`background: var(--x)`), which would make
// a forced state silently do nothing. `cssText` keeps the authored shorthand and its value.
function readDeclarations(style: CSSStyleDeclaration): VariantDeclaration[] {
  const out: VariantDeclaration[] = [];
  for (const part of splitTopLevel(style.cssText, ';')) {
    const colon = part.indexOf(':');
    if (colon < 1) continue;
    const rest = part.slice(colon + 1).trim();
    const important = /\s*!important$/i.test(rest);
    out.push({
      property: part.slice(0, colon).trim(),
      value: rest.replace(/\s*!important$/i, '').trim(),
      important,
    });
  }
  return out;
}

// What a rule contributes for a given selector, worked out once from the rule alone. Only the
// cheap matches() check depends on the element, so locking further elements re-uses this instead
// of re-parsing every selector on the page.
interface Candidate {
  selector: string;
  withoutState: string;
  state: StateToken;
}

const candidateCache = new WeakMap<CSSStyleRule, Candidate[]>();

function candidatesOf(rule: CSSStyleRule): Candidate[] {
  const cached = candidateCache.get(rule);
  if (cached) return cached;

  const candidates: Candidate[] = [];
  try {
    for (const selector of splitTopLevel(rule.selectorText)) {
      const { subjectStart, tokens } = parseSubject(selector);
      if (tokens.some((t) => t.kind === 'pseudo-element')) continue;

      // Exactly one state token in the subject: combined states (`.btn.active:hover`) are out of scope.
      const states = tokens.filter((t) => classifyState(t) !== null);
      if (states.length !== 1) continue;
      const stateToken = states[0];
      const state = classifyState(stateToken) as StateToken;

      if (!tokens.some((t) => t !== stateToken && isRealSelector(t))) continue;

      const subject = selector.slice(subjectStart);
      const withoutState =
        selector.slice(0, subjectStart) + subject.slice(0, stateToken.start) + subject.slice(stateToken.end);
      candidates.push({ selector, withoutState, state });
    }
  } catch {
    // A selector this scanner cannot make sense of is skipped; it must never abort the whole scan.
  }

  candidateCache.set(rule, candidates);
  return candidates;
}

function inspectStyleRule(el: Element, rule: CSSStyleRule, matches: StateMatch[]): void {
  for (const candidate of candidatesOf(rule)) {
    if (!safeMatches(el, candidate.withoutState)) continue;

    // Persistent states the element is already in are its resting state, not a variant. Transient
    // ones (hover/focus/active) are kept: the cursor is usually still over the element after a click.
    const { state } = candidate;
    const persistent = state.type !== 'pseudo' || state.name === 'disabled';
    if (persistent && safeMatches(el, candidate.selector)) continue;

    matches.push({ token: state, declarations: readDeclarations(rule.style) });
  }
}

interface Scan {
  el: Element;
  matches: StateMatch[];
  visited: Set<CSSStyleSheet>;
}

const MAX_NESTING = 24;

function walkRules(scan: Scan, rules: CSSRuleList, depth: number): void {
  if (depth > MAX_NESTING) return;

  for (const rule of Array.from(rules)) {
    // One odd rule (a getter that throws, a condition that will not parse) is skipped, not fatal.
    try {
      if (rule instanceof CSSStyleRule) {
        inspectStyleRule(scan.el, rule, scan.matches);
      } else if (rule instanceof CSSMediaRule) {
        if (window.matchMedia(rule.conditionText).matches) walkRules(scan, rule.cssRules, depth + 1);
      } else if (rule instanceof CSSSupportsRule) {
        if (CSS.supports(rule.conditionText)) walkRules(scan, rule.cssRules, depth + 1);
      } else if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) walkSheet(scan, rule.styleSheet, depth + 1);
      } else if (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule) {
        walkRules(scan, rule.cssRules, depth + 1);
      }
      // Keyframes, font-face, container queries (conditions can't be evaluated) and the like are skipped.
    } catch (error) {
      console.debug('[PixelPeek] Skipped a stylesheet rule it could not read', error);
    }
  }
}

function walkSheet(scan: Scan, sheet: CSSStyleSheet, depth: number): void {
  // @import cycles would otherwise recurse forever.
  if (scan.visited.has(sheet)) return;
  scan.visited.add(sheet);

  if (sheet.disabled) return;
  if (sheet.media.length && !window.matchMedia(sheet.media.mediaText).matches) return;

  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    // Cross-origin stylesheets throw a SecurityError. Detect fewer variants rather than fail.
    return;
  }
  walkRules(scan, rules, depth);
}

// Every rule that targets the element itself in a pseudo-class or state-class/attribute state,
// in document order. Rules that only reach it through a parent's state (`.card:hover .btn`) are ignored.
export function scanVariantRules(el: Element): StateMatch[] {
  const root = el.getRootNode() as Document | ShadowRoot;
  const scan: Scan = { el, matches: [], visited: new Set() };
  for (const sheet of getReadableSheets(root).sheets) walkSheet(scan, sheet, 0);
  return scan.matches;
}
