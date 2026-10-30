import type { Device } from './devices';

// What a real phone or tablet tells a website about itself. A page in a narrow frame already answers
// to the width, but plenty of sites also look at the user agent (and at hover and touch) before they
// pick their mobile layout, which is what Chrome's device toolbar switches on.

export interface Emulation {
  userAgent: string;
  platform: 'ios' | 'android';
  // False for tablets: Chrome's user agent leaves out "Mobile" there.
  mobile: boolean;
  model: string;
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET_UA = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// null means "leave the browser as it is" (laptops, monitors, watches and wide custom sizes).
export function emulationFor(device: Device, width: number): Emulation | null {
  const apple = /iphone|ipad/i.test(device.name);
  switch (device.category) {
    case 'phones':
      return apple
        ? { userAgent: IPHONE_UA, platform: 'ios', mobile: true, model: 'iPhone' }
        : { userAgent: ANDROID_PHONE_UA, platform: 'android', mobile: true, model: 'Pixel 8' };
    case 'tablets':
      return apple
        ? { userAgent: IPAD_UA, platform: 'ios', mobile: false, model: 'iPad' }
        : { userAgent: ANDROID_TABLET_UA, platform: 'android', mobile: false, model: 'SM-X710' };
    case 'responsive':
      if (width < 768) return { userAgent: ANDROID_PHONE_UA, platform: 'android', mobile: true, model: 'Pixel 8' };
      if (width < 1024) return { userAgent: IPAD_UA, platform: 'ios', mobile: false, model: 'iPad' };
      return null;
    default:
      return null;
  }
}
