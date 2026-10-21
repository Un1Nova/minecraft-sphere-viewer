import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  base: '/minecraft-sphere-viewer/',
  publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('../dist/', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
