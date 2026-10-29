import { scanPage } from '../scan/page-scan';
import { collectAssets } from '../assets/collect';
import type { Asset } from '../assets/collect';
import { downloadAsset, downloadAssetsZip, saveText } from '../assets/download';
import { buildPageClone } from '../clone/clone';
import { scanComponents } from '../scan/components';
import type { ComponentGroup } from '../scan/components';
import { buildFigmaSvg } from '../figma/to-svg';
import type { FigmaResult, FigmaScope } from '../figma/to-svg';
import type { CloneSummary, PageBackend } from './backend';

// Runs in the page's own context. Files are saved from here (not from the side panel) so the
// fetches use the page's origin and cookies-free CORS rules, same as the floating panel.
export class LocalBackend implements PageBackend {
  private assets = new Map<string, Asset>();

  // The element PixelPeek has locked right now, if any.
  constructor(private getLocked: () => Element | null = () => null) {}

  scan(): ReturnType<PageBackend['scan']> {
    return scanPage();
  }

  async collectAssets(): Promise<Asset[]> {
    // With an element selected, only what is inside it.
    // A shape or path inside an icon belongs to that icon, so the whole icon is the asset.
    const locked = this.getLocked();
    const list = collectAssets(locked ? (locked.closest('svg') ?? locked) : undefined);
    this.assets = new Map(list.map((asset) => [asset.id, asset]));
    return list;
  }

  async downloadAsset(id: string): Promise<boolean> {
    const asset = this.assets.get(id);
    return asset ? downloadAsset(asset) : false;
  }

  async scanComponents(): Promise<ComponentGroup[]> {
    return scanComponents();
  }

  downloadZip(ids: string[], onProgress: (done: number, total: number) => void): ReturnType<PageBackend['downloadZip']> {
    const list = ids.map((id) => this.assets.get(id)).filter((a): a is Asset => !!a);
    const host = location.hostname.replace(/^www\./, '') || 'page';
    return downloadAssetsZip(list, `${host}-assets.zip`, onProgress);
  }

  async buildFigma(scope: FigmaScope): Promise<FigmaResult> {
    const locked = this.getLocked();
    if (scope === 'element') {
      if (!locked) throw new Error('Lock an element first.');
      return buildFigmaSvg(locked, 'element');
    }
    return buildFigmaSvg(document.body, scope);
  }

  async clone(onProgress: (message: string) => void): Promise<CloneSummary> {
    const result = await buildPageClone(onProgress);
    saveText(result.html, result.filename, 'text/html');
    return { filename: result.filename, sizeMb: result.html.length / 1024 / 1024, warnings: result.warnings };
  }
}
