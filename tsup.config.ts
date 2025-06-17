import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    splitting: false,
    minify: true,
    clean: true,
    outDir: 'lib',
    noExternal: ['gamma-wasm'],
    loader: {
        '.wasm': 'copy'
    }
}); 