// Devices the responsive preview can simulate. Sizes are CSS pixels (what a page's media queries see),
// not physical pixels, so a page lays out here the way it does on the real device.

export type DeviceCategory = 'responsive' | 'phones' | 'tablets' | 'desktop' | 'watches';

// How the picture frame around the screen is drawn.
export type FrameStyle = 'island' | 'notch' | 'home' | 'punch' | 'fold' | 'tablet' | 'laptop' | 'monitor' | 'watch' | 'plain';

export interface Device {
  id: string;
  name: string;
  category: DeviceCategory;
  width: number;
  height: number;
  frame: FrameStyle;
}

const d = (id: string, name: string, category: DeviceCategory, width: number, height: number, frame: FrameStyle): Device => ({
  id, name, category, width, height, frame,
});

export const DEVICES: Device[] = [
  d('responsive', 'Responsive', 'responsive', 390, 780, 'plain'),

  d('iphone-16-pro-max', 'iPhone 16 Pro Max', 'phones', 440, 956, 'island'),
  d('iphone-16-pro', 'iPhone 16 Pro', 'phones', 402, 874, 'island'),
  d('iphone-16-plus', 'iPhone 16 Plus', 'phones', 430, 932, 'island'),
  d('iphone-16', 'iPhone 16', 'phones', 393, 852, 'island'),
  d('iphone-15-pro', 'iPhone 15 Pro', 'phones', 393, 852, 'island'),
  d('iphone-14', 'iPhone 14', 'phones', 390, 844, 'notch'),
  d('iphone-13-mini', 'iPhone 13 mini', 'phones', 375, 812, 'notch'),
  d('iphone-se', 'iPhone SE', 'phones', 375, 667, 'home'),
  d('pixel-9-pro', 'Pixel 9 Pro', 'phones', 412, 915, 'punch'),
  d('pixel-8', 'Pixel 8', 'phones', 412, 915, 'punch'),
  d('pixel-7', 'Pixel 7', 'phones', 412, 915, 'punch'),
  d('galaxy-s24', 'Galaxy S24', 'phones', 360, 780, 'punch'),
  d('galaxy-s24-ultra', 'Galaxy S24 Ultra', 'phones', 384, 824, 'punch'),
  d('galaxy-s23', 'Galaxy S23', 'phones', 360, 780, 'punch'),
  d('galaxy-z-fold-5', 'Galaxy Z Fold 5 (folded)', 'phones', 344, 882, 'fold'),

  d('ipad-pro-13', 'iPad Pro 13"', 'tablets', 1032, 1376, 'tablet'),
  d('ipad-pro-11', 'iPad Pro 11"', 'tablets', 834, 1194, 'tablet'),
  d('ipad-air', 'iPad Air', 'tablets', 820, 1180, 'tablet'),
  d('ipad-mini', 'iPad mini', 'tablets', 744, 1133, 'tablet'),
  d('galaxy-tab-s9', 'Galaxy Tab S9', 'tablets', 800, 1280, 'tablet'),

  d('macbook-air-13', 'MacBook Air 13"', 'desktop', 1440, 900, 'laptop'),
  d('macbook-pro-14', 'MacBook Pro 14"', 'desktop', 1512, 982, 'laptop'),
  d('macbook-pro-16', 'MacBook Pro 16"', 'desktop', 1728, 1117, 'laptop'),
  d('imac-24', 'iMac 24"', 'desktop', 2240, 1260, 'monitor'),
  d('desktop-hd', 'Desktop HD', 'desktop', 1920, 1080, 'monitor'),

  d('apple-watch-10', 'Apple Watch Series 10', 'watches', 208, 248, 'watch'),
  d('apple-watch-ultra-2', 'Apple Watch Ultra 2', 'watches', 205, 251, 'watch'),
];

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  responsive: 'Responsive',
  phones: 'Phones',
  tablets: 'Tablets',
  desktop: 'Desktop',
  watches: 'Watches',
};

export const QUICK_START = 'iphone-16-pro';

export function deviceById(id: string): Device | undefined {
  return DEVICES.find((device) => device.id === id);
}
