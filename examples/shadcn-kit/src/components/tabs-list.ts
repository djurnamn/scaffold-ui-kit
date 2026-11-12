import { defineTemplate } from '@js-template-engine/types';

/** The row of triggers inside Tabs, which moves focus and selection between them with the arrow keys, Home and End. */
export default defineTemplate({
  type: 'component',
  name: 'TabsList',
  description:
    'Holds the `TabsTrigger`s of a `Tabs`. ArrowLeft and ArrowRight move between them, Home and End to the first and last.',
  imports: ["import { moveTabsFocus } from 'shadcn-style-kit-example/lib';"],
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      attributes: { role: 'tablist', 'data-slot': 'tabs-list' },
      events: [{ name: 'keydown', handler: 'moveTabsFocus' }],
      extensions: {
        tailwind: {
          classes: [
            'bg-muted',
            'text-muted-foreground',
            'inline-flex',
            'h-9',
            'w-fit',
            'items-center',
            'justify-center',
            'rounded-lg',
            'p-[3px]',
          ],
        },
      },
      children: [{ type: 'slot' }],
    },
  ],
});
