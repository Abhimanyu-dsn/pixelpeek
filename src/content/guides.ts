// The Layout Guide drawn on the page: the locked element's margin (orange), padding (green) and
// content box (blue), like the box-model view in DevTools but sitting right on the element.

const num = (v: string): number => parseFloat(v) || 0;

export class GuideOverlay {
  private layer: HTMLDivElement;
  private target: Element | null = null;
  private raf = 0;
  private onMove = (): void => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  };

  constructor(root: ShadowRoot) {
    this.layer = document.createElement('div');
    this.layer.className = 'pp-guides';
    this.layer.style.display = 'none';
    root.appendChild(this.layer);
  }

  get isOn(): boolean {
    return this.target !== null;
  }

  show(el: Element): void {
    this.target = el;
    this.layer.style.display = 'block';
    window.addEventListener('scroll', this.onMove, true);
    window.addEventListener('resize', this.onMove);
    this.draw();
  }

  hide(): void {
    this.target = null;
    this.layer.style.display = 'none';
    this.layer.innerHTML = '';
    window.removeEventListener('scroll', this.onMove, true);
    window.removeEventListener('resize', this.onMove);
  }

  destroy(): void {
    this.hide();
    this.layer.remove();
  }

  private draw(): void {
    const el = this.target;
    if (!el) return;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const m = { t: num(s.marginTop), r: num(s.marginRight), b: num(s.marginBottom), l: num(s.marginLeft) };
    const bd = { t: num(s.borderTopWidth), r: num(s.borderRightWidth), b: num(s.borderBottomWidth), l: num(s.borderLeftWidth) };
    const p = { t: num(s.paddingTop), r: num(s.paddingRight), b: num(s.paddingBottom), l: num(s.paddingLeft) };

    const box = (cls: string, x: number, y: number, w: number, h: number, widths?: typeof m): string =>
      `<div class="${cls}" style="left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px;${
        widths ? `border-width:${widths.t}px ${widths.r}px ${widths.b}px ${widths.l}px;` : ''
      }"></div>`;
    const label = (text: number, x: number, y: number, cls: string): string =>
      text > 0 ? `<span class="pp-guide-label ${cls}" style="left:${x}px;top:${y}px">${Math.round(text * 10) / 10}</span>` : '';

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    this.layer.innerHTML =
      // Margin: a ring around the border box.
      box('pp-guide pp-guide-margin', r.left - m.l, r.top - m.t, r.width, r.height, m) +
      // Padding: a ring just inside the border.
      box('pp-guide pp-guide-padding', r.left + bd.l, r.top + bd.t, r.width - bd.l - bd.r, r.height - bd.t - bd.b, p) +
      box('pp-guide pp-guide-content', r.left + bd.l + p.l, r.top + bd.t + p.t, r.width - bd.l - bd.r - p.l - p.r, r.height - bd.t - bd.b - p.t - p.b) +
      label(m.t, cx, r.top - m.t / 2, 'pp-guide-label-margin') + label(m.b, cx, r.bottom + m.b / 2, 'pp-guide-label-margin') +
      label(m.l, r.left - m.l / 2, cy, 'pp-guide-label-margin') + label(m.r, r.right + m.r / 2, cy, 'pp-guide-label-margin') +
      label(p.t, cx, r.top + bd.t + p.t / 2, 'pp-guide-label-padding') + label(p.b, cx, r.bottom - bd.b - p.b / 2, 'pp-guide-label-padding') +
      label(p.l, r.left + bd.l + p.l / 2, cy, 'pp-guide-label-padding') + label(p.r, r.right - bd.r - p.r / 2, cy, 'pp-guide-label-padding');
  }
}
