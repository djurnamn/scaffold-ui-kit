import { defineTemplate } from '@js-template-engine/types';

/**
 * A button with a required label and a visual variant. The variant class
 * is applied conditionally; the BEM and Tailwind override blocks take
 * effect when the kit configures those styling extensions and are
 * ignored otherwise.
 */
export default defineTemplate({
  type: 'component',
  name: 'Button',
  props: {
    label: { type: 'string', required: true },
    variant: { type: "'primary' | 'secondary'", default: 'primary' },
  },
  script: 'function handleClick(event) {\n  console.log(event);\n}',
  style:
    '.button {\n  cursor: pointer;\n  border: none;\n  border-radius: 4px;\n  padding: 0.5rem 1rem;\n}',
  children: [
    {
      type: 'element',
      tag: 'button',
      attributes: { class: ['button'], type: 'button' },
      conditionalAttributes: [
        {
          condition: "variant === 'secondary'",
          attributes: { class: ['button--secondary'] },
        },
      ],
      events: [{ name: 'click', handler: 'handleClick' }],
      extensions: {
        bem: { block: 'button' },
        tailwind: { classes: ['rounded', 'px-4', 'py-2'] },
      },
      children: [{ type: 'text', expression: 'label' }],
    },
  ],
});
