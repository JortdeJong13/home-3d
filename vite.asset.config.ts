import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Dev-only build of the single-asset inspector (asset-viewer.html). Not the house build.
export default defineConfig({
  plugins: [viteSingleFile()],
  define: { __DEFAULT_ASSET__: JSON.stringify(process.env.ASSET ?? '') },
  build: {
    target: 'es2022',
    outDir: 'dist-asset',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    rollupOptions: { input: 'asset-viewer.html' },
  },
});
