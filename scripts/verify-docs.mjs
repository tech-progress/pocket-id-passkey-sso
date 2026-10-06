import assert from 'node:assert/strict';
import { closeSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DOC_FILES = Object.freeze([
  'README.md', 'PUBLISHING.md', 'SUPPORT.md', 'UPGRADE.md',
  'MARKETPLACE.md', 'CHANGELOG.md',
]);
const MAX_FILE_BYTES = 64 * 1024;
const TEMPLATE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const MARKETPLACE_HEADINGS = [
  '# Deploy and Host Pocket ID on Railway',
  '## About Hosting Pocket ID',
  '## Why Deploy Pocket ID on Railway?',
  '## Common Use Cases',
  '## Dependencies for Pocket ID Hosting',
  '### Deployment Dependencies',
];
const UPSTREAM_URLS = ['https://pocket-id.org', 'https://github.com/pocket-id/pocket-id'];
const PRODUCT_ICON = 'https://raw.githubusercontent.com/pocket-id/pocket-id/v2.17.0/frontend/static/img/static-logo.svg';
const DESCRIPTION = 'Passkey OIDC identity with guarded setup and persistent SQLite.';

function readBounded(root, filename) {
  const descriptor = openSync(resolve(root, filename), 'r');
  try {
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    assert.ok(length > 0 && length <= MAX_FILE_BYTES, `${filename}: invalid docs file size`);
    return bytes.toString('utf8', 0, length);
  } finally {
    closeSync(descriptor);
  }
}

export function loadDocs(root = TEMPLATE_ROOT) {
  return {
    version: readBounded(root, 'VERSION').trim(),
    docs: Object.fromEntries(DOC_FILES.map((name) => [name, readBounded(root, name)])),
    metadata: JSON.parse(readBounded(root, 'marketplace-metadata.json')),
  };
}

function decodeForInspection(value) {
  for (let pass = 0; pass < 2; pass++) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  return value;
}

function checkPublicText(filename, text) {
  assert.ok(typeof text === 'string' && text.length > 0 && Buffer.byteLength(text) <= MAX_FILE_BYTES,
    `${filename}: invalid docs text size`);
  const inspected = decodeForInspection(text);
  assert.ok(!/(?:FINDINGS\.md|LICENSE_REVIEW\.md|(?:^|[\s/(])evidence\/|(?:\/home\/|\/Users\/|\/tmp\/|\/secure\/|\/absolute\/|\.t3\/|\.codex\/)|file:\/\/|vscode:\/\/)/im.test(inspected),
    `${filename}: private document or local operational path`);
  assert.ok(!/https?:\/\/[^\s<>)]*(?:railway\.(?:com|app)\/(?:project|deploy|template)\/|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i.test(inspected),
    `${filename}: operational ID or deployment link`);

  // Inspect inline/reference Markdown, autolinks and HTML attributes locally.
  const targets = [
    ...Array.from(text.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)/g), (match) => match[1]),
    ...Array.from(text.matchAll(/^\s*\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm), (match) => match[1]),
    ...Array.from(text.matchAll(/<(https?:\/\/[^>\n]+)>/g), (match) => match[1]),
    ...Array.from(text.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi), (match) => match[1]),
  ];
  for (const raw of targets) {
    const target = decodeForInspection(raw.replace(/^<|>$/g, ''));
    if (target.startsWith('#')) continue;
    if (DOC_FILES.some((name) => target === name || target.startsWith(`${name}#`))) continue;
    assert.ok(target.startsWith('https://'), `${filename}: link must be public HTTPS or a shipped doc`);
    const url = new URL(target);
    assert.ok(!url.username && !url.password, `${filename}: credential-bearing link`);
    assert.ok(!/^(?:localhost|127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|\[)/i.test(url.hostname)
      && url.hostname.includes('.') && !/\.(?:internal|local|test)$/i.test(url.hostname),
    `${filename}: link is not a public host`);
  }
}

export function verifyDocs({ version, docs, metadata }) {
  assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/, 'VERSION: expected recipe semver');
  for (const filename of DOC_FILES) {
    checkPublicText(filename, docs[filename]);
    if (filename !== 'CHANGELOG.md') {
      assert.ok(docs[filename].includes(`Recipe \`${version}\``), `${filename}: current recipe version missing`);
    }
  }
  const escapedVersion = version.replaceAll('.', '\\.');
  const latest = docs['CHANGELOG.md'].match(/^## (\d+\.\d+\.\d+) — /m);
  assert.equal(latest?.[1], version, 'CHANGELOG.md: latest entry must match VERSION');
  assert.match(docs['CHANGELOG.md'], new RegExp(`^## ${escapedVersion} — \\d{4}-\\d{2}-\\d{2}`, 'm'),
    'CHANGELOG.md: dated current entry missing');
  const headings = docs['MARKETPLACE.md'].match(/^#{1,3} .+$/gm);
  assert.deepEqual(headings, MARKETPLACE_HEADINGS, 'MARKETPLACE.md: six required headings/order');
  assert.ok(docs['MARKETPLACE.md'].startsWith(`${MARKETPLACE_HEADINGS[0]}\n`),
    'MARKETPLACE.md: must start with Deploy and Host heading');

  assert.equal(metadata.description, DESCRIPTION, 'metadata: Pocket ID description changed');
  assert.ok(metadata.description.length >= 45 && metadata.description.length <= 75,
    'metadata: description must contain 45–75 characters');
  assert.equal(metadata.icon, PRODUCT_ICON, 'metadata: use the pinned main product icon');
  assert.ok(Array.isArray(metadata.origins) && metadata.origins.length >= UPSTREAM_URLS.length,
    'metadata: main upstream origins missing');
  for (const url of UPSTREAM_URLS) {
    assert.ok(metadata.origins.some((origin) => origin.url === url), 'metadata: Pocket ID upstream link missing');
  }
  for (const filename of ['README.md', 'MARKETPLACE.md']) {
    for (const { url } of metadata.origins) {
      assert.ok(typeof url === 'string' && docs[filename].includes(`](${url})`),
        `${filename}: metadata origin must be a public Markdown link`);
    }
  }
  assert.ok(docs['MARKETPLACE.md'].includes(DESCRIPTION), 'MARKETPLACE.md: metadata description missing');
  assert.ok(docs['MARKETPLACE.md'].includes(`](${PRODUCT_ICON})`), 'MARKETPLACE.md: product icon missing');
  return { version, files: DOC_FILES.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = verifyDocs(loadDocs());
  console.log(`PASS: recipe ${result.version}, ${result.files} public docs; version/headings/links/privacy checks only.`);
}
