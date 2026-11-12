import type { KitConfiguration } from 'scaffold-ui-kit';

// A type-only import, so the kit loads from a copy with no node_modules.
export default {
  name: 'acme',
  targets: ['react', 'vue', 'svelte'],
  styling: [],
  preview: {
    shell: 'preview/shell.ts',
    sources: [
      {
        id: 'kit',
        label: 'Acme',
        order: 0,
        moduleBase: 'acme',
        templatesDirectory: 'src/components',
        storiesDirectory: 'preview/stories',
      },
    ],
    omitPattern: 'Visual$',
    labels: { category: 'Parts', emptyScenario: 'Bare' },
    controlHints: { colorTokens: ['ink', undefined] },
    themes: [
      {
        id: 'light',
        label: 'Light',
        css: 'themes/light.css',
        assets: 'themes/fonts',
      },
    ],
  },
} satisfies KitConfiguration;
