import { defineTemplate } from '@js-template-engine/types';

// The slot falls back to a placeholder when nothing is projected. Its look is
// Tailwind utilities and there is no style block: Tailwind's build generates
// the CSS from the classes. The BEM block and elements take effect when the
// kit also configures BEM and are ignored otherwise.
export default defineTemplate({
  type: 'component',
  name: 'Card',
  description: 'A card with a titled header; its content fills the body.',
  props: {
    title: {
      type: 'string',
      default: 'Card title',
      description: 'The heading text.',
    },
  },
  children: [
    {
      type: 'element',
      tag: 'article',
      extensions: {
        bem: { block: 'card' },
        tailwind: { classes: ['rounded-lg', 'border', 'border-gray-200'] },
      },
      children: [
        {
          type: 'element',
          tag: 'header',
          extensions: {
            bem: { element: 'header' },
            tailwind: { classes: ['border-b', 'border-gray-200', 'p-4'] },
          },
          children: [
            {
              type: 'element',
              tag: 'h2',
              extensions: {
                bem: { element: 'title' },
                tailwind: { classes: ['m-0', 'text-lg'] },
              },
              children: [{ type: 'text', expression: 'title' }],
            },
          ],
        },
        {
          type: 'element',
          tag: 'div',
          extensions: {
            bem: { element: 'body' },
            tailwind: { classes: ['p-4'] },
          },
          children: [
            {
              type: 'slot',
              fallback: [{ type: 'text', content: 'No content yet.' }],
            },
          ],
        },
      ],
    },
  ],
});
