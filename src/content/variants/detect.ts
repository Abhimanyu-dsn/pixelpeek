import type { DetectedVariant, VariantDeclaration, VariantKind } from '../types';
import { scanVariantRules, stateWordOfAttribute, stateWordOfClass } from './scanner';
import type { StateMatch, StateToken } from './scanner';

const KIND_ORDER: VariantKind[] = ['hover', 'focus', 'active', 'disabled', 'class', 'attribute'];

function variantId(token: StateToken): string {
  switch (token.type) {
    case 'pseudo': return `pseudo:${token.name}`;
    case 'class': return `class:${token.name}`;
    case 'attribute': return `attr:${token.name}=${token.value}`;
  }
}

function kindOf(token: StateToken): VariantKind {
  return token.type === 'pseudo' ? token.name : token.type;
}

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

// `:hover` -> "Hover", `.is-active` -> "Active", `[aria-selected]` -> "Selected".
function baseLabel(token: StateToken): string {
  switch (token.type) {
    case 'pseudo':
      return capitalize(token.name);
    case 'class':
      return capitalize(stateWordOfClass(token.name) ?? token.name);
    case 'attribute':
      return capitalize(stateWordOfAttribute(token.name, token.value) ?? token.name);
  }
}

function suffix(token: StateToken): string {
  return token.type === 'class' ? `.${token.name}` : token.type === 'attribute' ? `[${token.name}]` : '';
}

// Later rules override earlier ones for the same property (document order, no specificity model).
function mergeDeclarations(matches: StateMatch[]): VariantDeclaration[] {
  const merged = new Map<string, VariantDeclaration>();
  for (const match of matches) {
    for (const declaration of match.declarations) {
      merged.delete(declaration.property);
      merged.set(declaration.property, declaration);
    }
  }
  return Array.from(merged.values());
}

export function detectVariants(el: Element): DetectedVariant[] {
  const grouped = new Map<string, StateMatch[]>();
  for (const match of scanVariantRules(el)) {
    const id = variantId(match.token);
    const list = grouped.get(id);
    if (list) list.push(match);
    else grouped.set(id, [match]);
  }

  const variants: DetectedVariant[] = Array.from(grouped, ([id, matches]) => {
    const token = matches[0].token;
    const variant: DetectedVariant = {
      id,
      label: baseLabel(token),
      kind: kindOf(token),
      declarations: mergeDeclarations(matches),
    };
    if (token.type !== 'pseudo') variant.token = token;
    return variant;
  });

  // Stable order: the four pseudo-class states first, then class states, then attribute states;
  // ties keep the order they were first found in the stylesheets.
  variants.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

  // Two variants can share a label (`:active` and `.active`); the later one gets its token appended.
  const seen = new Set<string>();
  for (const variant of variants) {
    if (seen.has(variant.label)) {
      const token: StateToken = variant.token ?? { type: 'pseudo', name: variant.kind as 'hover' };
      variant.label = `${variant.label} (${suffix(token)})`;
    }
    seen.add(variant.label);
  }

  return variants;
}
