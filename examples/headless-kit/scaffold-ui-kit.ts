/// <reference types="@scaffold-ui-kit/preview" />
import { defineKit } from 'scaffold-ui-kit';

export default defineKit({
  name: 'headless-kit',
  targets: ['react', 'vue', 'svelte'],
  styling: [],
  svelte: { mode: 'runes' },
  preview: {
    shell: '@scaffold-ui-kit/preview/shells/charcell',
    omitPattern: 'Visual$',
    sources: [
      {
        id: 'kit',
        label: 'Components',
        order: 0,
        moduleBase: 'headless-kit-example',
        templatesDirectory: 'src/components',
        storiesDirectory: 'preview/stories',
        manualModule: 'preview/manual-components.ts',
      },
    ],
    // The kit ships no styles. `consumer-example.css` stands in for the
    // stylesheet a consuming app writes; `unstyled.css` shows the components
    // as shipped.
    themes: [
      {
        id: 'consumer',
        label: 'Consumer stylesheet',
        css: 'preview/themes/consumer-example.css',
      },
      {
        id: 'unstyled',
        label: 'Unstyled',
        css: 'preview/themes/unstyled.css',
      },
    ],
    // The prefix for the attributes and classes the preview sets in each frame.
    canvas: { namePrefix: 'headless-kit' },
    // Switches between the consumer's example stylesheet and none at all.
    options: [
      {
        id: 'theme',
        label: 'theme',
        title:
          'The kit ships no styles. `Consumer stylesheet` is an example of what an app writes, keyed only on ARIA roles and the `data-state`, `data-disabled` and `data-orientation` attributes.',
        values: [
          { value: 'consumer', label: 'Consumer stylesheet' },
          { value: 'unstyled', label: 'Unstyled' },
        ],
        default: 'consumer',
        group: 'kit',
        scope: 'global',
        apply: { type: 'stylesheet' },
      },
    ],
  },
});
