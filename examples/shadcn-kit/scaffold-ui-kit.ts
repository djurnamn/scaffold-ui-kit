/// <reference types="@scaffold-ui-kit/preview" />
import { defineKit } from 'scaffold-ui-kit';

export default defineKit({
  name: 'shadcn-style-kit-example',
  targets: ['react', 'vue', 'svelte', 'html'],
  styling: ['tailwind'],
  add: {
    // A consumer copies a component whole: a compound's parts come with its root.
    ownership: 'full',
    shared: [
      { name: 'lib', source: 'src/lib' },
      { name: 'tokens', source: 'src/styles/tokens.css' },
    ],
    notes: [
      'Import tokens.css from your Tailwind v4 entry stylesheet, after @import "tailwindcss", and add an @source for the folder the components were copied to.',
    ],
  },
  preview: {
    shell: '@scaffold-ui-kit/preview/shells/charcell',
    sources: [
      {
        id: 'kit',
        label: 'Components',
        order: 0,
        moduleBase: 'shadcn-style-kit-example',
        templatesDirectory: 'src/components',
        storiesDirectory: 'preview/stories',
      },
    ],
    // Tailwind's build of preview/tailwind.css (`npm run preview:css`).
    themes: [
      {
        id: 'tailwind',
        label: 'Tailwind',
        css: 'preview/tailwind.generated.css',
      },
    ],
    canvas: { namePrefix: 'shadcn-style-kit-example' },
    // A `dark` class on the frame's root, which src/styles/tokens.css reads
    // for its dark values and the `dark:` variant.
    options: [
      {
        id: 'mode',
        label: 'mode',
        default: false,
        scope: 'global',
        apply: { type: 'class', on: 'root', className: 'dark' },
      },
    ],
    // Tailwind's own breakpoints, so a story can be checked at each.
    paneWidths: [
      { label: 'mobile', width: 375 },
      { label: 'sm', width: 640 },
      { label: 'md', width: 768 },
      { label: 'lg', width: 1024 },
    ],
  },
});
