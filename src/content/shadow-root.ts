import panelCss from '../styles/panel.css';

export const HOST_ID = 'pixelpeek-host';

export function createShadowRoot(): { host: HTMLElement; root: ShadowRoot } {
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.zIndex = '2147483647';

  // 'closed' per Step 5 polish: prevents the host page from reaching into
  // PixelPeek's shadow tree via document.querySelector etc.
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = panelCss;
  root.appendChild(style);

  document.documentElement.appendChild(host);
  return { host, root };
}

export function destroyShadowRoot(): void {
  document.getElementById(HOST_ID)?.remove();
}
