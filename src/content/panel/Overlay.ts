import { escapeHtml } from './html';
import { copyToClipboard } from './copy';
import type { ElementCapture } from '../types';
import { saveText } from '../assets/download';
import { buildDesignSystem } from '../system/build';
import { buildExport } from '../system/export';
import type { ExportFormat } from '../system/export';
import type { FigmaResult, FigmaScope } from '../figma/to-svg';
import { clearSaved, listSaved, removeSaved } from '../library/store';
import { deviceById } from '../devices/devices';
import type { Device, DeviceCategory } from '../devices/devices';
import type { PageBackend } from './backend';
import { accountView, assetsTab, devicesView, exportTab, figmaTab, savedView, stylesTab, systemTab } from './views';
import type { ViewState } from './views';
import { Dock } from './Dock';
import { DOCK_ENABLED } from '../features';
import type { DockId } from './Dock';
import { Pill, TOOLS } from './Pill';
import type { PillTool } from './Pill';

export type TabId = 'styles' | 'figma' | 'assets' | 'system' | 'export';
type Mode = 'main' | 'devices' | 'saved' | 'account';

export interface OverlayCallbacks {
  onInspectToggle: (on: boolean) => void;
  // The ✕ next to the element's name: forget the selection.
  onDeselect: () => void;
  onFigmaElement: () => Promise<FigmaResult>;
  // The pill's Copy to Figma with nothing selected: copies the last hovered element and says what happened.
  onFigmaHovered: () => Promise<string>;
  onSaveElement: (capture: ElementCapture) => Promise<void>;
  onGuides: (on: boolean) => void;
  onOpenDevice: (device: Device) => void;
  // Closes PixelPeek completely.
  onExit: () => void;
}

const POS_KEY = 'pp-panel-pos';
// Six dots: the grip that says "hold here".
const GRIP = '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="3" r="1.3"/><circle cx="7.5" cy="3" r="1.3"/><circle cx="2.5" cy="8" r="1.3"/><circle cx="7.5" cy="8" r="1.3"/><circle cx="2.5" cy="13" r="1.3"/><circle cx="7.5" cy="13" r="1.3"/></svg>';

const TABS: { id: TabId; label: string }[] = [
  { id: 'styles', label: 'Styles' },
  { id: 'figma', label: 'Figma' },
  { id: 'assets', label: 'Assets' },
  { id: 'system', label: 'Design System' },
  { id: 'export', label: 'Export' },
];

const icon = (body: string): string =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  inspect: icon('<path d="M4 4l7 17 2.5-7.5L21 11z"/>'),
  device: icon('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
  saved: icon('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  account: icon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
  close: icon('<path d="M18 6L6 18M6 6l12 12"/>'),
};


// The one panel PixelPeek shows: the name of what is selected and five tabs, with the tools in the
// floating pill. It hovers over the page (fixed, right-hand side), so the page keeps its own size and
// layout, and it stays hidden while you pick an element.
export class Overlay {
  private el: HTMLDivElement;
  private pill: HTMLButtonElement;
  private tools: Pill;
  private nav!: HTMLElement;
  private dock: Dock | null;
  // A heading to scroll to once the body has drawn, e.g. "colors" or "typography".
  private anchor: string | null = null;
  private body!: HTMLElement;
  private foot!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer = 0;
  private alive = true;

  private s: ViewState = {
    capture: null,
    scan: null,
    scanning: false,
    scanError: null,
    system: null,
    components: null,
    componentsLoading: false,
    failingOnly: false,
    guidesOn: false,
    assets: [],
    assetsLoading: false,
    assetStatus: { text: '', tone: '' },
    busy: false,
    figma: null,
    figmaStatus: { text: '', tone: '' },
    exportFormat: 'css',
    clone: null,
    cloneStatus: '',
    saved: [],
    deviceQuery: '',
    deviceOpen: 'phones',
    cards: {},
  };
  private tab: TabId = 'styles';
  private mode: Mode = 'main';
  private inspecting = true;

  constructor(root: ShadowRoot, private backend: PageBackend, private callbacks: OverlayCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'pp-ov';
    this.el.innerHTML = `
      <div class="pp-ov-nav" data-pp-nav></div>
      <div class="pp-ov-body" data-pp-body></div>
      <div class="pp-ov-foot" data-pp-foot></div>
      <div class="pp-toast" data-pp-toast></div>
    `;
    this.nav = this.el.querySelector('[data-pp-nav]') as HTMLElement;
    this.body = this.el.querySelector('[data-pp-body]') as HTMLElement;
    this.foot = this.el.querySelector('[data-pp-foot]') as HTMLElement;
    this.toastEl = this.el.querySelector('[data-pp-toast]') as HTMLElement;

    this.el.addEventListener('click', (e) => this.onClick(e as MouseEvent));
    this.el.addEventListener('input', (e) => this.onInput(e as InputEvent));
    // The tool row is the handle: drag it to move the panel, double-click to put the panel back.
    this.el.addEventListener('pointerdown', (e) => this.startPanelDrag(e as PointerEvent));
    this.el.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('.pp-ov-tools') && !(e.target as HTMLElement).closest('button')) this.movePanel(null);
    });
    window.addEventListener('resize', this.onWindowResize);
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu']) {
      this.el.addEventListener(type, (e) => e.stopPropagation());
    }

    // The way out of inspecting, always in reach: it closes PixelPeek, the same as Esc.
    this.pill = document.createElement('button');
    this.pill.className = 'pp-exit-pill';
    this.pill.innerHTML = `${ICON.close}<span>Stop inspecting</span><kbd>Esc</kbd>`;
    this.pill.addEventListener('click', () => this.callbacks.onExit());
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu']) {
      this.pill.addEventListener(type, (e) => e.stopPropagation());
    }

    this.dock = DOCK_ENABLED ? new Dock(root, { onPick: (id) => this.goTo(id), onExit: () => this.callbacks.onExit() }) : null;
    root.append(this.pill, this.el);
    this.tools = new Pill(root, { onTool: (tool) => this.onPillTool(tool) });
    this.render();
    this.loadForTab();
  }

  destroy(): void {
    this.alive = false;
    window.removeEventListener('resize', this.onWindowResize);
    clearTimeout(this.toastTimer);
    this.el.remove();
    this.pill.remove();
    this.tools.destroy();
    this.dock?.destroy();
  }

  // ---- what the page tells the panel ----

  setCapture(capture: ElementCapture | null): void {
    this.s.capture = capture;
    this.s.figma = null;
    this.s.figmaStatus = { text: '', tone: '' };
    // Picking an element brings its values to the front.
    if (capture) {
      this.mode = 'main';
      if (this.tab === 'assets' || this.tab === 'system') this.tab = 'styles';
    }
    this.render();
    // The Assets tab follows the selection: what is inside it, or the whole page.
    if (this.tab === 'assets' && this.mode === 'main') void this.refreshAssets();
  }

  setInspecting(on: boolean): void {
    this.inspecting = on;
    this.render();
  }

  // While picking an element the panel shrinks to its top bar, so nothing on the page sits behind it.
  // It opens again as soon as an element is selected, or when something other than inspecting is wanted.
  private get collapsed(): boolean {
    return this.inspecting && !this.s.capture && this.mode === 'main';
  }

  // The bottom dock: one click to any tool.
  private goTo(id: DockId): void {
    if (id === 'inspect') {
      this.inspecting = true;
      this.callbacks.onInspectToggle(true);
      this.mode = 'main';
      this.anchor = null;
      this.render();
      return;
    }
    // Nothing selected means the panel is collapsed; opening a tool means stop picking for now.
    if (this.inspecting && !this.s.capture) {
      this.inspecting = false;
      this.callbacks.onInspectToggle(false);
    }
    this.anchor = null;
    if (id === 'saved') {
      this.mode = 'saved';
      void this.loadSaved();
      this.render();
      return;
    }
    const target: Record<string, [TabId, string | null]> = {
      figma: ['figma', null],
      colors: ['styles', 'colors'],
      fonts: ['styles', 'typography'],
      assets: ['assets', null],
      system: ['system', null],
      clone: ['export', 'clone'],
    };
    const [tab, anchor] = target[id];
    this.tab = tab;
    this.mode = 'main';
    this.anchor = anchor;
    if (anchor) this.s.cards[`${tab}:${anchor}`] = true;
    this.lastDock = id;
    this.render();
    this.loadForTab();
  }

  private lastDock: DockId = 'colors';

  // Which dock button is lit: what is on screen right now.
  private dockActive(): DockId | null {
    if (this.mode === 'saved') return 'saved';
    if (this.collapsed) return 'inspect';
    if (this.mode !== 'main') return null;
    switch (this.tab) {
      case 'figma': return 'figma';
      case 'assets': return 'assets';
      case 'system': return 'system';
      case 'export': return this.lastDock === 'clone' ? 'clone' : null;
      default: return this.s.capture ? null : this.lastDock === 'fonts' ? 'fonts' : 'colors';
    }
  }

  get isInspecting(): boolean {
    return this.inspecting;
  }

  // ---- loading ----

  private async ensureScan(force = false): Promise<void> {
    if (this.s.scanning || (this.s.scan && !force)) return;
    this.s.scanning = true;
    this.s.scanError = null;
    this.render();
    try {
      this.s.scan = await this.backend.scan();
      this.s.system = buildDesignSystem(this.s.scan);
    } catch (error) {
      console.error('[PixelPeek] Could not scan this page', error);
      this.s.scanError = error instanceof Error ? error.message : String(error);
    } finally {
      this.s.scanning = false;
      if (this.alive) this.render();
    }
  }

  private async loadComponents(): Promise<void> {
    if (this.s.componentsLoading || this.s.components) return;
    this.s.componentsLoading = true;
    this.render();
    try {
      // Let the panel paint before the scan blocks the page for a moment.
      await new Promise((r) => setTimeout(r, 30));
      this.s.components = await this.backend.scanComponents();
    } catch (error) {
      console.error('[PixelPeek] Could not scan components', error);
      this.s.components = [];
    }
    this.s.componentsLoading = false;
    if (this.alive) this.render();
  }

  private async refreshAssets(): Promise<void> {
    this.s.assetStatus = { text: '', tone: '' };
    this.s.assetsLoading = true;
    this.render();
    try {
      this.s.assets = await this.backend.collectAssets();
    } catch (error) {
      console.error('[PixelPeek] Could not collect assets', error);
      this.s.assets = [];
      this.s.assetStatus = { text: error instanceof Error ? error.message : 'Could not read the assets on this page.', tone: 'warn' };
    }
    this.s.assetsLoading = false;
    if (this.alive) this.render();
  }

  private async loadSaved(): Promise<void> {
    this.s.saved = await listSaved();
    if (this.alive) this.render();
  }

  private loadForTab(): void {
    if (this.mode === 'saved') void this.loadSaved();
    if (this.mode !== 'main') return;
    if (this.tab === 'assets') void this.refreshAssets();
    if (this.tab === 'styles' && !this.s.capture) void this.ensureScan();
    if (this.tab === 'system') {
      void this.ensureScan();
      void this.loadComponents();
    }
    if (this.tab === 'export') void this.ensureScan();
  }

  // ---- events ----

  private toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('pp-toast-on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('pp-toast-on'), 1500);
  }

  private async copy(text: string | undefined, message = 'Copied'): Promise<void> {
    if (!text) return;
    try {
      await copyToClipboard(text);
      this.toast(message);
    } catch {
      this.toast('Could not copy');
    }
  }

  private onInput(e: InputEvent): void {
    const input = e.target as HTMLInputElement;
    if (!input.matches('[data-pp-device-search]')) return;
    this.s.deviceQuery = input.value;
    this.renderBody();
    const again = this.body.querySelector<HTMLInputElement>('[data-pp-device-search]');
    again?.focus();
    again?.setSelectionRange(again.value.length, again.value.length);
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;

    const el = target.closest<HTMLElement>('[data-pp-act], [data-pp-tab], [data-pp-top-btn], [data-pp-panel-tool]');
    if (!el) return;

    const panelTool = el.dataset.ppPanelTool;
    if (panelTool) {
      this.onPillTool(panelTool as PillTool);
      return;
    }
    const topBtn = el.dataset.ppTopBtn;
    if (topBtn) {
      this.onTopButton(topBtn);
      return;
    }
    if (el.dataset.ppTab) {
      this.setTab(el.dataset.ppTab as TabId);
      return;
    }

    const value = el.dataset.ppValue ?? '';
    switch (el.dataset.ppAct) {
      case 'tab':
        this.setTab(value as TabId);
        return;
      case 'deselect':
        this.callbacks.onDeselect();
        return;
      case 'card':
        this.s.cards[value] = el.getAttribute('aria-expanded') !== 'true';
        this.render();
        return;
      case 'copy':
        void this.copy(el.dataset.ppCopy);
        return;
      case 'rescan':
        if (this.tab === 'assets') void this.refreshAssets();
        else {
          this.s.components = null;
          void this.ensureScan(true);
          if (this.tab === 'system') void this.loadComponents();
        }
        return;
      case 'failing':
        this.s.failingOnly = !this.s.failingOnly;
        this.render();
        return;
      case 'guides':
        this.s.guidesOn = !this.s.guidesOn;
        this.callbacks.onGuides(this.s.guidesOn);
        this.render();
        return;
      case 'asset-dl':
        void this.downloadOne(value);
        return;
      case 'assets-zip':
        void this.downloadZip(value);
        return;
      case 'export-format':
        this.s.exportFormat = value as ExportFormat;
        this.render();
        return;
      case 'export-download': {
        const file = this.currentExport();
        if (file) saveText(file.text, file.filename, file.mime);
        return;
      }
      case 'export-copy':
        void this.copy(this.currentExport()?.text);
        return;
      case 'clone-run':
        void this.runClone();
        return;
      case 'figma-run':
        void this.runFigma(() => this.backend.buildFigma(value as FigmaScope), value === 'page' ? 'the whole page' : 'the visible area');
        return;
      case 'figma-element':
        void this.runFigma(() => this.callbacks.onFigmaElement(), 'the element');
        return;
      case 'figma-copy-pending':
        void this.copyFigma();
        return;
      case 'save-element':
        if (this.s.capture) {
          void this.callbacks
            .onSaveElement(this.s.capture)
            .then(() => this.loadSaved())
            .then(() => this.toast('Saved'))
            .catch(() => this.toast('Could not save'));
        }
        return;
      case 'saved-css':
      case 'saved-tailwind': {
        const item = this.s.saved.find((i) => i.id === value);
        if (item) void this.copy(el.dataset.ppAct === 'saved-css' ? item.css.join('\n') : item.tailwind.join(' '));
        return;
      }
      case 'saved-remove':
        void removeSaved(value).then(() => this.loadSaved());
        return;
      case 'saved-clear':
        void clearSaved().then(() => this.loadSaved());
        return;
      case 'device-cat':
        this.s.deviceOpen = this.s.deviceOpen === value ? null : (value as DeviceCategory);
        this.render();
        return;
      case 'device-open': {
        const device = deviceById(value);
        if (device) this.callbacks.onOpenDevice(device);
        return;
      }
    }
  }

  private onTopButton(which: string): void {
    if (which === 'inspect') {
      this.inspecting = !this.inspecting;
      this.callbacks.onInspectToggle(this.inspecting);
      this.mode = 'main';
    } else {
      const next = which as Mode;
      this.mode = this.mode === next ? 'main' : next;
      if (this.mode === 'saved') void this.loadSaved();
    }
    this.render();
  }

  // ---- moving the panel ----

  private pos: { left: number; top: number } | null = null;

  // null puts the panel back at the right-hand edge.
  private movePanel(pos: { left: number; top: number } | null, save = true): void {
    this.pos = pos;
    const s = this.el.style;
    if (!pos) {
      s.left = s.top = s.right = s.bottom = s.height = s.maxHeight = '';
    } else {
      const width = this.el.offsetWidth;
      const left = Math.min(Math.max(0, pos.left), Math.max(0, window.innerWidth - width));
      const top = Math.min(Math.max(0, pos.top), Math.max(0, window.innerHeight - 80));
      this.pos = { left, top };
      s.left = `${left}px`;
      s.top = `${top}px`;
      s.right = 'auto';
      s.bottom = 'auto';
      s.height = `${Math.max(240, window.innerHeight - top - 12)}px`;
      s.maxHeight = `calc(100vh - ${top}px - 8px)`;
    }
    if (!save) return;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) void chrome.storage.local.set({ [POS_KEY]: this.pos });
    } catch {
      // The panel just starts at the edge next time.
    }
  }

  private readonly onWindowResize = (): void => {
    if (this.pos) this.movePanel(this.pos, false);
  };

  private startPanelDrag(e: PointerEvent): void {
    const target = e.target as HTMLElement;
    const handle = target.closest<HTMLElement>('.pp-ov-tools');
    if (!handle || target.closest('button') || e.button !== 0) return;
    e.preventDefault();
    const box = this.el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    handle.setPointerCapture(e.pointerId);
    this.el.classList.add('pp-ov-dragging');

    const onMove = (m: PointerEvent): void => this.movePanel({ left: box.left + m.clientX - startX, top: box.top + m.clientY - startY }, false);
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      this.el.classList.remove('pp-ov-dragging');
      if (this.pos) this.movePanel(this.pos);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  private onPillTool(tool: PillTool): void {
    if (tool !== 'figma') {
      this.onTopButton(tool);
      return;
    }
    if (this.s.capture) {
      void this.runFigma(() => this.callbacks.onFigmaElement(), 'the element');
      return;
    }
    this.notify('Building Figma layers…');
    this.callbacks.onFigmaHovered().then((message) => this.notify(message)).catch(() => this.notify('Could not copy: try again'));
  }

  // A message where the person is looking: the panel's toast when it is open, else beside the pill.
  private notify(message: string): void {
    if (this.collapsed) this.tools.flash(message);
    else this.toast(message);
  }

  private setTab(tab: TabId): void {
    // A tab with nothing selected is about the whole page, so picking stops and the panel stays open.
    if (this.inspecting && !this.s.capture) {
      this.inspecting = false;
      this.callbacks.onInspectToggle(false);
    }
    this.tab = tab;
    this.anchor = null;
    this.mode = 'main';
    this.render();
    this.loadForTab();
  }

  // ---- actions ----

  private currentExport(): ReturnType<typeof buildExport> | null {
    return this.s.system ? buildExport(this.s.system, this.s.exportFormat) : null;
  }

  private async downloadOne(id: string): Promise<void> {
    const asset = this.s.assets.find((a) => a.id === id);
    if (!asset) return;
    try {
      const ok = await this.backend.downloadAsset(id);
      this.s.assetStatus = ok
        ? { text: `Saved ${asset.filename}`, tone: 'ok' }
        : { text: `${asset.filename} is blocked by the site, so it opened in a new tab to save by hand.`, tone: 'warn' };
    } catch (error) {
      this.s.assetStatus = { text: error instanceof Error ? error.message : String(error), tone: 'warn' };
    }
    this.render();
  }

  private async downloadZip(kind: string): Promise<void> {
    const list = kind === 'all' ? this.s.assets : this.s.assets.filter((a) => a.kind === kind);
    if (!list.length || this.s.busy) return;
    this.s.busy = true;
    this.s.assetStatus = { text: `Preparing 0 of ${list.length}…`, tone: '' };
    this.render();
    try {
      const result = await this.backend.downloadZip(
        list.map((a) => a.id),
        (done, total) => {
          this.s.assetStatus = { text: `Preparing ${done} of ${total}…`, tone: '' };
          if (this.alive) this.render();
        },
      );
      this.s.assetStatus = result.saved
        ? { text: `Saved ${result.saved} file${result.saved === 1 ? '' : 's'}${result.skipped ? `; ${result.skipped} blocked by the site were left out.` : '.'}`, tone: result.skipped ? 'warn' : 'ok' }
        : { text: "The site blocks reading these files, so nothing could be zipped. Use each file's download button.", tone: 'warn' };
    } catch (error) {
      this.s.assetStatus = { text: error instanceof Error ? error.message : String(error), tone: 'warn' };
    }
    this.s.busy = false;
    if (this.alive) this.render();
  }

  private async runFigma(build: () => Promise<FigmaResult>, what: string): Promise<void> {
    if (this.s.busy) return;
    this.s.busy = true;
    this.s.figma = null;
    this.s.figmaStatus = { text: `Building layers for ${what}…`, tone: '' };
    this.render();
    try {
      this.s.figma = await build();
      this.s.figmaStatus = { text: '', tone: '' };
      await this.copyFigma(true);
    } catch (error) {
      console.error('[PixelPeek] Could not build Figma layers', error);
      this.s.figmaStatus = { text: error instanceof Error ? error.message : String(error), tone: 'warn' };
    }
    this.s.busy = false;
    if (this.alive) this.render();
  }

  // Chrome only lets a click write the clipboard. Building can take a few seconds, so if it refuses,
  // the layers are kept and one more click finishes the job.
  private async copyFigma(first = false): Promise<void> {
    const f = this.s.figma;
    if (!f) return;
    try {
      await copyToClipboard(f.svg);
      this.s.figmaStatus = { text: `Copied ${f.layers} layer${f.layers === 1 ? '' : 's'}. Open Figma, click the canvas and press Ctrl+V (⌘V on Mac).`, tone: 'ok' };
      this.toast('Copied for Figma');
    } catch {
      this.s.figmaStatus = { text: first ? 'The layers are built. Click "Copy layers again" to put them on the clipboard.' : 'Could not reach the clipboard.', tone: 'warn' };
    }
    this.render();
  }

  private async runClone(): Promise<void> {
    if (this.s.busy) return;
    this.s.busy = true;
    this.s.clone = null;
    this.s.cloneStatus = 'Starting…';
    this.render();
    try {
      this.s.clone = await this.backend.clone((message) => {
        this.s.cloneStatus = message;
        if (this.alive) this.render();
      });
      this.s.cloneStatus = '';
    } catch (error) {
      console.error('[PixelPeek] Could not clone this page', error);
      this.s.cloneStatus = `Could not save this page: ${error instanceof Error ? error.message : String(error)}`;
    }
    this.s.busy = false;
    if (this.alive) this.render();
  }

  // ---- drawing ----

  private render(): void {
    this.renderTop();
    this.renderBody();
    const count = this.s.scan?.elementCount;
    this.foot.innerHTML = `<span>${count ? `${count} elements` : ''}</span><span>Esc to exit</span>`;
    this.pill.style.display = this.inspecting ? 'inline-flex' : 'none';
    this.el.classList.toggle('pp-ov-collapsed', this.collapsed);
    this.tools.setState({ inspect: this.inspecting, devices: this.mode === 'devices', saved: this.mode === 'saved' });
    // With a selection (or any open view) the tools are in the panel's top row, so the pill steps aside.
    this.tools.setVisible(this.collapsed);
    this.dock?.setActive(this.dockActive());
  }

  private renderTop(): void {
    const cap = this.s.capture;

    // The top of the panel: what is selected and the tabs that show it. The tools are in the row above it.
    const pressed: Record<PillTool, boolean> = { inspect: this.inspecting, devices: this.mode === 'devices', saved: this.mode === 'saved', figma: false };
    const toolRow = TOOLS.map(
      (t) => `<button class="pp-ov-tool" data-pp-panel-tool="${t.id}" aria-pressed="${pressed[t.id]}" aria-label="${t.label}">${t.svg}</button>`,
    ).join('');
    this.nav.innerHTML = `
      <div class="pp-ov-tools" title="Drag to move the panel. Double-click to put it back."><span class="pp-ov-grip" aria-hidden="true">${GRIP}</span>${toolRow}</div>
      <div class="pp-ov-head">
        <div class="pp-ov-title" title="${escapeHtml(cap ? cap.domPath.join(' > ') : document.title)}">${cap ? `<b>${escapeHtml(cap.selector)}</b><span>${Math.round(cap.layout.boxModel.content.width)} × ${Math.round(cap.layout.boxModel.content.height)}</span>` : `<b>Whole page</b><span>${escapeHtml(document.title.slice(0, 40))}</span>`}</div>
        <div class="pp-ov-head-btns">
          <button class="pp-close-btn" data-pp-top-btn="account" aria-pressed="${this.mode === 'account'}" title="Account" aria-label="Account">${ICON.account}</button>
          ${cap ? `<button class="pp-close-btn" data-pp-act="deselect" title="Clear selection" aria-label="Clear selection">${ICON.close}</button>` : ''}
        </div>
      </div>
      <div class="pp-ov-tabs" role="tablist">
        ${TABS.map((t) => `<button class="pp-ov-tab" role="tab" data-pp-tab="${t.id}" aria-selected="${this.mode === 'main' && this.tab === t.id}">${t.label}</button>`).join('')}
      </div>`;
  }

  private renderBody(): void {
    const scrollTop = this.body.scrollTop;
    let html: string;
    if (this.mode === 'devices') html = devicesView(this.s);
    else if (this.mode === 'saved') html = savedView(this.s);
    else if (this.mode === 'account') html = accountView();
    else {
      switch (this.tab) {
        case 'styles': html = stylesTab(this.s); break;
        case 'figma': html = figmaTab(this.s); break;
        case 'assets': html = assetsTab(this.s); break;
        case 'system': html = systemTab(this.s); break;
        case 'export': html = exportTab(this.s); break;
      }
    }
    this.body.innerHTML = html;
    this.body.scrollTop = scrollTop;
    if (this.anchor) {
      const target = this.body.querySelector<HTMLElement>(`[data-pp-anchor="${this.anchor}"]`);
      if (target) {
        this.body.scrollTop = target.offsetTop - this.body.offsetTop - 6;
        this.anchor = null;
      }
    }
  }
}
