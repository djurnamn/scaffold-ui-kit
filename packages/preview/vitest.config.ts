import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The host app's .tsx compiles with React's automatic runtime, as the
  // preview's Vite build does through @vitejs/plugin-react.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      // The preview app imports the kit's config module through this alias;
      // tests swap in their own with `vi.doMock`.
      '@preview-configuration': fileURLToPath(
        new URL('./tests/fixtures/preview-configuration.ts', import.meta.url)
      ),
      // The host app's other build-time aliases, mapped to the fixtures its
      // characterization tests run against (tests/host.test.ts).
      '@preview-generated/manifest.json': fileURLToPath(
        new URL('./tests/fixtures/host/manifest.json', import.meta.url)
      ),
      // The Vue iframe's registries (tests/vue-frame.test.ts).
      '@preview-generated/vue/registry': fileURLToPath(
        new URL('./tests/fixtures/vue/registry.ts', import.meta.url)
      ),
      '@preview-generated/scratch/vue': fileURLToPath(
        new URL('./tests/fixtures/vue/scratch.ts', import.meta.url)
      ),
      '@preview-views': fileURLToPath(
        new URL('./tests/fixtures/host/views.ts', import.meta.url)
      ),
      // The shell the bootstrap loads: the charcell shell as shipped. A test
      // that mounts another configuration of it swaps it in with `vi.doMock`.
      '@preview-shell': fileURLToPath(
        new URL('./application/shells/charcell/index.tsx', import.meta.url)
      ),
      // The kit's per-framework setup modules, one file each so a test can
      // tell which the view iframe loads (tests/view-frame.test.ts).
      '@preview-setup/react': fileURLToPath(
        new URL('./tests/fixtures/setup/react.ts', import.meta.url)
      ),
      '@preview-setup/vue': fileURLToPath(
        new URL('./tests/fixtures/setup/vue.ts', import.meta.url)
      ),
      '@preview-setup/svelte': fileURLToPath(
        new URL('./tests/fixtures/setup/svelte.ts', import.meta.url)
      ),
      // No kit code block, as for a kit that names none; a test that mounts
      // one swaps it in with `vi.doMock`.
      '@preview-code-block': fileURLToPath(
        new URL('./application/lib/no-code-block.ts', import.meta.url)
      ),
      '@preview-html-stylesheets': fileURLToPath(
        new URL('./application/lib/no-setup.ts', import.meta.url)
      ),
    },
    // One React across the host and charcell (which may resolve its own copy,
    // as a linked checkout does), the way the preview's Vite server dedupes it.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    // charcell and its runtime dependencies go through Vite's resolver, so the
    // dedupe above reaches their React imports too.
    server: {
      deps: { inline: [/charcell/, /use-bem/, /@zag-js/, /@dnd-kit/] },
    },
    environment: 'node',
    // DOM tests link theme stylesheets that no server answers.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableCSSFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
          // The host's panes are iframes whose pages no server answers; the
          // host tests stand in for their windows.
          disableIframePageLoading: true,
        },
      },
    },
    include: ['tests/**/*.test.ts'],
    // The host tests mount the whole shell before each test, which takes a
    // fraction of a second alone and can pass Vitest's ten under a full
    // workspace run's load.
    hookTimeout: 30_000,
  },
});
