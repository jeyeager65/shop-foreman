import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { defineConfig } from 'vitest/config';

// The app's version is the package's; a build made by a host that says which commit it is from carries that too.
const version = (JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')) as { version: string }).version;
// Only a value that is a commit id: on Cloudflare one of these has held the branch's name ("main").
const commit = [process.env.WORKERS_CI_COMMIT_SHA, process.env.CF_PAGES_COMMIT_SHA, process.env.GITHUB_SHA].find((v) => v && /^[0-9a-f]{7,40}$/i.test(v))?.slice(0, 7) ?? '';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit) },
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    // Tests that build whole jobs take seconds each, more when every file runs at once.
    testTimeout: 30000,
    server: { deps: { inline: ['vuetify'] } },
  },
});
