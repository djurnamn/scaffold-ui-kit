import { defineTemplate } from '@js-template-engine/types';

// `passthrough` makes the button the component's root surface, so a consumer's
// other attributes and event listeners, such as `disabled` or a click handler,
// land on it. The variant class is applied conditionally. The BEM and Tailwind
// override blocks take effect when the kit configures those styling extensions
// and are ignored otherwise. The literal classes are what a kit without BEM
// renders; under BEM the block writes the same class, and the duplicate is
// dropped.
export default defineTemplate({
  type: 'component',
  name: 'Button',
  description: 'A button with a text label, in a primary or secondary style.',
  props: {
    label: { type: 'string', default: 'Button', description: 'The button text.' },
    variant: {
      type: "'primary' | 'secondary'",
      default: 'primary',
      description: 'The visual style.',
    },
  },
  style:
    '.button {\n  cursor: pointer;\n  border: none;\n  border-radius: 4px;\n  padding: 0.5rem 1rem;\n}',
  children: [
    {
      type: 'element',
      tag: 'button',
      passthrough: true,
      attributes: { class: ['button'], type: 'button' },
      conditionalAttributes: [
        {
          condition: "variant === 'secondary'",
          attributes: { class: ['button--secondary'] },
        },
      ],
      extensions: {
        bem: { block: 'button' },
        tailwind: { classes: ['rounded', 'px-4', 'py-2'] },
      },
      children: [{ type: 'text', expression: 'label' }],
    },
  ],
});
