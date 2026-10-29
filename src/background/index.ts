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
chrome.runtime.onMessage.addListener((message: { pp?: string; url?: string; width?: number; height?: number }, sender) => {
  if (message?.pp !== 'open-window' || sender.tab?.id === undefined) return;
  const { url, width, height } = message;
  if (!url || !/^https?:/.test(url) || !width || !height) return;
  chrome.windows
    .create({ url, type: 'popup', width: Math.round(width) + 16, height: Math.round(height) + 40 })
    .catch((error) => console.error('[PixelPeek] Could not open the preview window', error));
});
