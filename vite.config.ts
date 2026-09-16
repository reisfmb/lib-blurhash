import { defineConfig } from 'vite-plus';

// `vp pack` (tsdown) compiles the server-side .ts under src/main/resources to per-file
// CommonJS, mirroring the tree into build/ so XP runs each file in place.
export default defineConfig({
  // Scope discovery to the sources. An IDE copies resources to bin/main, and vitest was
  // happily running those stale duplicates alongside the real ones — same count, twice.
  test: {
    include: ['src/main/resources/**/*.test.ts'],
  },
  pack: {
    entry: [
      'src/main/resources/**/*.ts',
      '!src/main/resources/**/*.d.ts',
      '!src/main/resources/**/*.test.ts', // tests run from source; they never ship
    ],
    root: 'src/main/resources',
    outDir: 'build/resources/main',
    format: 'cjs' as const,
    platform: 'node' as const,
    unbundle: true, // per-file output, not one bundle
    outExtensions: () => ({ js: '.js' }), // XP wants .js, not the cjs default .cjs
    deps: { neverBundle: [/^\/lib\//] }, // absolute XP requires stay external
    // GraalJS only — see .claude/docs/v2.md for what supporting Nashorn would take.
    target: 'es2023',
    treeshake: false, // XP calls exports at runtime — don't drop as dead
    clean: false,
    dts: false,
    sourcemap: false,
    report: false,
  },
});
