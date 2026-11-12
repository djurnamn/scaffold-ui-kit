import { defineTemplate } from '@js-template-engine/types';

// The slot falls back to a placeholder when nothing is projected. The BEM and
// Tailwind override blocks take effect when the kit configures those styling
// extensions and are ignored otherwise. The literal classes are what a kit
// without BEM renders; under BEM the block and elements write the same
// classes, and the duplicates are dropped.
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
  style:
    '.card {\n  border: 1px solid #e0e0e0;\n  border-radius: 8px;\n}\n.card__header {\n  padding: 1rem;\n  border-bottom: 1px solid #e0e0e0;\n}\n.card__title {\n  margin: 0;\n  font-size: 1.125rem;\n}\n.card__body {\n  padding: 1rem;\n}',
  children: [
    {
      type: 'element',
      tag: 'article',
      attributes: { class: ['card'] },
      extensions: {
        bem: { block: 'card' },
        tailwind: { classes: ['rounded-lg', 'border'] },
      },
      children: [
        {
          type: 'element',
          tag: 'header',
          attributes: { class: ['card__header'] },
          extensions: { bem: { element: 'header' } },
          children: [
            {
              type: 'element',
              tag: 'h2',
              attributes: { class: ['card__title'] },
              extensions: { bem: { element: 'title' } },
              children: [{ type: 'text', expression: 'title' }],
            },
          ],
        },
        {
          type: 'element',
          tag: 'div',
          attributes: { class: ['card__body'] },
          extensions: { bem: { element: 'body' } },
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
