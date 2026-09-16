import { defineConfig } from 'vite-plus';

// `vp pack` (tsdown) compiles the server-side .ts under src/main/resources to per-file
// CommonJS, mirroring the tree into build/ so XP runs each file in place.
export default defineConfig({
  pack: {
    entry: ['src/main/resources/**/*.ts', '!src/main/resources/**/*.d.ts'],
    root: 'src/main/resources',
    outDir: 'build/resources/main',
    format: 'cjs' as const,
    platform: 'node' as const,
    unbundle: true, // per-file output, not one bundle
    outExtensions: () => ({ js: '.js' }), // XP wants .js, not the cjs default .cjs
    deps: { neverBundle: [/^\/lib\//] }, // absolute XP requires stay external
    target: 'es2023',
    treeshake: false, // XP calls exports at runtime — don't drop as dead
    clean: false,
    dts: false,
    sourcemap: false,
    report: false,
  },
});
