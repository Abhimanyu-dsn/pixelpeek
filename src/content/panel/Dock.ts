export type DockId = 'inspect' | 'figma' | 'colors' | 'fonts' | 'assets' | 'saved' | 'system' | 'clone';

export interface DockCallbacks {
  onPick: (id: DockId) => void;
  onExit: () => void;
}

const svg = (body: string): string =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ITEMS: { id: DockId; label: string; icon: string }[] = [
  { id: 'inspect', label: 'Inspect', icon: svg('<path d="M4 4l7 17 2.5-7.5L21 11z"/>') },
  { id: 'figma', label: 'Figma', icon: svg('<path d="M8 3h4a3 3 0 010 6H8z"/><path d="M12 3h4a3 3 0 010 6h-4z"/><path d="M8 9h4a3 3 0 010 6H8z"/><circle cx="15" cy="12" r="3"/><path d="M8 15a3 3 0 103 3v-3z"/>') },
  { id: 'colors', label: 'Colors', icon: svg('<path d="M12 3a9 9 0 100 18c1.7 0 2-1.2 1.4-2.2-.7-1.2.1-2.8 1.6-2.8H17a4 4 0 004-4c0-4.4-4-9-9-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8" r="1"/>') },
  { id: 'fonts', label: 'Fonts', icon: svg('<path d="M4 20l6-16 6 16M6.5 14h7M17 20h4M19 11v9"/>') },
  { id: 'assets', label: 'Assets', icon: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>') },
  { id: 'saved', label: 'Saved', icon: svg('<path d="M6 3h12v18l-6-4-6 4z"/>') },
  { id: 'system', label: 'System', icon: svg('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5M3 17l9 5 9-5" opacity=".6"/>') },
  { id: 'clone', label: 'Clone', icon: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>') },
];

const CLOSE = svg('<path d="M18 6L6 18M6 6l12 12"/>');

// The bar at the bottom of the screen: one click from any tool to any other.
export class Dock {
  private bar: HTMLDivElement;

  constructor(root: ShadowRoot, callbacks: DockCallbacks) {
    this.bar = document.createElement('div');
    this.bar.className = 'pp-dock';
    this.bar.innerHTML =
      ITEMS.map(
        (item, i) =>
          `${i === 1 ? '<span class="pp-dock-sep"></span>' : ''}<button class="pp-dock-btn" data-pp-dock="${item.id}" aria-pressed="false" title="${item.label}">${item.icon}<span>${item.label}</span></button>`,
      ).join('') +
      `<span class="pp-dock-sep"></span><button class="pp-dock-btn pp-dock-close" data-pp-dock-exit title="Close PixelPeek (Esc)" aria-label="Close PixelPeek">${CLOSE}</button>`;

    this.bar.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-pp-dock-exit]')) {
        callbacks.onExit();
        return;
      }
      const id = target.closest<HTMLElement>('[data-pp-dock]')?.dataset.ppDock as DockId | undefined;
      if (id) callbacks.onPick(id);
    });
    // The page's own handlers never see clicks on our UI.
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu']) {
      this.bar.addEventListener(type, (e) => e.stopPropagation());
    }
    root.appendChild(this.bar);
  }

  setActive(id: DockId | null): void {
    for (const button of Array.from(this.bar.querySelectorAll<HTMLElement>('[data-pp-dock]'))) {
      button.setAttribute('aria-pressed', String(button.dataset.ppDock === id));
    }
  }

  destroy(): void {
    this.bar.remove();
  }
}
