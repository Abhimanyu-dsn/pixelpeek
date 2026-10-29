import type { ContrastInfo } from './scan/contrast';
import type { AnimationInfo } from './capture/animation';
import type { InsideColor } from './scan/element-colors';

export type EdgeValues = { top: number; right: number; bottom: number; left: number };

export interface ShadowLayer {
  type: 'Drop' | 'Inner';
  x: string;
  y: string;
  blur: string;
  spread: string;
  color: string;
}

export interface GradientStop {
  color: string;
  position?: string;
}

export interface GradientLayer {
  type: 'Linear' | 'Radial' | 'Other';
  angle?: string;
  stops: GradientStop[];
  raw: string;
}

export interface VariantsResult {
  variants: DetectedVariant[];
  // Stylesheets that could not be read (blocked cross-origin CSS), so some states may be missing.
  unreadableSheets: number;
}

export interface StrokeSide {
  width: string;
  style: string;
  color: string;
}

export type ResizeMode = 'Fixed' | 'Hug' | 'Fill';

export interface VariantDeclaration {
  property: string;
  value: string;
  important: boolean;
}

export type VariantKind = 'hover' | 'focus' | 'active' | 'disabled' | 'class' | 'attribute';

// A state of the locked element found in the page's CSS (e.g. its :hover rules, or a `.active` class variant).
export interface DetectedVariant {
  // Stable per element, e.g. "pseudo:hover", "class:is-active", "attr:aria-selected=true".
  id: string;
  label: string;
  kind: VariantKind;
  // Present for class/attribute variants: the token that has to be toggled to force the state.
  token?: { type: 'class'; name: string } | { type: 'attribute'; name: string; value: string };
  // Aggregated from every matching rule in document order (a later rule's value wins).
  declarations: VariantDeclaration[];
}

export interface AutoLayout {
  direction: string;
  gap: string;
  align: string;
  distribute: string;
  padding: EdgeValues;
}

export interface ElementCapture {
  id: string;
  selector: string;
  tagName: string;
  domPath: string[];
  // The element's own visible text, trimmed; used by the AI prompt.
  text?: string;

  layout: {
    typography?: {
      fontFamily: string;
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
      color: string;
      letterSpacing: string;
      textAlign: string;
      textDecoration: string;
      textTransform: string;
      truncation: string;
      // No CSS equivalent; approximated from margin-bottom on block text.
      paragraphSpacing?: string;
    };
    colors: {
      role: 'background' | 'text' | 'border' | 'accent';
      value: string;
    }[];
    // Every colour in the element and everything inside it, most used first.
    palette: InsideColor[];
    // Text colour against the colour actually behind it; absent for elements with no text of their own.
    contrast?: ContrastInfo;
    fills: GradientLayer[];
    stroke?: {
      top: StrokeSide;
      right: StrokeSide;
      bottom: StrokeSide;
      left: StrokeSide;
    };
    cornerRadius: {
      topLeft: string;
      topRight: string;
      bottomRight: string;
      bottomLeft: string;
    };
    effects: {
      opacity?: string;
      shadows: ShadowLayer[];
    };
    boxModel: {
      margin: EdgeValues;
      border: EdgeValues;
      padding: EdgeValues;
      content: { width: number; height: number };
    };
    position: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
    // Relative to the parent's padding box, not the page.
    offset: { x: number; y: number };
    rotation?: string;
    display: string;
    parentContext?: {
      display: string;
      direction?: string;
      gap?: string;
      childIndex?: string;
    };
    autoLayout?: AutoLayout;
    resize: { width: ResizeMode; height: ResizeMode };
    siblingSpacing?: { previous?: string; next?: string };
    // Transitions and animations the element runs, with the keyframes it can read.
    animation?: AnimationInfo;
    // Tailwind utilities that reproduce the element.
    tailwind: string[];
    rawCss: string[];
  };
}
