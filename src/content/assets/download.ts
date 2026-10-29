import { createZip } from './zip';
import type { ZipEntry } from './zip';
import type { Asset } from './collect';

// No `downloads` permission needed: an object URL on a throwaway <a download> saves the file
// straight from the page, which is all the extension has to do.
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function saveText(text: string, filename: string, type = 'text/plain'): void {
  saveBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

const FETCH_TIMEOUT_MS = 12_000;

// The file's bytes, or null when the page's own CORS rules stop the extension reading them.
export async function fetchBytes(url: string): Promise<Blob | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { credentials: 'omit', signal: controller.signal });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function bytesOf(asset: Asset): Promise<Blob | null> {
  if (asset.svg) return new Blob([asset.svg], { type: 'image/svg+xml' });
  return asset.url ? fetchBytes(asset.url) : null;
}

// Returns false when the file could not be read; it is then opened in a tab so it can be saved by hand.
export async function downloadAsset(asset: Asset): Promise<boolean> {
  const blob = await bytesOf(asset);
  if (blob) {
    saveBlob(blob, asset.filename);
    return true;
  }
  if (asset.url) {
    const link = document.createElement('a');
    link.href = asset.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.click();
  }
  return false;
}

export interface ZipResult {
  saved: number;
  skipped: number;
}

export async function downloadAssetsZip(
  assets: Asset[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ZipResult> {
  const entries: ZipEntry[] = [];
  const used = new Set<string>();
  let skipped = 0;
  let done = 0;

  // Small pool: enough to be quick without hammering the site.
  const queue = [...assets];
  const worker = async (): Promise<void> => {
    for (let asset = queue.shift(); asset; asset = queue.shift()) {
      const blob = await bytesOf(asset);
      if (blob) {
        let name = asset.filename;
        for (let n = 2; used.has(name); n++) name = asset.filename.replace(/(\.[^.]*)?$/, `-${n}$1`);
        used.add(name);
        entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
      } else {
        skipped++;
      }
      onProgress?.(++done, assets.length);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));

  if (entries.length) saveBlob(createZip(entries), zipName);
  return { saved: entries.length, skipped };
}
