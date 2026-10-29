import { HOST_ID } from './shadow-root';

// While PixelPeek is active the page has to stay exactly as it was when the tool was switched
// on, so PixelPeek behaves like an inspector cursor rather than another visitor: clicking a link
// must not navigate, clicking a button must not fire, hover menus must not open.
//
// Listening on `window` in the capture phase puts this ahead of the page's own handlers on
// elements and on `document` (React and most frameworks listen there). Events that land on
// PixelPeek's own UI are left alone; the panel stops them from bubbling on its own.

// Cancelled and stopped for good: nothing else needs these.
const BLOCKED = [
  'click', 'dblclick', 'auxclick', 'contextmenu',
  'mousedown', 'pointerdown', 'touchstart', 'touchend',
  'submit', 'dragstart',
  'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
  'pointerover', 'pointerout', 'pointerenter', 'pointerleave',
];

// Hidden from the page but not from other window-level listeners: PixelPeek's own drag handling
// listens for these on `window` too, and stopImmediatePropagation would starve it.
const HIDDEN_FROM_PAGE = ['mousemove', 'pointermove', 'mouseup', 'pointerup'];

function isOwnUi(e: Event): boolean {
  // A click inside our closed shadow root is retargeted to the host at window level.
  return (e.target as Element | null)?.id === HOST_ID;
}

export class PageGuard {
  private blockHard = (e: Event): void => {
    if (isOwnUi(e)) return;
    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();
  };

  private blockSoft = (e: Event): void => {
    if (isOwnUi(e)) return;
    e.stopPropagation();
  };

  // Must be constructed after the Picker so the picker's own window-level listeners run first.
  constructor() {
    for (const type of BLOCKED) window.addEventListener(type, this.blockHard, { capture: true });
    for (const type of HIDDEN_FROM_PAGE) window.addEventListener(type, this.blockSoft, { capture: true });
  }

  destroy(): void {
    for (const type of BLOCKED) window.removeEventListener(type, this.blockHard, { capture: true });
    for (const type of HIDDEN_FROM_PAGE) window.removeEventListener(type, this.blockSoft, { capture: true });
  }
}
