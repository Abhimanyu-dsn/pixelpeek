import type { DetectedVariant } from '../types';

type Undo = () => void;

// Forces one of the locked element's states onto the real page element, and puts everything back.
//
// A forced state left stuck on the page is the outcome to avoid, so every change is recorded in
// an undo log holding the original value of exactly what was touched. Reverting replays that
// log in reverse, and only touches a value if it is still what we set: if the page changed
// something itself in the meantime (a framework re-rendering `className`), that change wins
// instead of being overwritten by a stale snapshot.
export class VariantForcer {
  private el: HTMLElement | null = null;
  private originalAttributes = new Map<string, string>();
  private undoLog: Undo[] = [];
  private appliedId: string | null = null;

  get activeVariantId(): string | null {
    return this.appliedId;
  }

  // Called on lock, before anything is forced: records the element's attributes as they were.
  attach(el: Element): void {
    this.release();
    if (!(el instanceof HTMLElement)) return;
    this.el = el;
    this.originalAttributes = new Map(Array.from(el.attributes, (a) => [a.name, a.value]));
  }

  apply(variant: DetectedVariant): void {
    const el = this.el;
    if (!el) return;
    this.revert();

    // Transitions would leave computed values part-way to the forced state when we read them.
    this.setInline(el, 'transition', 'none', true);
    void el.offsetWidth;

    switch (variant.kind) {
      case 'focus':
        this.forceFocus(el, variant);
        break;
      case 'disabled':
        this.setAttribute(el, 'disabled', '');
        break;
      case 'class':
        if (variant.token?.type === 'class') this.addClass(el, variant.token.name);
        break;
      case 'attribute':
        if (variant.token?.type === 'attribute') this.setAttribute(el, variant.token.name, variant.token.value);
        break;
      default:
        // Hover and Active cannot be forced for real from a script, so their declared
        // properties are applied as inline styles instead.
        this.applyDeclarations(el, variant);
    }

    this.appliedId = variant.id;
  }

  revert(): void {
    const el = this.el;
    for (const undo of this.undoLog.reverse()) undo();
    this.undoLog = [];
    this.appliedId = null;
    if (el) this.restoreAttributes(el);
  }

  // Reverts, then forgets the element. Safe to call at any time, including with nothing attached.
  release(): void {
    this.revert();
    this.el = null;
    this.originalAttributes = new Map();
  }

  private setInline(el: HTMLElement, property: string, value: string, important: boolean): void {
    const previousValue = el.style.getPropertyValue(property);
    const previousPriority = el.style.getPropertyPriority(property);
    el.style.setProperty(property, value, important ? 'important' : '');
    const applied = el.style.getPropertyValue(property);

    this.undoLog.push(() => {
      if (el.style.getPropertyValue(property) !== applied) return;
      if (previousValue === '') el.style.removeProperty(property);
      else el.style.setProperty(property, previousValue, previousPriority);
    });
  }

  private applyDeclarations(el: HTMLElement, variant: DetectedVariant): void {
    for (const declaration of variant.declarations) {
      this.setInline(el, declaration.property, declaration.value, declaration.important);
    }
  }

  private setAttribute(el: HTMLElement, name: string, value: string): void {
    const previous = el.getAttribute(name);
    el.setAttribute(name, value);
    const applied = el.getAttribute(name);

    this.undoLog.push(() => {
      if (el.getAttribute(name) !== applied) return;
      if (previous === null) el.removeAttribute(name);
      else el.setAttribute(name, previous);
    });
  }

  private addClass(el: HTMLElement, name: string): void {
    if (el.classList.contains(name)) return;
    el.classList.add(name);
    this.undoLog.push(() => el.classList.remove(name));
  }

  private forceFocus(el: HTMLElement, variant: DetectedVariant): void {
    const previouslyFocused = document.activeElement;
    if (previouslyFocused === el) return;

    el.focus({ preventScroll: true });

    if (document.activeElement !== el) {
      // Not focusable (a plain div), so the :focus rule can only be shown by applying its properties.
      this.applyDeclarations(el, variant);
      return;
    }

    this.undoLog.push(() => {
      if (document.activeElement === el) el.blur();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused !== document.body) {
        previouslyFocused.focus({ preventScroll: true });
      }
    });
  }

  // Undoing through the CSSOM (classList, style.setProperty) makes Chrome re-serialise the whole
  // attribute: `style="margin-left: 5px"` comes back as `style="margin-left: 5px;"`, and an
  // attribute that did not exist is left behind empty. Put the original text back so the markup
  // is exactly as it was, but only when the current value is equivalent to the original, so a
  // real change made by the page in the meantime is never overwritten.
  private restoreAttributes(el: HTMLElement): void {
    this.restoreAttribute(el, 'class', (text) => text.split(/\s+/).filter(Boolean).join(' '));
    this.restoreAttribute(el, 'style', (text) => {
      const probe = document.createElement('span');
      probe.style.cssText = text;
      return probe.getAttribute('style') ?? '';
    });
  }

  private restoreAttribute(el: HTMLElement, name: string, normalize: (text: string) => string): void {
    const original = this.originalAttributes.get(name);
    const current = el.getAttribute(name);
    if (current === original) return;

    if (original === undefined) {
      if (current === '') el.removeAttribute(name);
      return;
    }
    if (current !== null && normalize(current) === normalize(original)) el.setAttribute(name, original);
  }
}
