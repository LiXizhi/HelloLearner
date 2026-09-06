import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const rootDir = import.meta.dirname;
const entryHtmlName = 'HelloLearner.html';
const sideBySideEntries = ['SKILL.md', 'data'];
const localAiChatUrl = '../AIChat/AIChat.html';
const releaseAiChatUrl = 'https://keepwork.com/api/raw/maisi/maisi/webgames/tools/AIChat/release/AIChat_v1.html';
const sdkCdnBase = 'https://cdn.keepwork.com/sdk/keepworkSDK.iife.js';

function useReleaseAiChat() {
  return {
    name: 'use-release-aichat',
    apply: 'build',
    transform(code, id) {
      if (path.basename(id).split('?')[0] !== 'aichat-bridge.js') return null;
      if (!code.includes(localAiChatUrl)) {
        throw new Error(`Unable to find local AIChat URL in aichat-bridge.js: ${localAiChatUrl}`);
      }
      return code.replace(localAiChatUrl, releaseAiChatUrl);
    },
  };
}

// Download the live keepworkSDK bundle and return a short content hash. A random
// query param busts the CDN edge cache so we always hash the freshest bytes; the
// `?v=` we then ship is the hash of the *contents*, not that throwaway buster.
async function fetchSdkContentHash() {
  const cacheBuster = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await fetch(`${sdkCdnBase}?v=${cacheBuster}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`download failed (${res.status} ${res.statusText})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

// Rewrite `export const SDK_CDN_URL = '…keepworkSDK.iife.js?v=<hash>'` in
// js/config.js so the shipped version param matches the live SDK's content hash.
// Runs first in buildStart (before the entry is read), so the bundled JS gets
// the new hash. Falls back to keeping the existing ?v= if the CDN is unreachable.
function syncSdkCdnVersion() {
  return {
    name: 'sync-sdk-cdn-version',
    apply: 'build',
    async buildStart() {
      let hash;
      try {
        hash = await fetchSdkContentHash();
      } catch (err) {
        this.warn(`[sync-sdk-cdn-version] keeping existing SDK_CDN_URL ?v= — ${err.message}`);
        return;
      }
      const configPath = path.join(rootDir, 'js', 'config.js');
      const config = fs.readFileSync(configPath, 'utf8');
      const pattern = /(export const SDK_CDN_URL = ['"]https:\/\/cdn\.keepwork\.com\/sdk\/keepworkSDK\.iife\.js)(?:\?v=[^'"]*)?(['"])/;
      if (!pattern.test(config)) {
        this.warn('[sync-sdk-cdn-version] SDK_CDN_URL not found in js/config.js');
        return;
      }
      const next = config.replace(pattern, `$1?v=${hash}$2`);
      if (next === config) {
        console.log(`[sync-sdk-cdn-version] SDK_CDN_URL already current (?v=${hash})`);
        return;
      }
      fs.writeFileSync(configPath, next);
      console.log(`[sync-sdk-cdn-version] SDK_CDN_URL ?v=${hash}`);
    },
  };
}

function copyRuntimeResources() {
  return {
    name: 'copy-runtime-resources',
    closeBundle() {
      const distDir = path.join(rootDir, 'dist');
      for (const entryName of sideBySideEntries) {
        const pathParts = entryName.split('/');
        const source = path.join(rootDir, ...pathParts);
        const target = path.join(distDir, ...pathParts);
        if (!fs.existsSync(source)) continue;
        fs.rmSync(target, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.cpSync(source, target, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: rootDir,
  base: './',
  publicDir: false,
  plugins: [syncSdkCdnVersion(), useReleaseAiChat(), copyRuntimeResources()],
  server: {
    host: '127.0.0.1',
    port: 3005,
    open: `/${entryHtmlName}`,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        HelloLearner: path.join(rootDir, entryHtmlName),
        AvatarPreview: path.join(rootDir, 'avatar-preview.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
