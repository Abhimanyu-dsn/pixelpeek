import { HOST_ID } from './shadow-root';

export interface PickerCallbacks {
  onLock: (el: Element) => void;
  onUnlock: () => void;
  onDeactivate: () => void;
  // First click outside the locked element/panel; a second such click closes.
  onOutsideClick?: () => void;
  // The element under the pointer while nothing is locked; null when there is none.
  onHover?: (el: Element | null) => void;
  // The page started or stopped scrolling.
  onScrolling?: (on: boolean) => void;
  // F (Figma) or S (save) pressed while an element is hovered and nothing is selected.
  onHoverKey?: (key: 'figma' | 'save', el: Element) => void;
  // Return true when Esc was used for something smaller than closing (e.g. a preview that is open).
  onEscape?: () => boolean;
}

const IGNORED_TAGS = new Set(['HTML', 'BODY']);

export class Picker {
  private root: ShadowRoot;
  private callbacks: PickerCallbacks;
  private outline: HTMLDivElement;
  private chip: HTMLDivElement;

  private hovered: Element | null = null;
  private locked: Element | null = null;
  private rafPending = false;
  private lastMouseEvent: MouseEvent | null = null;
  private scrollRafPending = false;
  private outsideClickCount = 0;
  private measureEls: HTMLElement[] = [];
  private enabled = true;
  private scrolling = false;
  private scrollTimer = 0;

  constructor(root: ShadowRoot, callbacks: PickerCallbacks) {
    this.root = root;
    this.callbacks = callbacks;

    this.outline = document.createElement('div');
    this.outline.className = 'pixelpeek-outline';
    this.outline.style.display = 'none';

    this.chip = document.createElement('div');
    this.chip.className = 'pixelpeek-chip';
    this.chip.style.display = 'none';

    this.root.appendChild(this.outline);
    this.root.appendChild(this.chip);

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onScrollOrResize = this.onScrollOrResize.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);

    // Window capture, so these run before the PageGuard (built after this) hides the events from the page.
    window.addEventListener('mousemove', this.onMouseMove, true);
    window.addEventListener('click', this.onClick, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('keyup', this.onKeyUp, true);
    // capture: true so scrolling inside a nested scroll container is caught too, not just the window.
    document.addEventListener('scroll', this.onScrollOrResize, true);
    window.addEventListener('resize', this.onScrollOrResize);
  }

  destroy(): void {
    window.removeEventListener('mousemove', this.onMouseMove, true);
    window.removeEventListener('click', this.onClick, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('keyup', this.onKeyUp, true);
    clearTimeout(this.scrollTimer);
    this.clearMeasure();
    document.removeEventListener('scroll', this.onScrollOrResize, true);
    window.removeEventListener('resize', this.onScrollOrResize);
    this.outline.remove();
    this.chip.remove();
  }

  // Called by the panel's close button and by Esc: fully exits PixelPeek, same as toggling
  // the toolbar icon off. A double outside-click is deliberately different — that only
  // unlocks (see onClick) so the user can keep picking without leaving the page.
  closeExtension(): void {
    this.callbacks.onDeactivate();
  }

  // Drops the current lock, e.g. when a page-wide tool takes over the screen.
  release(): void {
    if (this.locked) this.unlock();
  }

  // Inspecting off: no hover outline, no locking. The page stays frozen either way.
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.hovered = null;
      this.callbacks.onHover?.(null);
      if (this.locked) this.unlock();
      this.outline.style.display = 'none';
      this.chip.style.display = 'none';
      this.clearMeasure();
    }
  }

  // Redraws the outline around the locked element, e.g. after a forced state changed its size.
  refresh(): void {
    if (this.locked) this.drawOutline(this.locked, true);
  }

  private isOwnElement(el: Element | null): boolean {
    return el?.id === HOST_ID;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.enabled) return;
    // While the page scrolls, Chrome keeps sending mouse moves as new content slides under a still
    // pointer. Following them would make the highlight hop from element to element.
    if (this.scrolling) return;
    if (this.locked) {
      // Holding Alt over another element measures the space between it and the locked one.
      if (e.altKey) this.measureTo(e.clientX, e.clientY);
      else this.clearMeasure();
      return;
    }
    this.lastMouseEvent = e;
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (!this.lastMouseEvent) return;
      const target = document.elementFromPoint(this.lastMouseEvent.clientX, this.lastMouseEvent.clientY);
      if (target && !this.isOwnElement(target) && !IGNORED_TAGS.has(target.tagName)) {
        this.setHovered(target);
      }
    });
  }

  private onClick(e: MouseEvent): void {
    if (!this.enabled) return;
    const target = e.target as Element;

    if (this.locked) {
      // A closed shadow root retargets `target` to the host for any click inside our own UI
      // (panel, overlay), so this check also covers the panel without hit-testing its DOM.
      if (this.isOwnElement(target)) {
        this.outsideClickCount = 0;
        return;
      }
      if (target === this.locked || this.locked.contains(target)) {
        this.outsideClickCount = 0;
        return;
      }
      this.outsideClickCount++;
      if (this.outsideClickCount === 1) {
        this.pulsePanel();
      } else {
        this.outsideClickCount = 0;
        this.unlock();
      }
      return;
    }

    if (this.isOwnElement(target)) return;
    if (!this.hovered) return;
    e.preventDefault();
    e.stopPropagation();
    this.lock(this.hovered);
  }

  private pulsePanel(): void {
    this.callbacks.onOutsideClick?.();
  }

  private onScrollOrResize(): void {
    if (!this.scrolling) {
      this.scrolling = true;
      this.callbacks.onScrolling?.(true);
    }
    clearTimeout(this.scrollTimer);
    this.scrollTimer = window.setTimeout(() => {
      this.scrolling = false;
      this.callbacks.onScrolling?.(false);
    }, 180);

    if (this.scrollRafPending) return;
    this.scrollRafPending = true;
    requestAnimationFrame(() => {
      this.scrollRafPending = false;
      // The outline stays glued to the same element while it moves.
      const target = this.locked ?? this.hovered;
      if (target && this.enabled) this.drawOutline(target, !!this.locked);
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Esc always exits, even while just hovering with nothing locked yet.
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!this.callbacks.onEscape?.()) this.closeExtension();
      return;
    }

    if (!this.locked && this.enabled && this.hovered && !e.ctrlKey && !e.metaKey && !e.altKey && !this.isOwnElement(e.target as Element | null)) {
      const key = e.key.toLowerCase() === 'f' ? 'figma' : e.key.toLowerCase() === 's' ? 'save' : null;
      if (key) {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.onHoverKey?.(key, this.hovered);
        return;
      }
    }

    if (!this.locked || !this.enabled) return;

    switch (e.key) {
      case 'ArrowUp': {
        const parent = this.locked.parentElement;
        if (parent && !IGNORED_TAGS.has(parent.tagName)) {
          e.preventDefault();
          e.stopPropagation();
          this.lock(parent);
        }
        return;
      }
      case 'ArrowDown': {
        const child = this.locked.children[0];
        if (child) {
          e.preventDefault();
          e.stopPropagation();
          this.lock(child);
        }
        return;
      }
      case 'ArrowLeft': {
        const prev = this.locked.previousElementSibling;
        if (prev) {
          e.preventDefault();
          e.stopPropagation();
          this.lock(prev);
        }
        return;
      }
      case 'ArrowRight': {
        const next = this.locked.nextElementSibling;
        if (next) {
          e.preventDefault();
          e.stopPropagation();
          this.lock(next);
        }
        return;
      }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Alt') this.clearMeasure();
  }

  private clearMeasure(): void {
    for (const el of this.measureEls) el.remove();
    this.measureEls = [];
  }

  private measureTo(x: number, y: number): void {
    this.clearMeasure();
    const locked = this.locked;
    const target = document.elementFromPoint(x, y);
    if (!locked || !target || this.isOwnElement(target) || target === locked || IGNORED_TAGS.has(target.tagName)) return;

    const a = locked.getBoundingClientRect();
    const b = target.getBoundingClientRect();

    const box = document.createElement('div');
    box.className = 'pixelpeek-measure-box';
    Object.assign(box.style, { top: `${b.top}px`, left: `${b.left}px`, width: `${b.width}px`, height: `${b.height}px` });
    this.root.appendChild(box);
    this.measureEls.push(box);

    const line = (x1: number, y1: number, x2: number, y2: number, label: number): void => {
      if (label <= 0) return;
      const horizontal = y1 === y2;
      const el = document.createElement('div');
      el.className = 'pixelpeek-measure-line';
      Object.assign(el.style, horizontal
        ? { left: `${Math.min(x1, x2)}px`, top: `${y1}px`, width: `${Math.abs(x2 - x1)}px`, height: '1px' }
        : { left: `${x1}px`, top: `${Math.min(y1, y2)}px`, width: '1px', height: `${Math.abs(y2 - y1)}px` });
      const tag = document.createElement('div');
      tag.className = 'pixelpeek-measure-label';
      tag.textContent = `${Math.round(label)}`;
      Object.assign(tag.style, { left: `${(x1 + x2) / 2}px`, top: `${(y1 + y2) / 2}px` });
      this.root.append(el, tag);
      this.measureEls.push(el, tag);
    };

    // Across the gap on each axis; where the boxes overlap on an axis, the distance between their edges.
    const midY = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    const midX = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    const yMid = Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom) ? midY : (a.top + a.bottom) / 2;
    const xMid = Math.max(a.left, b.left) < Math.min(a.right, b.right) ? midX : (a.left + a.right) / 2;

    if (b.left >= a.right) line(a.right, yMid, b.left, yMid, b.left - a.right);
    else if (a.left >= b.right) line(b.right, yMid, a.left, yMid, a.left - b.right);
    else {
      line(Math.min(a.left, b.left), yMid, Math.max(a.left, b.left), yMid, Math.abs(a.left - b.left));
      line(Math.min(a.right, b.right), yMid, Math.max(a.right, b.right), yMid, Math.abs(a.right - b.right));
    }
    if (b.top >= a.bottom) line(xMid, a.bottom, xMid, b.top, b.top - a.bottom);
    else if (a.top >= b.bottom) line(xMid, b.bottom, xMid, a.top, a.top - b.bottom);
    else {
      line(xMid, Math.min(a.top, b.top), xMid, Math.max(a.top, b.top), Math.abs(a.top - b.top));
      line(xMid, Math.min(a.bottom, b.bottom), xMid, Math.max(a.bottom, b.bottom), Math.abs(a.bottom - b.bottom));
    }
  }

  private setHovered(el: Element): void {
    this.hovered = el;
    this.callbacks.onHover?.(el);
    this.drawOutline(el, false);
  }

  private lock(el: Element): void {
    this.locked = el;
    this.hovered = el;
    this.callbacks.onHover?.(null);
    this.outsideClickCount = 0;
    this.drawOutline(el, true);
    this.callbacks.onLock(el);
  }

  private unlock(): void {
    this.locked = null;
    this.hovered = null;
    this.callbacks.onHover?.(null);
    this.clearMeasure();
    this.outline.style.display = 'none';
    this.chip.style.display = 'none';
    this.callbacks.onUnlock();
  }

  private drawOutline(el: Element, isLocked: boolean): void {
    const rect = el.getBoundingClientRect();

    this.outline.style.display = 'block';
    this.outline.className = 'pixelpeek-outline' + (isLocked ? ' locked' : '');
    this.outline.style.top = `${rect.top}px`;
    this.outline.style.left = `${rect.left}px`;
    this.outline.style.width = `${rect.width}px`;
    this.outline.style.height = `${rect.height}px`;

    this.chip.style.display = 'block';
    this.chip.className = 'pixelpeek-chip' + (isLocked ? ' locked' : '');
    this.chip.textContent = `${el.tagName.toLowerCase()} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    const chipTop = rect.top > 20 ? rect.top - 20 : rect.bottom + 4;
    this.chip.style.top = `${chipTop}px`;
    this.chip.style.left = `${rect.left}px`;
  }
}
