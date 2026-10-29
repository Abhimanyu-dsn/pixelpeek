import type { Device, FrameStyle } from './devices';
import { escapeHtml } from '../panel/html';

export interface DevicePreviewCallbacks {
  // The page refused to be shown in a frame: offer a real window of this size instead.
  onOpenWindow: (width: number, height: number) => void;
  onClose: () => void;
}

interface Bezel {
  top: number;
  right: number;
  bottom: number;
  left: number;
  radius: number;
}

// Picture-frame thickness and corner radius for each kind of device, in CSS pixels at 100%.
const BEZELS: Record<FrameStyle, Bezel> = {
  island: { top: 14, right: 14, bottom: 14, left: 14, radius: 62 },
  notch: { top: 14, right: 14, bottom: 14, left: 14, radius: 52 },
  punch: { top: 14, right: 14, bottom: 14, left: 14, radius: 44 },
  fold: { top: 14, right: 14, bottom: 14, left: 14, radius: 34 },
  home: { top: 66, right: 16, bottom: 82, left: 16, radius: 46 },
  tablet: { top: 24, right: 24, bottom: 24, left: 24, radius: 36 },
  laptop: { top: 18, right: 18, bottom: 18, left: 18, radius: 20 },
  monitor: { top: 16, right: 16, bottom: 52, left: 16, radius: 18 },
  watch: { top: 22, right: 22, bottom: 22, left: 22, radius: 64 },
  plain: { top: 2, right: 2, bottom: 2, left: 2, radius: 12 },
};

const PRESETS = [320, 375, 414, 768, 1024, 1280, 1440];

// A full-page overlay showing the current page inside a mockup of a device. The page is loaded in a
// frame of the device's CSS size, so its media queries answer as they would on the real thing.
export class DevicePreview {
  private el: HTMLDivElement;
  private device: Device | null = null;
  private width = 0;
  private height = 0;
  private landscape = false;
  private callbacks: DevicePreviewCallbacks;
  private onResize = (): void => this.layout();

  constructor(root: ShadowRoot, callbacks: DevicePreviewCallbacks) {
    this.callbacks = callbacks;
    this.el = document.createElement('div');
    this.el.className = 'pp-dp';
    this.el.style.display = 'none';
    this.el.addEventListener('click', (e) => this.onClick(e as MouseEvent));
    this.el.addEventListener('input', (e) => this.onInput(e as InputEvent));
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'keydown', 'keyup']) {
      this.el.addEventListener(type, (e) => e.stopPropagation());
    }
    root.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.device !== null;
  }

  open(device: Device): void {
    this.device = device;
    this.landscape = false;
    this.width = device.width;
    this.height = device.height;
    this.el.style.display = 'flex';
    this.render();
    window.addEventListener('resize', this.onResize);
  }

  close(): void {
    if (!this.device) return;
    this.device = null;
    this.el.style.display = 'none';
    this.el.innerHTML = '';
    window.removeEventListener('resize', this.onResize);
  }

  destroy(): void {
    this.close();
    this.el.remove();
  }

  private screen(): { w: number; h: number } {
    return this.landscape ? { w: this.height, h: this.width } : { w: this.width, h: this.height };
  }

  private render(): void {
    const device = this.device;
    if (!device) return;
    const responsive = device.category === 'responsive';
    const { w, h } = this.screen();
    const frame = device.frame;

    this.el.innerHTML = `
      <div class="pp-dp-bar">
        <div class="pp-dp-title"><b>${escapeHtml(device.name)}</b><span>${responsive ? '' : `${w} × ${h}`}</span></div>
        ${responsive ? `
          <div class="pp-dp-size">
            <input type="number" min="200" max="3000" value="${w}" data-pp-dp-w aria-label="Width"> ×
            <input type="number" min="200" max="3000" value="${h}" data-pp-dp-h aria-label="Height">
          </div>
          <div class="pp-dp-presets">${PRESETS.map((p) => `<button class="pp-chip" data-pp-dp-preset="${p}">${p}</button>`).join('')}</div>` : ''}
        <span class="pp-dp-scale" data-pp-dp-scale></span>
        <button class="pp-btn" data-pp-dp-rotate title="Rotate">Rotate</button>
        <button class="pp-btn" data-pp-dp-reload title="Reload the preview">Reload</button>
        <button class="pp-btn" data-pp-dp-close>Close <kbd>Esc</kbd></button>
      </div>
      <div class="pp-dp-stage" data-pp-dp-stage>
        <div class="pp-dev pp-dev-${frame}${this.landscape ? ' pp-landscape' : ''}" data-pp-dp-dev>
          <div class="pp-dev-screen">
            <iframe class="pp-dp-frame" data-pp-dp-iframe title="Preview of this page" referrerpolicy="same-origin"></iframe>
            <div class="pp-dp-blocked" data-pp-dp-blocked hidden>
              <b>This site cannot be shown inside a frame</b>
              <p>It sends headers that stop other pages (including this preview) from framing it. Open a real browser window at this size instead.</p>
              <button class="pp-btn pp-btn-primary" data-pp-dp-window>Open a ${w} × ${h} window</button>
            </div>
          </div>
          <span class="pp-dev-deco pp-dev-a"></span><span class="pp-dev-deco pp-dev-b"></span><span class="pp-dev-deco pp-dev-c"></span>
        </div>
      </div>
    `;
    this.layout();
    this.loadFrame();
  }

  private loadFrame(): void {
    const iframe = this.el.querySelector<HTMLIFrameElement>('[data-pp-dp-iframe]');
    const blocked = this.el.querySelector<HTMLElement>('[data-pp-dp-blocked]');
    if (!iframe || !blocked) return;
    iframe.addEventListener('load', () => {
      // Same-origin pages that allow framing give us a document; a refused frame becomes a
      // cross-origin error page, and reading it throws or returns nothing.
      let allowed = false;
      try {
        allowed = !!iframe.contentDocument?.body;
      } catch {
        allowed = false;
      }
      blocked.hidden = allowed;
    });
    iframe.src = location.href;
  }

  // Sizes the frame and scales the whole mockup down so it fits the window.
  private layout(): void {
    const device = this.device;
    const stage = this.el.querySelector<HTMLElement>('[data-pp-dp-stage]');
    const dev = this.el.querySelector<HTMLElement>('[data-pp-dp-dev]');
    if (!device || !stage || !dev) return;

    const { w, h } = this.screen();
    const b = BEZELS[device.frame];
    const bez = this.landscape && device.category !== 'tablets'
      ? { top: b.left, right: b.bottom, bottom: b.right, left: b.top, radius: b.radius }
      : b;
    const totalW = w + bez.left + bez.right;
    const totalH = h + bez.top + bez.bottom;
    const extra = device.frame === 'laptop' ? 28 : device.frame === 'monitor' ? 64 : device.frame === 'watch' ? 80 : 0;

    const scale = Math.min(1, (stage.clientWidth - 48) / totalW, (stage.clientHeight - 24) / (totalH + extra * 2));
    dev.style.cssText = `--sw:${w}px;--sh:${h}px;--bt:${bez.top}px;--br:${bez.right}px;--bb:${bez.bottom}px;--bl:${bez.left}px;--r:${bez.radius}px;` +
      `width:${totalW}px;height:${totalH}px;transform:scale(${scale});`;
    // The stage keeps the scaled size so the mockup stays centred.
    dev.parentElement!.style.setProperty('--fit-w', `${totalW * scale}px`);
    dev.parentElement!.style.setProperty('--fit-h', `${(totalH + extra * 2) * scale}px`);
    const label = this.el.querySelector<HTMLElement>('[data-pp-dp-scale]');
    if (label) label.textContent = `${Math.round(scale * 100)}%`;
  }

  private onInput(e: InputEvent): void {
    const t = e.target as HTMLInputElement;
    if (t.matches('[data-pp-dp-w]')) this.width = Math.max(200, Math.min(3000, parseInt(t.value, 10) || this.width));
    else if (t.matches('[data-pp-dp-h]')) this.height = Math.max(200, Math.min(3000, parseInt(t.value, 10) || this.height));
    else return;
    this.layout();
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('[data-pp-dp-close]')) {
      this.close();
      this.callbacks.onClose();
    } else if (target.closest('[data-pp-dp-rotate]')) {
      this.landscape = !this.landscape;
      this.render();
    } else if (target.closest('[data-pp-dp-reload]')) {
      this.loadFrame();
    } else if (target.closest('[data-pp-dp-window]')) {
      const { w, h } = this.screen();
      this.callbacks.onOpenWindow(w, h);
    } else {
      const preset = target.closest<HTMLElement>('[data-pp-dp-preset]')?.dataset.ppDpPreset;
      if (preset) {
        this.width = parseInt(preset, 10);
        this.render();
      }
    }
  }
}
