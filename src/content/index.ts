import { createShadowRoot, destroyShadowRoot } from './shadow-root';
import { Picker } from './picker';
import { captureElement } from './capture';
import { Overlay } from './panel/Overlay';
import { LocalBackend } from './panel/local-backend';
import { PageGuard } from './page-guard';
import { DevicePreview } from './devices/preview';
import { GuideOverlay } from './guides';
import { HoverCard } from './panel/HoverCard';
import { buildFigmaSvg } from './figma/to-svg';
import { saveElement } from './library/store';
import { copyToClipboard } from './panel/copy';
import { prefetchStylesheets } from './variants/sheets';

declare global {
  interface Window {
    __pixelpeekActive?: boolean;
    __pixelpeekTeardown?: () => void;
  }
}

interface ActiveState {
  picker: Picker;
  overlay: Overlay;
  preview: DevicePreview;
  guides: GuideOverlay;
  hover: HoverCard;
  guard: PageGuard;
}

let active: ActiveState | undefined;

// While the device preview is open, only the preview scrolls: the page behind it is held still, so a
// wheel or swipe that reaches the end of the phone's own scrolling does not carry on into the site.
let savedOverflow: { html: string; body: string } | null = null;
function setPageScrollLocked(on: boolean): void {
  const html = document.documentElement;
  const body = document.body;
  if (on && !savedOverflow) {
    savedOverflow = { html: html.style.overflow, body: body?.style.overflow ?? '' };
    html.style.overflow = 'hidden';
    if (body) body.style.overflow = 'hidden';
  } else if (!on && savedOverflow) {
    html.style.overflow = savedOverflow.html;
    if (body) body.style.overflow = savedOverflow.body;
    savedOverflow = null;
  }
}

function activate(): void {
  window.__pixelpeekActive = true;
  const { root } = createShadowRoot();
  let locked: Element | null = null;
  let hovered: Element | null = null;
  let guidesOn = false;

  const backend = new LocalBackend(() => locked);
  const guides = new GuideOverlay(root);
  const hover = new HoverCard(root);

  // Margin and padding are drawn on the selected element, or on whatever is under the pointer.
  const refreshGuides = (): void => {
    const target = locked ?? hovered;
    if (guidesOn && target) guides.show(target);
    else guides.hide();
  };
  const preview = new DevicePreview(root, {
    onOpenWindow: (width, height) => {
      // A real, resized browser window, for sites that refuse to be shown inside a frame.
      if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
        void chrome.runtime.sendMessage({ pp: 'open-window', url: location.href, width, height }).catch(() => {});
      }
    },
    onClose: () => {},
    onVisibility: (open) => {
      setPageScrollLocked(open);
      picker.setPaused(open);
      if (open) hover.hide();
    },
    // The background script attaches Chrome's emulation to this tab (user agent, touch-style hover and pointer).
    emulate: async (spec) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return { ok: false, error: 'not available here' };
      try {
        const reply = (await chrome.runtime.sendMessage({ pp: 'emulate', spec })) as { ok: boolean; error?: string } | undefined;
        return reply ?? { ok: false, error: 'no answer from the extension' };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message.slice(0, 100) : 'failed' };
      }
    },
  });

  // Builds Figma layers for an element and puts them on the clipboard.
  const copyFigmaFor = async (el: Element): Promise<string> => {
    const result = await buildFigmaSvg(el, 'element');
    await copyToClipboard(result.svg);
    return `Copied ${result.layers} layer${result.layers === 1 ? '' : 's'} ✓`;
  };

  const overlay = new Overlay(root, backend, {
    onInspectToggle: (on) => picker.setEnabled(on),
    onDeselect: () => picker.release(),
    onFigmaElement: () => {
      if (!locked) return Promise.reject(new Error('Select an element first.'));
      return buildFigmaSvg(locked, 'element');
    },
    onFigmaHovered: async () => {
      const el = locked ?? hovered;
      if (!el) return 'Hover or select an element first';
      return copyFigmaFor(el);
    },
    onSaveElement: async (capture) => {
      await saveElement(capture, { url: location.href, title: document.title });
    },
    onGuides: (on) => {
      guidesOn = on;
      refreshGuides();
    },
    onOpenDevice: (device) => preview.open(device),
    onExit: () => picker.closeExtension(),
  });

  const picker = new Picker(root, {
    onLock: (el) => {
      locked = el;
      hover.hide();
      overlay.setCapture(captureElement(el));
      refreshGuides();
    },
    onUnlock: () => {
      locked = null;
      overlay.setCapture(null);
      refreshGuides();
    },
    onScrolling: (on) => {
      // The card would trail behind the element; it comes back when the page stops.
      if (on) hover.hide();
      else if (hovered && !locked) hover.show(hovered);
    },
    onHoverKey: (key, el) => {
      if (key === 'save') {
        saveElement(captureElement(el), { url: location.href, title: document.title })
          .then(() => hover.flash('Saved ✓'))
          .catch(() => hover.flash('Could not save'));
        return;
      }
      hover.flash('Building Figma layers…');
      copyFigmaFor(el)
        .then((message) => hover.flash(message))
        .catch(() => hover.flash('Could not copy: press F again'));
    },
    onHover: (el) => {
      hovered = el;
      if (el && !locked) hover.show(el);
      else hover.hide();
      refreshGuides();
    },
    onDeactivate: deactivate,
    // The first Esc closes an open device preview; another one closes PixelPeek.
    onEscape: () => {
      if (!preview.isOpen) return false;
      preview.close();
      return true;
    },
  });

  // Start reading cross-origin stylesheets now so fonts, keyframes and components are ready when asked for.
  void prefetchStylesheets(document);

  // Built after the Picker on purpose: its window-level listeners must run before the guard blocks the events.
  const guard = new PageGuard();

  active = { picker, overlay, preview, guides, hover, guard };
}

function deactivate(): void {
  window.__pixelpeekActive = false;
  if (active) {
    active.guard.destroy();
    active.picker.destroy();
    active.guides.destroy();
    active.hover.destroy();
    active.preview.destroy();
    active.overlay.destroy();
  }
  active = undefined;
  destroyShadowRoot();
}

// A second injection (toolbar click while active) arrives as a fresh script instance, so the
// shared flag lives on window; the previous instance's teardown is reachable via a window hook.
if (window.__pixelpeekActive) {
  window.__pixelpeekTeardown?.();
} else {
  activate();
  window.__pixelpeekTeardown = deactivate;
}
