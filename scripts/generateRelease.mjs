import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cdnReleaseBase, entryHtmlName, releaseHtmlName } from './releaseConfig.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectRoot, 'dist');
const releaseDir = path.join(projectRoot, 'release');

function fail(message) {
  console.error(`\n[generateRelease] ${message}\n`);
  process.exit(1);
}

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

if (!fs.existsSync(distDir)) fail('dist/ not found. Run `npm run build` first.');

const files = collectFiles(distDir).sort();
if (!files.length) fail('dist/ is empty.');

const hash = crypto.createHash('sha256');
for (const filePath of files) {
  hash.update(path.relative(distDir, filePath).replaceAll(path.sep, '/'));
  hash.update(fs.readFileSync(filePath));
}

const releaseHash = hash.digest('hex').slice(0, 12);
const baseHref = `${cdnReleaseBase}/${releaseHash}/`;
const distHtmlPath = path.join(distDir, entryHtmlName);
if (!fs.existsSync(distHtmlPath)) fail(`dist/${entryHtmlName} not found.`);

let html = fs.readFileSync(distHtmlPath, 'utf8');
html = html.replace(/[ \t]*<base\b[^>]*>\s*\n?/i, '');
html = html.replace(/<head>/i, `<head>\n  <base href="${baseHref}">`);

fs.mkdirSync(releaseDir, { recursive: true });
fs.writeFileSync(path.join(releaseDir, releaseHtmlName), html);
fs.writeFileSync(path.join(releaseDir, 'release.json'), `${JSON.stringify({ releaseHash, baseHref }, null, 2)}\n`);

console.log(`[generateRelease] release/${releaseHtmlName}`);
console.log(`[generateRelease] base href: ${baseHref}`);
