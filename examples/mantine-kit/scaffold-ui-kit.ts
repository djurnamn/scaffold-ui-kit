/// <reference types="@scaffold-ui-kit/preview" />
import { defineKit } from 'scaffold-ui-kit';

export default defineKit({
  name: 'mantine-style-kit-example',
  targets: ['react', 'vue', 'svelte', 'html'],
  styling: ['bem'],
  stylesheetPlacement: 'separate-file',
  stylesheetLink: 'both',
  stylingLayer: {
    name: 'mk.components',
    order: ['mk.theme', 'mk.components', 'mk.owned'],
    owned: 'mk.owned',
  },
  add: {
    shared: [{ name: 'themes', source: 'themes' }],
    notes: [
      'Import themes/default.css once at your app root: every component reads its --mk-* variables.',
    ],
  },
  svelte: { mode: 'runes' },
  preview: {
    shell: '@scaffold-ui-kit/preview/shells/charcell',
    sources: [
      {
        id: 'kit',
        label: 'Components',
        order: 0,
        moduleBase: 'mantine-style-kit-example',
        templatesDirectory: 'src/components',
        storiesDirectory: 'preview/stories',
      },
    ],
    viewsModule: 'preview/views.tsx',
    themes: [{ id: 'default', label: 'Default', css: 'themes/default.css' }],
    canvas: {
      namePrefix: 'mantine-style-kit-example',
      extraCss: '.mk-story-gutter { padding: 1rem; }',
    },
    // A gutter around every story, so focus rings and shadows are not
    // clipped at the pane's edge.
    mount: { classes: ['mk-story-gutter'], mount: true },
    options: [
      {
        id: 'colorScheme',
        label: 'color scheme',
        values: [
          { value: 'light', label: 'light' },
          { value: 'dark', label: 'dark' },
        ],
        default: 'light',
        scope: 'global',
        apply: { type: 'root-attribute', attribute: 'data-mk-color-scheme' },
      },
      {
        id: 'fontFamily',
        label: 'font',
        values: [
          { value: 'system-ui, sans-serif', label: 'system' },
          { value: 'Georgia, serif', label: 'serif' },
        ],
        default: 'system-ui, sans-serif',
        group: 'kit',
        scope: 'global',
        apply: { type: 'css-var', var: '--mk-font-family' },
      },
    ],
  },
});
