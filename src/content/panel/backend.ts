import type { PageScan } from '../scan/page-scan';
import type { Asset } from '../assets/collect';
import type { ZipResult } from '../assets/download';
import type { FigmaResult, FigmaScope } from '../figma/to-svg';
import type { ComponentGroup } from '../scan/components';

export interface CloneSummary {
  filename: string;
  sizeMb: number;
  warnings: string[];
}

// Everything the page-wide views need from the page itself. The floating panel runs inside the
// page and calls straight through; the side panel is a separate document and reaches the same
// functions by messaging the content script.
export interface PageBackend {
  scan(): Promise<PageScan>;
  collectAssets(): Promise<Asset[]>;
  scanComponents(): Promise<ComponentGroup[]>;
  // False when the file could not be read and was opened in a tab instead.
  downloadAsset(id: string): Promise<boolean>;
  downloadZip(ids: string[], onProgress: (done: number, total: number) => void): Promise<ZipResult>;
  // The page, the visible area, or the locked element as SVG that Figma turns into layers.
  buildFigma(scope: FigmaScope): Promise<FigmaResult>;
  // Builds the self-contained copy and saves it.
  clone(onProgress: (message: string) => void): Promise<CloneSummary>;
}
