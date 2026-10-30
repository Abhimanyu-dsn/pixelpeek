// MV3 activation shim: a content script cannot react to the toolbar icon, so this only injects it.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch {
    // chrome://, the Web Store and other restricted pages reject injection. Flash a badge instead of erroring.
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' });
    await chrome.action.setBadgeText({ tabId, text: '!' });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 2000);
  }
});

// The responsive preview shows the page in a frame, which sites can forbid. For those, the page asks
// for a real browser window of the device's size instead (no extra permission is needed for that).
function openWindow(message: { url?: string; width?: number; height?: number }): void {
  const { url, width, height } = message;
  if (!url || !/^https?:/.test(url) || !width || !height) return;
  chrome.windows
    .create({ url, type: 'popup', width: Math.round(width) + 16, height: Math.round(height) + 40 })
    .catch((error) => console.error('[PixelPeek] Could not open the preview window', error));
}

// Mobile emulation for the responsive preview, the same switches as Chrome's device toolbar: a phone or
// tablet user agent (so sites that pick their layout from it send the mobile version) and touch input.
// It is attached only while a device preview is open, and Chrome shows its "started debugging this
// browser" bar for as long as it is.
interface EmulationSpec {
  userAgent: string;
  platform: 'ios' | 'android';
  mobile: boolean;
  model: string;
}

const attached = new Set<number>();
// Without the permission (a build that leaves it out) the preview simply stays a frame.
chrome.debugger?.onDetach.addListener((source) => {
  if (source.tabId !== undefined) attached.delete(source.tabId);
});

const send = (tabId: number, method: string, params: object = {}): Promise<unknown> =>
  chrome.debugger.sendCommand({ tabId }, method, params);

async function emulate(tabId: number, spec: EmulationSpec | null): Promise<{ ok: boolean; error?: string }> {
  if (!chrome.debugger) return spec ? { ok: false, error: 'mobile emulation is not enabled in this build' } : { ok: true };
  try {
    if (!spec) {
      if (attached.has(tabId)) {
        await send(tabId, 'Emulation.setUserAgentOverride', { userAgent: '' }).catch(() => {});
        await send(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {});
        await send(tabId, 'Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {});
        await chrome.debugger.detach({ tabId }).catch(() => {});
        attached.delete(tabId);
      }
      return { ok: true };
    }

    if (!attached.has(tabId)) {
      await chrome.debugger.attach({ tabId }, '1.3');
      attached.add(tabId);
    }
    const brands = [
      { brand: 'Chromium', version: '130' },
      { brand: 'Google Chrome', version: '130' },
      { brand: 'Not?A_Brand', version: '99' },
    ];
    await send(tabId, 'Network.enable');
    // The same address answers differently per user agent; a cached desktop copy must not be reused.
    await send(tabId, 'Network.setCacheDisabled', { cacheDisabled: true });
    await send(tabId, 'Emulation.setUserAgentOverride', {
      userAgent: spec.userAgent,
      // Safari sends no client hints; Chrome on Android does.
      ...(spec.platform === 'android'
        ? {
            userAgentMetadata: {
              brands,
              fullVersionList: brands.map((b) => ({ ...b, version: `${b.version}.0.0.0` })),
              platform: 'Android',
              platformVersion: '14.0.0',
              architecture: '',
              model: spec.model,
              mobile: spec.mobile,
            },
          }
        : {}),
    });
    // Touch input: this is what makes (hover: none) and (pointer: coarse) true, as in the device toolbar.
    await send(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    return { ok: true };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    attached.delete(tabId);
    return { ok: false, error: /another debugger/i.test(text) ? 'close DevTools on this tab and try again' : text.slice(0, 120) };
  }
}

type Message = { pp?: string; url?: string; width?: number; height?: number; spec?: EmulationSpec | null };

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return undefined;
  if (message?.pp === 'open-window') {
    openWindow(message);
    return undefined;
  }
  if (message?.pp === 'emulate') {
    void emulate(tabId, message.spec ?? null).then(sendResponse);
    return true;
  }
  return undefined;
});
