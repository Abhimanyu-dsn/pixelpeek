// The floating tool pill: a small frosted-glass dot that opens into a vertical stack of the four tools
// when the pointer is over it. It can be dragged anywhere; the spot is remembered.

import { LOGO_URL } from './logo';

export type PillTool = 'inspect' | 'devices' | 'saved' | 'figma';

export interface PillCallbacks {
  onTool: (tool: PillTool) => void;
}

const STORAGE_KEY = 'pp-pill-pos';
const SIZE = 40;
const MARGIN = 8;
const CLOSE_DELAY = 250;
const DRAG_THRESHOLD = 4;

const icon = (body: string): string =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const FIGMA_LOGO = '<svg width="12" height="18" viewBox="0 0 38 57" aria-hidden="true"><path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE"/><path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83"/><path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262"/><path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E"/><path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#A259FF"/></svg>';

export const TOOLS: { id: PillTool; label: string; short: string; desc: string; svg: string }[] = [
  { id: 'inspect', label: 'Inspect elements', short: 'Inspect', desc: 'Hover any element to read its styles. Click it to select it.', svg: icon('<path d="M4 4l7 17 2.5-7.5L21 11z"/>') },
  { id: 'devices', label: 'Responsive preview', short: 'Responsive', desc: 'See this page inside phone, tablet and desktop frames.', svg: icon('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>') },
  { id: 'saved', label: 'Saved', short: 'Saved', desc: 'Elements you saved, kept on this computer.', svg: icon('<path d="M6 3h12v18l-6-4-6 4z"/>') },
  { id: 'figma', label: 'Copy to Figma', short: 'Figma', desc: 'Copies the selected element, or the one under your pointer, as editable Figma layers.', svg: FIGMA_LOGO },
];

// The mark shown at rest and used as the drag handle.
const MARK = `<img src="${LOGO_URL}" alt="" width="28" height="28" draggable="false">`;

export class Pill {
  private el: HTMLDivElement;
  private card: HTMLDivElement;
  private note: HTMLDivElement;
  private left = 16;
  private top = 0;
  private closeTimer = 0;
  private noteTimer = 0;
  private dragging = false;
  private pressed: Record<PillTool, boolean> = { inspect: false, devices: false, saved: false, figma: false };

  constructor(root: ShadowRoot, private callbacks: PillCallbacks) {
    this.top = Math.max(MARGIN, window.innerHeight - SIZE - 24);

    this.el = document.createElement('div');
    this.el.className = 'pp-pill';
    this.el.innerHTML = `
      <div class="pp-pill-card" role="toolbar" aria-label="PixelPeek tools">
        <button class="pp-pill-mark" title="Drag to move" aria-label="PixelPeek tools: drag to move">${MARK}</button>
        ${TOOLS.map((t) => `<button class="pp-pill-btn" data-pp-pill="${t.id}" aria-label="${t.label}" aria-pressed="false"><span class="pp-pill-ico">${t.svg}</span><span class="pp-pill-tip">${t.label}</span></button>`).join('')}
      </div>
      <div class="pp-pill-note" role="status"></div>`;
    this.card = this.el.querySelector('.pp-pill-card') as HTMLDivElement;
    this.note = this.el.querySelector('.pp-pill-note') as HTMLDivElement;

    // Clicks on our own UI must not reach the page or the picker.
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu']) {
      this.el.addEventListener(type, (e) => e.stopPropagation());
    }

    this.card.addEventListener('mouseenter', () => this.open());
    this.card.addEventListener('mouseleave', () => this.scheduleClose());
    this.card.addEventListener('focusin', () => this.open());
    this.card.addEventListener('focusout', () => this.scheduleClose());

    this.card.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-pp-pill]');
      if (btn) this.callbacks.onTool(btn.dataset.ppPill as PillTool);
    });

    const mark = this.card.querySelector('.pp-pill-mark') as HTMLElement;
    mark.addEventListener('pointerdown', (e) => this.startDrag(e, mark));

    window.addEventListener('resize', this.onResize);
    root.append(this.el);
    this.place();
    void this.restore();
  }

  destroy(): void {
    clearTimeout(this.closeTimer);
    clearTimeout(this.noteTimer);
    window.removeEventListener('resize', this.onResize);
    this.el.remove();
  }

  // Hidden while an element is selected: the same tools are then at the top of the panel.
  setVisible(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
  }

  // Lit buttons: Inspect while picking, Responsive and Saved while their view is open.
  setState(state: Partial<Record<PillTool, boolean>>): void {
    Object.assign(this.pressed, state);
    this.card.querySelectorAll<HTMLElement>('[data-pp-pill]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(this.pressed[btn.dataset.ppPill as PillTool]));
    });
  }

  // A short message beside the pill, for when the panel is closed and has no toast to show.
  flash(message: string): void {
    this.note.textContent = message;
    this.note.classList.add('pp-pill-note-on');
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => this.note.classList.remove('pp-pill-note-on'), 1800);
  }

  // ---- opening ----

  private open(): void {
    clearTimeout(this.closeTimer);
    this.card.classList.add('pp-pill-open');
  }

  private scheduleClose(): void {
    if (this.dragging) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      if (!this.card.matches(':focus-within')) this.card.classList.remove('pp-pill-open');
    }, CLOSE_DELAY);
  }

  // ---- moving ----

  private clamp(): void {
    const maxLeft = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
    const maxTop = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN);
    this.left = Math.min(Math.max(MARGIN, this.left), maxLeft);
    this.top = Math.min(Math.max(MARGIN, this.top), maxTop);
  }

  private place(): void {
    this.clamp();
    this.el.style.left = `${this.left}px`;
    this.el.style.top = `${this.top}px`;
    // In the lower half of the screen the stack grows upward, so it never runs off the page.
    this.el.classList.toggle('pp-pill-up', this.top + SIZE / 2 > window.innerHeight / 2);
    // Notes sit on the side with room.
    this.el.classList.toggle('pp-pill-left', this.left + SIZE / 2 > window.innerWidth / 2);
  }

  private readonly onResize = (): void => this.place();

  private startDrag(e: PointerEvent, handle: HTMLElement): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const originLeft = this.left;
    const originTop = this.top;
    let moved = false;
    handle.setPointerCapture(e.pointerId);

    const onMove = (m: PointerEvent): void => {
      const dx = m.clientX - startX;
      const dy = m.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!moved) {
        moved = true;
        this.dragging = true;
        this.el.classList.add('pp-pill-dragging');
      }
      this.left = originLeft + dx;
      this.top = originTop + dy;
      this.place();
    };
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      this.el.classList.remove('pp-pill-dragging');
      this.dragging = false;
      if (moved) void this.save();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  // ---- remembering the spot ----

  private async restore(): Promise<void> {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
      const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as { left?: number; top?: number } | undefined;
      if (stored && typeof stored.left === 'number' && typeof stored.top === 'number') {
        this.left = stored.left;
        this.top = stored.top;
        this.place();
      }
    } catch {
      // Storage can be unavailable; the default spot is fine.
    }
  }

  private async save(): Promise<void> {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
      await chrome.storage.local.set({ [STORAGE_KEY]: { left: this.left, top: this.top } });
    } catch {
      // Not remembering the spot is harmless.
    }
  }
}
