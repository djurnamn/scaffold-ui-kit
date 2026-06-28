import { defineTemplate } from '@js-template-engine/types';

/**
 * A card with a titled header and a default slot for its body. The slot
 * falls back to a placeholder when nothing is projected; the BEM and
 * Tailwind override blocks take effect when the kit configures those
 * styling extensions and are ignored otherwise.
 */
export default defineTemplate({
  type: 'component',
  name: 'Card',
  props: {
    title: { type: 'string', required: true },
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
