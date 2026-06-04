import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import dts from 'vite-plugin-dts';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    wasm(),
    dts({
      include: [
        'src/**/*',
        'packages/core/src/**/*',
        'packages/pptx/src/**/*',
        'packages/xlsx/src/**/*',
        'packages/docx/src/**/*',
      ],
      outDir: 'dist/types',
      tsconfigPath: './tsconfig.lib.json',
      rollupTypes: true,
      skipDiagnostics: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        pptx:  resolve(__dirname, 'src/pptx.ts'),
        xlsx:  resolve(__dirname, 'src/xlsx.ts'),
        docx:  resolve(__dirname, 'src/docx.ts'),
        // Opt-in math engine (MathJax + STIX Two Math). Separate entry so the
        // ~3 MB asset stays out of the docx/pptx bundles unless imported.
        math:  resolve(__dirname, 'src/math.ts'),
      },
      // ESM-only: the published bundle inlines a large math engine; emitting a
      // duplicate CJS copy of every chunk roughly doubled the package size.
      // Every modern bundler (Vite / webpack / Rollup / esbuild / Next) and
      // Node ≥ 20 consume ESM, so we ship `.mjs` only.
      formats: ['es'],
      fileName: (_format, name) => `${name}.mjs`,
    },
    rollupOptions: {
      output: { assetFileNames: '[name][extname]' },
    },
    target: 'esnext',
  },
  worker: {
    format: 'es',
    plugins: () => [wasm()],
  },
});
