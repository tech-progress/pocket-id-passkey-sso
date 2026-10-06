import assert from 'node:assert/strict';
import test from 'node:test';
import { DOC_FILES, loadDocs, verifyDocs } from '../scripts/verify-docs.mjs';

const baseline = loadDocs();
const copy = () => structuredClone(baseline);

test('shipped public docs pass the bounded offline contract', () => {
  assert.deepEqual(verifyDocs(baseline), { version: baseline.version, files: DOC_FILES.length });
});

test('reject version drift and malformed VERSION', () => {
  const changed = copy();
  changed.version = '9.9.9';
  assert.throws(() => verifyDocs(changed), /current recipe version missing/);
  changed.version = '1.0.1-published';
  assert.throws(() => verifyDocs(changed), /expected recipe semver/);
});

test('reject a missing current version in each public guide', () => {
  for (const filename of DOC_FILES.filter((name) => name !== 'CHANGELOG.md')) {
    const changed = copy();
    changed.docs[filename] = changed.docs[filename].replaceAll(`Recipe \`${baseline.version}\``, 'Recipe `0.0.0`');
    assert.throws(() => verifyDocs(changed), /current recipe version missing/, filename);
  }
});

test('reject missing or stale latest changelog entry', () => {
  const changed = copy();
  changed.docs['CHANGELOG.md'] = changed.docs['CHANGELOG.md'].replace(`## ${baseline.version} —`, '## 0.0.0 —');
  assert.throws(() => verifyDocs(changed), /latest entry must match VERSION/);
});

test('reject each missing marketplace heading and altered heading order', () => {
  const headings = baseline.docs['MARKETPLACE.md'].match(/^#{1,3} .+$/gm);
  for (const heading of headings) {
    const changed = copy();
    changed.docs['MARKETPLACE.md'] = changed.docs['MARKETPLACE.md'].replace(`${heading}\n`, '');
    assert.throws(() => verifyDocs(changed), /six required headings/, heading);
  }
  const changed = copy();
  const lines = baseline.docs['MARKETPLACE.md'].split('\n');
  const first = lines.indexOf(headings[1]);
  const second = lines.indexOf(headings[2]);
  [lines[first], lines[second]] = [lines[second], lines[first]];
  changed.docs['MARKETPLACE.md'] = lines.join('\n');
  assert.throws(() => verifyDocs(changed), /six required headings/);
});

test('reject missing upstream links in both GitHub-facing descriptions', () => {
  for (const filename of ['README.md', 'MARKETPLACE.md']) {
    for (const { url } of baseline.metadata.origins) {
      const changed = copy();
      changed.docs[filename] = changed.docs[filename].replaceAll(`](${url})`, '](https://example.org)');
      assert.throws(() => verifyDocs(changed), /metadata origin must be a public Markdown link/);
    }
  }
});

test('reject metadata description, upstream or main-product icon drift', () => {
  for (const mutate of [
    (value) => { value.metadata.description = 'Passkey SSO'; },
    (value) => { value.metadata.icon = 'https://github.com/vendor.png'; },
    (value) => { value.metadata.origins = []; },
    (value) => { value.docs['MARKETPLACE.md'] = value.docs['MARKETPLACE.md'].replace(baseline.metadata.description, 'Other description'); },
    (value) => { value.docs['MARKETPLACE.md'] = value.docs['MARKETPLACE.md'].replace(baseline.metadata.icon, 'https://example.org/icon.svg'); },
  ]) {
    const changed = copy();
    mutate(changed);
    assert.throws(() => verifyDocs(changed), /description|icon|origins/);
  }
});

test('reject private findings, encoded evidence paths and local operational links in every doc', () => {
  const leaks = [
    '\n[Private findings](FINDINGS.md)',
    '\n[Private findings](%46INDINGS.md)',
    '\n[Private report](evidence/report.json)',
    '\n[Private report][report]\n[report]: %2565vidence/report.json',
    '\n<file:///home/operator/report.json>',
    '\n<a href="/home/operator/report.json">Report</a>',
    '\n[Local tooling](/absolute/private/chromium)',
    '\n[Deployment](https://railway.com/project/00000000-0000-0000-0000-000000000000)',
    '\n[Local host](https://localhost:18428)',
    '\n[Private host](https://10.1.2.3/report)',
    '\n[Token](https://secret@example.org/report)',
    '\n[Insecure](http://example.org)',
  ];
  for (const filename of DOC_FILES) {
    for (const leak of leaks) {
      const changed = copy();
      changed.docs[filename] += `${leak}\n`;
      assert.throws(() => verifyDocs(changed), /private|operational|public|credential/i, filename);
    }
  }
});

test('allow links between shipped public guides', () => {
  const changed = copy();
  changed.docs['README.md'] += '\n[Publishing](PUBLISHING.md) and [Recovery](UPGRADE.md#restore-procedure).\n';
  assert.doesNotThrow(() => verifyDocs(changed));
});

test('reject missing docs and oversized text without walking the repository', () => {
  const missing = copy();
  delete missing.docs['SUPPORT.md'];
  assert.throws(() => verifyDocs(missing), /invalid docs text size/);
  const oversized = copy();
  oversized.docs['SUPPORT.md'] = 'x'.repeat(64 * 1024 + 1);
  assert.throws(() => verifyDocs(oversized), /invalid docs text size/);
});
