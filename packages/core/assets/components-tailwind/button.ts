import { defineTemplate } from '@js-template-engine/types';

// `passthrough` makes the button the component's root surface, so a consumer's
// other attributes and event listeners, such as `disabled` or a click handler,
// land on it. Its look is Tailwind utilities, the variant's applied
// conditionally, and there is no style block: Tailwind's build generates the
// CSS from the classes. The BEM block takes effect when the kit also
// configures BEM and is ignored otherwise.
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
  children: [
    {
      type: 'element',
      tag: 'button',
      passthrough: true,
      attributes: { type: 'button' },
      conditionalAttributes: [
        {
          condition: "variant === 'primary'",
          attributes: { class: ['bg-indigo-600', 'text-white'] },
        },
        {
          condition: "variant === 'secondary'",
          attributes: { class: ['bg-gray-200', 'text-gray-900'] },
        },
      ],
      extensions: {
        bem: { block: 'button' },
        tailwind: {
          classes: ['cursor-pointer', 'rounded', 'px-4', 'py-2'],
        },
      },
      children: [{ type: 'text', expression: 'label' }],
    },
  ],
});
