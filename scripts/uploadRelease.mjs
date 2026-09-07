import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(projectRoot, '..', '..', '..', '..', '..');
const distDir = path.join(projectRoot, 'dist');
const releaseManifestPath = path.join(projectRoot, 'release', 'release.json');
const uploaderPath = path.join(
  repoRoot,
  '.github',
  'skills',
  'upload-deploy-cdn-files',
  'qiniu_upload_local_files.py',
);

function fail(message) {
  console.error(`\n[uploadRelease] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(distDir) || !fs.existsSync(releaseManifestPath)) {
  fail('Build artifacts not found. Run `npm run build` first.');
}
if (!fs.existsSync(uploaderPath)) fail(`Uploader script not found: ${uploaderPath}`);

const { baseHref } = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8'));
const remotePrefix = new URL(baseHref).pathname.replace(/^\/+/, '');
const distEntries = fs.readdirSync(distDir).map((name) => path.join(distDir, name));
if (!distEntries.length) fail('dist/ is empty.');

const pythonExe = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
console.log(`[uploadRelease] uploading dist/ to ${baseHref}`);
const result = spawnSync(
  pythonExe,
  [uploaderPath, '--prefix', remotePrefix, ...distEntries],
  { stdio: 'inherit' },
);

if (result.error) fail(`Failed to launch ${pythonExe}: ${result.error.message}`);
process.exit(result.status ?? 1);
