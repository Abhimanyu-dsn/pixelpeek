import { HOST_ID } from '../shadow-root';
import { getReadableSheets, prefetchStylesheets } from '../variants/sheets';
import { fetchBytes } from '../assets/download';

export interface CloneResult {
  html: string;
  filename: string;
  // Things that could not be made self-contained, in words a person can act on.
  warnings: string[];
}

const MAX_EMBED_BYTES = 3_000_000;
const MAX_TOTAL_BYTES = 40_000_000;
const URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

class Embedder {
  private cache = new Map<string, Promise<string | null>>();
  private total = 0;
  failed = 0;

  // The URL as a data: URI, or null when it cannot be read (CORS) or is too big.
  embed(url: string): Promise<string | null> {
    if (url.startsWith('data:')) return Promise.resolve(url);
    let job = this.cache.get(url);
    if (!job) {
      job = this.load(url);
      this.cache.set(url, job);
    }
    return job;
  }

  private async load(url: string): Promise<string | null> {
    const blob = await fetchBytes(url);
    if (!blob) {
      this.failed++;
      return null;
    }
    if (blob.size > MAX_EMBED_BYTES || this.total + blob.size > MAX_TOTAL_BYTES) return null;
    this.total += blob.size;
    return toDataUrl(blob);
  }
}

function absolutize(url: string, base: string): string | null {
  if (url.startsWith('data:') || url.startsWith('#')) return null;
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

// Every url(...) in the CSS made absolute against the stylesheet it came from, and embedded
// where it can be. The ones that cannot be embedded still point at the live site.
async function rewriteCssUrls(css: string, base: string, embedder: Embedder): Promise<string> {
  const found = new Set<string>();
  for (const m of css.matchAll(URL_PATTERN)) {
    const abs = absolutize(m[2], base);
    if (abs) found.add(abs);
  }
  const resolved = new Map<string, string>();
  await Promise.all(
    Array.from(found).map(async (abs) => {
      resolved.set(abs, (await embedder.embed(abs)) ?? abs);
    }),
  );
  return css.replace(URL_PATTERN, (whole, _q: string, url: string) => {
    const abs = absolutize(url, base);
    return abs ? `url("${resolved.get(abs) ?? abs}")` : whole;
  });
}

function rulesText(sheet: CSSStyleSheet): string | null {
  try {
    return Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
  } catch {
    return null;
  }
}

async function sheetText(link: HTMLLinkElement, sheet: CSSStyleSheet | undefined): Promise<string | null> {
  if (sheet) {
    const text = rulesText(sheet);
    if (text !== null) return text;
  }
  const blob = await fetchBytes(link.href);
  return blob ? blob.text() : null;
}

function filenameFor(): string {
  const host = location.hostname.replace(/^www\./, '') || 'page';
  const path = location.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  const slug = (path ? `${host}-${path}` : host).replace(/[^\w.-]+/g, '-').slice(0, 80);
  return `${slug}.html`;
}

export async function buildPageClone(onProgress?: (message: string) => void): Promise<CloneResult> {
  const warnings: string[] = [];
  const embedder = new Embedder();

  onProgress?.('Reading stylesheets…');
  await prefetchStylesheets(document);

  const doc = document.documentElement.cloneNode(true) as HTMLElement;
  doc.querySelector(`#${HOST_ID}`)?.remove();
  doc.querySelectorAll('script, noscript, link[rel~="preload"], link[rel~="modulepreload"], link[rel~="prefetch"], meta[http-equiv="Content-Security-Policy"]').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
  });

  const head = doc.querySelector('head') ?? doc.insertBefore(document.createElement('head'), doc.firstChild);
  // Anything left relative (links, media the page loads late) still resolves to the live site.
  const base = document.createElement('base');
  base.href = document.baseURI;
  head.prepend(base);

  // Stylesheets: <link>s become <style>, with their urls embedded.
  onProgress?.('Inlining styles…');
  const originalLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'));
  const clonedLinks = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'));
  const sheetByOwner = new Map(Array.from(document.styleSheets).map((s) => [s.ownerNode, s]));

  let kept = 0;
  await Promise.all(
    clonedLinks.map(async (clonedLink, i) => {
      const original = originalLinks[i];
      const text = original ? await sheetText(original, sheetByOwner.get(original)) : null;
      if (text === null) {
        clonedLink.setAttribute('href', original?.href ?? clonedLink.href);
        kept++;
        return;
      }
      const style = document.createElement('style');
      style.textContent = await rewriteCssUrls(text, original.href, embedder);
      clonedLink.replaceWith(style);
    }),
  );
  if (kept) warnings.push(`${kept} stylesheet${kept === 1 ? '' : 's'} could not be saved and still load from the live site.`);

  // Inline <style> blocks and constructable sheets.
  for (const style of Array.from(doc.querySelectorAll('style'))) {
    if (style.textContent) style.textContent = await rewriteCssUrls(style.textContent, document.baseURI, embedder);
  }
  for (const sheet of getReadableSheets(document).sheets) {
    if (sheet.ownerNode || sheet.href) continue;
    const text = rulesText(sheet);
    if (!text) continue;
    const style = document.createElement('style');
    style.textContent = await rewriteCssUrls(text, document.baseURI, embedder);
    head.appendChild(style);
  }

  // Images: embedded, with the page's chosen resolution (currentSrc) and no srcset left to override it.
  onProgress?.('Embedding images…');
  const originalImages = Array.from(document.querySelectorAll('img'));
  const clonedImages = Array.from(doc.querySelectorAll('img'));
  doc.querySelectorAll('picture source').forEach((s) => s.remove());
  await Promise.all(
    clonedImages.map(async (img, i) => {
      const source = originalImages[i]?.currentSrc || originalImages[i]?.src;
      const abs = source ? absolutize(source, document.baseURI) : null;
      img.removeAttribute('srcset');
      img.removeAttribute('loading');
      if (!abs) return;
      img.setAttribute('src', (await embedder.embed(abs)) ?? abs);
    }),
  );

  // Inline style="" attributes with url().
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[style*="url("]'))) {
    el.setAttribute('style', await rewriteCssUrls(el.getAttribute('style') ?? '', document.baseURI, embedder));
  }

  // Canvas content and video frames do not survive serialisation.
  const canvases = doc.querySelectorAll('canvas').length;
  const videos = doc.querySelectorAll('video').length;
  if (canvases) warnings.push(`${canvases} canvas element${canvases === 1 ? '' : 's'} will be blank.`);
  if (videos) warnings.push(`${videos} video${videos === 1 ? '' : 's'} still stream from the live site.`);
  if (embedder.failed) warnings.push(`${embedder.failed} file${embedder.failed === 1 ? '' : 's'} blocked by the site were left as links to the live site.`);

  const comment = `<!-- Saved with PixelPeek from ${document.URL} on ${new Date().toISOString()} -->\n`;
  return {
    html: `<!DOCTYPE html>\n${comment}${doc.outerHTML}`,
    filename: filenameFor(),
    warnings,
  };
}
