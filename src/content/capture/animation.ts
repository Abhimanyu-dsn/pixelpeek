import { splitTopLevel } from './color';
import { getReadableSheets } from '../variants/sheets';

export interface TransitionInfo {
  property: string;
  duration: string;
  easing: string;
  delay: string;
}

export interface AnimationRun {
  name: string;
  duration: string;
  easing: string;
  delay: string;
  iterations: string;
  direction: string;
  fill: string;
}

export interface KeyframesInfo {
  name: string;
  steps: { offset: string; css: string }[];
}

export interface AnimationInfo {
  transitions: TransitionInfo[];
  animations: AnimationRun[];
  keyframes: KeyframesInfo[];
}

const list = (value: string): string[] => splitTopLevel(value).map((v) => v.trim());
// CSS repeats the shorter lists to match the longest, e.g. one duration for three properties.
const at = (values: string[], i: number): string => values[i % values.length] ?? '';

const keyframeCache = new Map<string, KeyframesInfo | null>();

function findKeyframes(name: string, rules: CSSRuleList, depth = 0): KeyframesInfo | null {
  if (depth > 6) return null;
  for (const rule of Array.from(rules)) {
    try {
      if (rule instanceof CSSKeyframesRule && rule.name === name) {
        return {
          name,
          steps: Array.from(rule.cssRules).map((step) => {
            const frame = step as CSSKeyframeRule;
            return { offset: frame.keyText, css: frame.style.cssText.trim() };
          }),
        };
      }
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested && (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule)) {
        const found = findKeyframes(name, nested, depth + 1);
        if (found) return found;
      }
    } catch {
      /* an unreadable rule is skipped */
    }
  }
  return null;
}

function keyframesFor(name: string): KeyframesInfo | null {
  if (keyframeCache.has(name)) return keyframeCache.get(name) ?? null;
  let found: KeyframesInfo | null = null;
  for (const sheet of getReadableSheets(document).sheets) {
    try {
      found = findKeyframes(name, sheet.cssRules);
    } catch {
      continue;
    }
    if (found) break;
  }
  // Only cache hits: the sheet that defines it may not have been downloaded yet.
  if (found) keyframeCache.set(name, found);
  return found;
}

export function readAnimation(style: CSSStyleDeclaration): AnimationInfo | undefined {
  const transitions: TransitionInfo[] = [];
  const properties = list(style.transitionProperty);
  const durations = list(style.transitionDuration);
  const easings = list(style.transitionTimingFunction);
  const delays = list(style.transitionDelay);
  properties.forEach((property, i) => {
    const duration = at(durations, i);
    if (property === 'none' || parseFloat(duration) === 0 && parseFloat(at(delays, i)) === 0) return;
    transitions.push({ property, duration, easing: at(easings, i), delay: at(delays, i) });
  });

  const animations: AnimationRun[] = [];
  const keyframes: KeyframesInfo[] = [];
  const names = list(style.animationName);
  names.forEach((name, i) => {
    if (name === 'none') return;
    animations.push({
      name,
      duration: at(list(style.animationDuration), i),
      easing: at(list(style.animationTimingFunction), i),
      delay: at(list(style.animationDelay), i),
      iterations: at(list(style.animationIterationCount), i),
      direction: at(list(style.animationDirection), i),
      fill: at(list(style.animationFillMode), i),
    });
    const frames = keyframesFor(name);
    if (frames) keyframes.push(frames);
  });

  if (!transitions.length && !animations.length) return undefined;
  return { transitions, animations, keyframes };
}
