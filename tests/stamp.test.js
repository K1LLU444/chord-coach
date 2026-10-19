import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampSource, appFiles } from '../scripts/stamp-sw.mjs';

const SW = "const VERSION = 'old';\nconst ASSETS = [\n  'x',\n];\nself.addEventListener('fetch', () => {});\n";
const fake = contents => f => contents[f];
const version = sw => sw.match(/const VERSION = '([^']*)'/)[1];

test('version changes only when a file changes', () => {
  const files = ['a.js', 'b.css'];
  const one = stampSource(SW, files, fake({ 'a.js': 'let a = 1', 'b.css': 'p{}' }));
  const same = stampSource(SW, files, fake({ 'a.js': 'let a = 1', 'b.css': 'p{}' }));
  const changed = stampSource(SW, files, fake({ 'a.js': 'let a = 2', 'b.css': 'p{}' }));
  assert.equal(version(one), version(same));
  assert.notEqual(version(one), version(changed));
  assert.match(version(one), /^chord-coach-[0-9a-f]{10}$/);
});

test('stamping is repeatable and lists every file', () => {
  const read = fake({ 'a.js': '1' });
  const once = stampSource(SW, ['a.js'], read);
  assert.equal(stampSource(once, ['a.js'], read), once);
  assert.match(once, /const ASSETS = \[\n  '\.\/',\n  'a\.js',\n\];/);
});

test('changing the service worker code itself changes the version', () => {
  const read = fake({ 'a.js': '1' });
  assert.notEqual(version(stampSource(SW, ['a.js'], read)), version(stampSource(SW + '// tweak\n', ['a.js'], read)));
});

test('the real app: every file the page loads is cached for offline use', () => {
  const files = appFiles();
  for (const f of ['index.html', 'reset.html', 'styles.css', 'manifest.webmanifest', 'js/app.js', 'js/ultimate-guitar.js', 'js/views/songs.js', 'icons/icon-180.png']) {
    assert.ok(files.includes(f), f);
  }
  assert.ok(!files.some(f => f.startsWith('tests/') || f === 'package.json' || f === 'sw.js'));
  stampSource(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), files); // real sw.js has the markers
});
