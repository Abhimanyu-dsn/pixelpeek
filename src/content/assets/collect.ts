import { HOST_ID } from '../shadow-root';

export type AssetKind = 'image' | 'svg' | 'icon' | 'video' | 'lottie';

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  filename: string;
  // Remote or data/blob URL. Inline SVGs have none and carry `svg` instead.
  url?: string;
  svg?: string;
  width?: number;
  height?: number;
  // Shown in the grid in place of a picture for kinds that have none (video without poster, lottie).
  poster?: string;
  // File type in capitals (PNG, SVG, WEBP...) and size in bytes when the browser knows it.
  format: string;
  bytes?: number;
}

const ICON_MAX = 64;
const MAX_BACKGROUND_SCAN = 4000;

const EXT_BY_MIME: Record<string, string> = {
  'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/avif': 'avif', 'image/x-icon': 'ico', 'video/mp4': 'mp4', 'video/webm': 'webm',
};

function absolute(url: string): string | null {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return null;
  }
}

function extensionOf(url: string, fallback: string): string {
  if (url.startsWith('data:')) return EXT_BY_MIME[url.slice(5, url.indexOf(';') > 0 ? url.indexOf(';') : url.indexOf(','))] ?? fallback;
  try {
    const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    return match ? match[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

function nameFromUrl(url: string, index: number, fallbackExt: string): { name: string; filename: string } {
  const ext = extensionOf(url, fallbackExt);
  let base = '';
  if (!url.startsWith('data:') && !url.startsWith('blob:')) {
    try {
      base = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').replace(/\.[a-z0-9]{2,5}$/i, '');
    } catch {
      base = '';
    }
  }
  base = base.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `asset-${index}`;
  return { name: `${base}.${ext}`, filename: `${base}.${ext}` };
}

// Encoded size of a file the page has already loaded, from the browser's own resource timing.
function sizeOf(url: string): number | undefined {
  if (url.startsWith('data:')) return Math.round(url.length * 0.75);
  const entry = performance.getEntriesByName(url)[0] as PerformanceResourceTiming | undefined;
  return entry?.encodedBodySize || undefined;
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '';
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function svgDataUri(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

export function assetPreview(asset: Asset): string | undefined {
  if (asset.svg) return svgDataUri(asset.svg);
  if (asset.kind === 'video' || asset.kind === 'lottie') return asset.poster;
  return asset.url;
}

function isPixelPeek(el: Element): boolean {
  return !!el.closest(`#${HOST_ID}`);
}

// With `root`, only the assets inside that element (and the element itself); without it, the whole page.
export function collectAssets(root?: Element): Asset[] {
  const assets: Asset[] = [];
  const query = (selector: string): Element[] =>
    root ? [...(root.matches(selector) ? [root] : []), ...Array.from(root.querySelectorAll(selector))] : Array.from(document.querySelectorAll(selector));
  const seen = new Set<string>();

  const add = (asset: Omit<Asset, 'id' | 'name' | 'filename' | 'format' | 'bytes'> & { ext: string }): void => {
    const key = asset.svg ?? asset.url;
    if (!key || seen.has(key)) return;
    seen.add(key);
    const index = assets.length + 1;
    const names = asset.url
      ? nameFromUrl(asset.url, index, asset.ext)
      : { name: `inline-${index}.${asset.ext}`, filename: `inline-${index}.${asset.ext}` };
    const { ext: _ext, ...rest } = asset;
    const bytes = asset.svg ? asset.svg.length : asset.url ? sizeOf(asset.url) : undefined;
    assets.push({ ...rest, id: `asset-${index}`, ...names, format: names.filename.split('.').pop()?.toUpperCase() ?? asset.ext.toUpperCase(), bytes });
  };

  const imageKind = (url: string, w: number, h: number): AssetKind => {
    if (w > 0 && h > 0 && w <= ICON_MAX && h <= ICON_MAX) return 'icon';
    return /\.svg(\?|#|$)/i.test(url) || url.startsWith('data:image/svg') ? 'svg' : 'image';
  };

  for (const img of query('img') as HTMLImageElement[]) {
    if (isPixelPeek(img)) continue;
    const url = absolute(img.currentSrc || img.src);
    if (!url || (img.naturalWidth <= 1 && img.naturalHeight <= 1 && !/\.svg/i.test(url))) continue;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    add({ kind: imageKind(url, img.width || w, img.height || h), url, width: w, height: h, ext: 'png' });
  }

  for (const svg of query('svg')) {
    if (isPixelPeek(svg) || svg.closest('svg') !== svg) continue;
    const rect = svg.getBoundingClientRect();
    // Sprite sheets (`<symbol>` libraries) and hidden svgs have no size and are not assets in themselves.
    if (rect.width < 2 || rect.height < 2) continue;
    const clone = svg.cloneNode(true) as SVGElement;
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('width')) clone.setAttribute('width', String(Math.round(rect.width)));
    if (!clone.getAttribute('height')) clone.setAttribute('height', String(Math.round(rect.height)));
    // `currentColor` has nothing to inherit from once the file is saved on its own.
    const markup = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, getComputedStyle(svg).color);
    add({
      kind: rect.width <= ICON_MAX && rect.height <= ICON_MAX ? 'icon' : 'svg',
      svg: markup,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      ext: 'svg',
    });
  }

  for (const video of query('video') as HTMLVideoElement[]) {
    if (isPixelPeek(video)) continue;
    const poster = video.poster ? absolute(video.poster) ?? undefined : undefined;
    const sources = [video.currentSrc || video.src, ...Array.from(video.querySelectorAll('source')).map((s) => s.src)];
    for (const src of sources) {
      const url = src && !src.startsWith('blob:') ? absolute(src) : null;
      if (url) add({ kind: 'video', url, width: video.videoWidth || undefined, height: video.videoHeight || undefined, poster, ext: 'mp4' });
    }
    if (poster) add({ kind: 'image', url: poster, ext: 'jpg' });
  }

  for (const el of query('lottie-player, dotlottie-player, dotlottie-wc, lottie-web')) {
    const src = el.getAttribute('src');
    const url = src ? absolute(src) : null;
    if (url) add({ kind: 'lottie', url, ext: 'json' });
  }
  for (const entry of root ? [] : performance.getEntriesByType('resource')) {
    if (/\.lottie(\?|$)|lottie[^/]*\.json(\?|$)/i.test(entry.name)) add({ kind: 'lottie', url: entry.name, ext: 'json' });
  }

  // CSS backgrounds (hero images, sprites, patterns) are assets too, and the page rarely has them as <img>.
  const elements = (root ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(document.body?.querySelectorAll('*') ?? [])).slice(0, MAX_BACKGROUND_SCAN);
  for (const el of elements) {
    if (isPixelPeek(el)) continue;
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none') continue;
    for (const match of bg.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const url = absolute(match[1]);
      if (!url) continue;
      const rect = el.getBoundingClientRect();
      add({ kind: imageKind(url, Math.round(rect.width), Math.round(rect.height)), url, ext: 'png' });
    }
  }

  // The favicon and share image belong to the page, not to an element.
  for (const link of root ? [] : Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]'))) {
    const url = absolute(link.href);
    if (url) add({ kind: 'icon', url, ext: 'png' });
  }
  const og = root ? undefined : document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
  const ogUrl = og ? absolute(og) : null;
  if (ogUrl) add({ kind: 'image', url: ogUrl, ext: 'png' });

  return assets;
}
