# Publishing PixelPeek on the Chrome Web Store

Everything in this folder is ready. What is left is yours to do: accounts, the fee, hosting the privacy policy, and clicking Submit.

## What is in this folder

| File | What it is |
|---|---|
| `pixelpeek-1.1.1.zip` | The package to upload (the contents of `dist/`, with `manifest.json` at the top). |
| `listing.md` | Every text field for the listing, the privacy answers, and which image goes where. |
| `privacy-policy.html` | The privacy policy page. Replace `YOUR-EMAIL@example.com` before hosting it. |
| `screenshots/` | Five 1280×800 screenshots. |
| `promo-tile-440x280.png` | Small promo tile (required). |
| `marquee-1400x560.png` | Marquee tile (optional). |

## 1. Host the privacy policy (about 5 minutes, free)

The store needs a public web address for it.

1. Open `privacy-policy.html` and replace `YOUR-EMAIL@example.com` (twice) with an address you are happy to show publicly.
2. Create a free GitHub account if you do not have one, and a new public repository, for example `pixelpeek`.
3. Upload `privacy-policy.html` to it. Rename it `index.html` if you want a shorter address.
4. In the repository go to Settings, then Pages, choose the `main` branch and the root folder, and save.
5. After a minute the page is live at `https://YOUR-USERNAME.github.io/pixelpeek/privacy-policy.html`. Open it to check. This is your privacy policy URL.

## 2. Register as a Chrome Web Store developer

1. Go to the Chrome Web Store Developer Dashboard and sign in with a Google account that has 2-step verification turned on.
2. Pay the one-time registration fee (it was $5 when this was written).
3. Fill in the publisher details. If asked whether you are a trader, answer for how you will run PixelPeek (a free hobby extension is usually "non-trader"; ask if unsure).

## 3. Upload and fill in the listing

1. In the dashboard click **New item** and upload `pixelpeek-1.1.1.zip`.
2. **Store listing:** copy the name, summary, description, category and language from `listing.md`. Upload the icon from the package, the five screenshots in order, and the small promo tile (and the marquee if you like).
3. **Privacy:** copy the single purpose and the four permission justifications from `listing.md`. Leave every data-usage category unticked, tick the three certifications, and paste your privacy policy URL.
4. **Distribution:** choose **Public** (or **Unlisted** if you want to test with a link first), and the regions you want (all regions is fine).
5. Click **Submit for review**.

## A note on the `debugger` permission

The responsive preview uses Chrome's `debugger` permission to switch to a mobile user agent. Chrome treats it as sensitive, so expect a slower, stricter review and be ready to explain it. The justification text is already in `listing.md`. If a reviewer pushes back, the fallback is to remove `"debugger"` from `manifest.json`: the preview then still works as a frame, without the mobile user agent.

## 4. After you submit

- Review usually takes a few days, sometimes longer for a first submission. You get an email when it is approved or if something needs changing.
- If it is rejected, the email names the reason. Common ones are a missing privacy policy, permissions that are not justified, or a description that does not match the extension. Fix it, raise the version in `manifest.json` (for example to `1.0.1`), rebuild, and upload a new zip.
- Once approved, your listing has an address. Share it, and anyone can click **Add to Chrome**. It also installs in Edge, Brave, Arc and Opera.

## Releasing an update later

1. Change `version` in `manifest.json` (it must go up each time).
2. Run `npm run build`.
3. Zip the contents of `dist/` (not the folder itself) so `manifest.json` is at the top level.
4. Dashboard, then your item, then **Package**, then **Upload new package**, and submit.

Chrome updates installed copies automatically after the update is approved.
