import type { ElementCapture } from '../types';
import { toHex } from '../capture/color';

// The library of saved elements ("inspiration"). Kept on this machine in chrome.storage.local, which
// both the page's content script and the side panel can read, so a save from either shows in both.

export interface SavedItem {
  id: string;
  savedAt: number;
  url: string;
  title: string;
  selector: string;
  tagName: string;
  width: number;
  height: number;
  text?: string;
  tailwind: string[];
  css: string[];
  colors: { role: string; value: string }[];
  font?: string;
}

const KEY = 'pixelpeek-library';
const MAX_ITEMS = 300;

const hasChromeStorage = (): boolean => typeof chrome !== 'undefined' && !!chrome.storage?.local;

async function read(): Promise<SavedItem[]> {
  try {
    if (hasChromeStorage()) {
      const result = await chrome.storage.local.get(KEY);
      return (result[KEY] as SavedItem[] | undefined) ?? [];
    }
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedItem[];
  } catch {
    return [];
  }
}

async function write(items: SavedItem[]): Promise<void> {
  if (hasChromeStorage()) await chrome.storage.local.set({ [KEY]: items });
  else localStorage.setItem(KEY, JSON.stringify(items));
}

export function listSaved(): Promise<SavedItem[]> {
  return read();
}

export async function saveElement(capture: ElementCapture, page: { url: string; title: string }): Promise<SavedItem> {
  const { layout } = capture;
  const item: SavedItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: Date.now(),
    url: page.url,
    title: page.title,
    selector: capture.selector,
    tagName: capture.tagName,
    width: layout.boxModel.content.width,
    height: layout.boxModel.content.height,
    text: capture.text,
    tailwind: layout.tailwind,
    css: layout.rawCss,
    colors: layout.colors.map((c) => ({ role: c.role, value: toHex(c.value) })),
    font: layout.typography?.fontFamily,
  };
  const items = await read();
  await write([item, ...items].slice(0, MAX_ITEMS));
  return item;
}

export async function removeSaved(id: string): Promise<void> {
  await write((await read()).filter((i) => i.id !== id));
}

export async function clearSaved(): Promise<void> {
  await write([]);
}
