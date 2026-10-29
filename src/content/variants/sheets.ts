// Real sites usually serve their CSS from another domain (LinkedIn: static.licdn.com), and the
// browser then refuses to let an extension read `sheet.cssRules` (SecurityError). Reading it
// through a normal cross-origin fetch works whenever the CDN allows CORS, which most do, so
// the text is downloaded and parsed into a constructed stylesheet. That copy is only ever
// read by the scanner; it is never attached to the page.

type Root = Document | ShadowRoot;

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 8_000_000;

// href -> the readable copy, or null when the fetch failed (no CORS, blocked, too large).
const fetched = new Map<string, CSSStyleSheet | null>();
const inflight = new Map<string, Promise<void>>();

function canRead(sheet: CSSStyleSheet): boolean {
  try {
    void sheet.cssRules;
    return true;
  } catch {
    return false;
  }
}

function pageSheets(root: Root): CSSStyleSheet[] {
  return [...Array.from(root.styleSheets), ...(root.adoptedStyleSheets ?? [])];
}

async function fetchReadableCopy(original: CSSStyleSheet, href: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(href, { mode: 'cors', credentials: 'omit', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('too large');

    const copy = new CSSStyleSheet({ media: original.media.mediaText });
    await copy.replace(text);
    fetched.set(href, copy);
  } catch {
    fetched.set(href, null);
  } finally {
    clearTimeout(timeout);
  }
}

// Starts (or joins) the download of every unreadable stylesheet. Safe to call repeatedly:
// each href is only fetched once, so it can also pick up stylesheets added later.
export function prefetchStylesheets(root: Root): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const sheet of pageSheets(root)) {
    const href = sheet.href;
    if (!href || !/^https?:/.test(href) || canRead(sheet) || fetched.has(href)) continue;

    let job = inflight.get(href);
    if (!job) {
      job = fetchReadableCopy(sheet, href).finally(() => inflight.delete(href));
      inflight.set(href, job);
    }
    jobs.push(job);
  }
  return Promise.all(jobs).then(() => undefined);
}

// Every stylesheet the scanner can read, in document order (a downloaded copy takes the place of
// the sheet it replaces so rule order stays right), plus how many could not be read at all.
export function getReadableSheets(root: Root): { sheets: CSSStyleSheet[]; unreadable: number } {
  const sheets: CSSStyleSheet[] = [];
  let unreadable = 0;
  for (const sheet of pageSheets(root)) {
    if (canRead(sheet)) {
      sheets.push(sheet);
      continue;
    }
    const copy = sheet.href ? fetched.get(sheet.href) : null;
    if (copy) sheets.push(copy);
    else unreadable++;
  }
  return { sheets, unreadable };
}
