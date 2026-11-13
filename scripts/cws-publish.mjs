// Uploads a package to the Chrome Web Store and submits it for review (Chrome Web Store API v2).
// usage: node scripts/cws-publish.mjs path/to/package.zip
// env: CWS_SERVICE_ACCOUNT (the service account's JSON key), CWS_PUBLISHER_ID, CWS_EXTENSION_ID
import { createSign } from 'crypto';
import { readFileSync } from 'fs';

const zipPath = process.argv[2];
const { CWS_SERVICE_ACCOUNT, CWS_PUBLISHER_ID, CWS_EXTENSION_ID } = process.env;
if (!zipPath || !CWS_SERVICE_ACCOUNT || !CWS_PUBLISHER_ID || !CWS_EXTENSION_ID) {
  console.error('Missing the package path or one of CWS_SERVICE_ACCOUNT, CWS_PUBLISHER_ID, CWS_EXTENSION_ID.');
  process.exit(1);
}

const API = 'https://chromewebstore.googleapis.com';
const item = `publishers/${CWS_PUBLISHER_ID.trim()}/items/${CWS_EXTENSION_ID.trim()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (data) => Buffer.from(data).toString('base64url');

// A service account signs a short-lived JWT and trades it for an access token.
async function accessToken() {
  const key = JSON.parse(CWS_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(key.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Could not get an access token: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function call(token, method, url, body, headers = {}) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${url} failed (${res.status}): ${text}`);
  return json;
}

const token = await accessToken();

console.log(`Uploading ${zipPath}...`);
const upload = await call(token, 'POST', `${API}/upload/v2/${item}:upload`, readFileSync(zipPath), { 'Content-Type': 'application/zip' });
console.log('Upload:', JSON.stringify(upload));

// Large uploads are processed in the background; wait for them to finish before submitting.
let state = upload.uploadState;
for (let i = 0; state === 'IN_PROGRESS' && i < 60; i++) {
  await sleep(5000);
  state = (await call(token, 'GET', `${API}/v2/${item}:fetchStatus`)).lastAsyncUploadState;
}
if (state !== 'SUCCEEDED') throw new Error(`Upload did not succeed (state: ${state}).`);

const published = await call(token, 'POST', `${API}/v2/${item}:publish`, JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }), { 'Content-Type': 'application/json' });
console.log('Submitted for review:', JSON.stringify(published));
