// Stamps sw.js with a version fingerprinted from the app files and the list of files to cache offline.
//   node scripts/stamp-sw.mjs              update sw.js in place
//   node scripts/stamp-sw.mjs --out _site  write a deployable copy of the app (used by GitHub Pages)

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOP_FILES = ['index.html', 'styles.css', 'manifest.webmanifest'];
const DIRS = ['icons', 'js'];
const VERSION_RE = /const VERSION = '[^']*';/;
const ASSETS_RE = /const ASSETS = \[[\s\S]*?\];/;

function walk(dir) {
  return readdirSync(join(ROOT, dir)).flatMap(name => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

/** Every file the app needs (what gets cached offline and deployed), sorted. sw.js itself is handled separately. */
export function appFiles() {
  return [...TOP_FILES, ...DIRS.flatMap(walk)].filter(f => !/(^|\/)\./.test(f)).sort();
}

/**
 * Return sw.js source with VERSION and ASSETS filled in. The version hashes every file's path and
 * contents plus the service worker's own code, so it changes exactly when something changes.
 */
export function stampSource(sw, files, read = f => readFileSync(join(ROOT, f))) {
  if (!VERSION_RE.test(sw) || !ASSETS_RE.test(sw)) throw new Error('sw.js is missing the VERSION or ASSETS line');
  const assets = `const ASSETS = [\n${['./', ...files].map(f => `  '${f}',`).join('\n')}\n];`;
  const template = sw.replace(VERSION_RE, "const VERSION = '';").replace(ASSETS_RE, assets);
  const hash = createHash('sha256').update(template);
  for (const f of files) hash.update(`\0${f}\0`).update(read(f));
  return template.replace(VERSION_RE, `const VERSION = 'chord-coach-${hash.digest('hex').slice(0, 10)}';`);
}

const versionOf = sw => sw.match(VERSION_RE)[0].split("'")[1];

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = appFiles();
  const swPath = join(ROOT, 'sw.js');
  const before = readFileSync(swPath, 'utf8');
  const stamped = stampSource(before, files);
  const outIdx = process.argv.indexOf('--out');

  if (outIdx > -1) {
    const out = join(ROOT, process.argv[outIdx + 1] || '_site');
    rmSync(out, { recursive: true, force: true });
    for (const f of files) {
      mkdirSync(dirname(join(out, f)), { recursive: true });
      copyFileSync(join(ROOT, f), join(out, f));
    }
    writeFileSync(join(out, 'sw.js'), stamped);
    console.log(`Built ${files.length + 1} files into ${out} (version ${versionOf(stamped)})`);
  } else if (stamped !== before) {
    writeFileSync(swPath, stamped);
    console.log(`sw.js version: ${versionOf(before)} → ${versionOf(stamped)}`);
  } else {
    console.log(`sw.js version unchanged (${versionOf(stamped)})`);
  }
}
