import { escapeHtml } from './html';
import { toHex } from '../capture/color';
import { readContrast } from '../scan/contrast';
import { DOCK_ENABLED } from '../features';

const num = (v: string): number => parseFloat(v) || 0;
// Room to leave at the bottom (for the dock, when it is on).
const RESERVE = DOCK_ENABLED ? 76 : 16;
const FOOT = 'Click to select · <kbd>F</kbd> Figma · <kbd>S</kbd> Save';
const trim = (n: number): string => String(Math.round(n * 10) / 10);

function selectorOf(el: Element): string {
  if (el.id) return `#${el.id}`;
  const classes = Array.from(el.classList).slice(0, 2).join('.');
  return classes ? `${el.tagName.toLowerCase()}.${classes}` : el.tagName.toLowerCase();
}

const edges = (t: string, r: string, b: string, l: string): string => {
  const [a, c, d, e] = [num(t), num(r), num(b), num(l)];
  if (!a && !c && !d && !e) return '';
  return a === c && c === d && d === e ? `${trim(a)}px` : `${trim(a)} ${trim(c)} ${trim(d)} ${trim(e)}`;
};

// The small card that follows the pointer's element while inspecting: just the basics, so the main
// panel can stay out of the way until something is selected.
export class HoverCard {
  private el: HTMLDivElement;
  private flashTimer = 0;

  constructor(root: ShadowRoot) {
    this.el = document.createElement('div');
    this.el.className = 'pp-hover';
    this.el.style.display = 'none';
    root.appendChild(this.el);
  }

  show(target: Element): void {
    const s = getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    const contrast = readContrast(target, s);

    const swatch = (css: string): string => `<span class="pp-swatch" style="background:${escapeHtml(css)}"></span>`;
    const rows: [string, string][] = [];

    const fontFirst = (s.fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim();
    if ((target.textContent ?? '').trim()) {
      rows.push(['Font', `${escapeHtml(fontFirst)} · ${s.fontSize} · ${s.fontWeight}`]);
      rows.push(['Text', `${swatch(s.color)}${toHex(s.color)}${contrast && !contrast.onImage ? ` <span class="${contrast.aa ? 'pp-hv-ok' : 'pp-hv-bad'}">${contrast.ratio.toFixed(1)}:1</span>` : ''}`]);
    }
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') {
      rows.push(['Fill', `${swatch(s.backgroundColor)}${toHex(s.backgroundColor)}`]);
    }
    const padding = edges(s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft);
    const margin = edges(s.marginTop, s.marginRight, s.marginBottom, s.marginLeft);
    if (padding) rows.push(['Padding', padding]);
    if (margin) rows.push(['Margin', margin]);
    if (num(s.borderTopLeftRadius)) rows.push(['Radius', s.borderTopLeftRadius]);
    if (s.display.includes('flex') || s.display.includes('grid')) rows.push(['Layout', `${s.display}${num(s.rowGap) ? ` · gap ${trim(num(s.rowGap))}px` : ''}`]);

    this.el.innerHTML = `
      <div class="pp-hover-head"><b>${escapeHtml(selectorOf(target))}</b><span>${Math.round(rect.width)} × ${Math.round(rect.height)}</span></div>
      ${rows.map(([k, v]) => `<div class="pp-hover-row"><span>${k}</span><span>${v}</span></div>`).join('')}
      <div class="pp-hover-foot" data-pp-hover-foot>${FOOT}</div>`;
    this.el.style.display = 'block';

    // Below the element when it fits, otherwise above, and always inside the window.
    const card = this.el.getBoundingClientRect();
    const gap = 10;
    let top = rect.bottom + gap;
    if (top + card.height > window.innerHeight - RESERVE) top = rect.top - card.height - gap;
    if (top < 8) top = Math.min(Math.max(8, rect.top + 8), window.innerHeight - card.height - RESERVE);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - card.width - 8));
    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
  }

  // A short confirmation in the footer ("Saved"), then the hint again.
  flash(message: string): void {
    const foot = this.el.querySelector<HTMLElement>('[data-pp-hover-foot]');
    if (!foot) return;
    foot.textContent = message;
    foot.classList.add('pp-hover-flash');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      foot.innerHTML = FOOT;
      foot.classList.remove('pp-hover-flash');
    }, 1400);
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  destroy(): void {
    this.el.remove();
  }
}
