import { defineTemplate } from '@js-template-engine/types';

const tw = (classes: string) => ({ tailwind: { classes } });

/** A shadcn-style card: header (title, description, action), content and footer as named slots. */
export default defineTemplate({
  type: 'component',
  name: 'Card',
  description: 'Displays a card with header, content, and footer.',
  props: {
    title: { type: 'string' },
    description: { type: 'string' },
  },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      attributes: { 'data-slot': 'card' },
      extensions: tw(
        'bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm'
      ),
      children: [
        {
          type: 'element',
          tag: 'div',
          attributes: { 'data-slot': 'card-header' },
          extensions: tw(
            '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6'
          ),
          children: [
            {
              type: 'conditional',
              conditions: [
                {
                  statement: 'if',
                  condition: 'title',
                  children: [
                    {
                      type: 'element',
                      tag: 'div',
                      attributes: { 'data-slot': 'card-title' },
                      extensions: tw('leading-none font-semibold'),
                      children: [{ type: 'text', expression: 'title' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'conditional',
              conditions: [
                {
                  statement: 'if',
                  condition: 'description',
                  children: [
                    {
                      type: 'element',
                      tag: 'div',
                      attributes: { 'data-slot': 'card-description' },
                      extensions: tw('text-muted-foreground text-sm'),
                      children: [{ type: 'text', expression: 'description' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'conditional',
              conditions: [
                {
                  statement: 'if',
                  condition: 'action',
                  children: [
                    {
                      type: 'element',
                      tag: 'div',
                      attributes: { 'data-slot': 'card-action' },
                      extensions: tw(
                        'col-start-2 row-span-2 row-start-1 self-start justify-self-end'
                      ),
                      children: [{ type: 'slot', name: 'action' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'element',
          tag: 'div',
          attributes: { 'data-slot': 'card-content' },
          extensions: tw('px-6'),
          children: [{ type: 'slot' }],
        },
        {
          type: 'conditional',
          conditions: [
            {
              statement: 'if',
              condition: 'footer',
              children: [
                {
                  type: 'element',
                  tag: 'div',
                  attributes: { 'data-slot': 'card-footer' },
                  extensions: tw('flex items-center px-6 [.border-t]:pt-6'),
                  children: [{ type: 'slot', name: 'footer' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
