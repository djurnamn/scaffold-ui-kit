import { defineTemplate } from '@js-template-engine/types';

/** shadcn's Alert: an optional icon placed as a direct child so has-[>svg] grid utilities apply, heading and description slots. */
export default defineTemplate({
  type: 'component',
  name: 'Alert',
  description: 'Displays a callout for user attention.',
  props: {
    variant: { type: "'default' | 'destructive'", default: 'default' },
    role: {
      type: "'alert' | 'status' | 'note'",
      default: 'alert',
      description:
        "The callout's role. `alert` makes it an assertive live region, for a message that appears in response to something; give `note` or `status` for a callout that is part of the page.",
    },
  },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      attributes: { 'data-slot': 'alert', role: { $expression: 'role' } },
      extensions: {
        tailwind: {
          classes:
            'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
        },
      },
      conditionalAttributes: [
        {
          condition: "variant === 'default'",
          attributes: { class: ['bg-card', 'text-card-foreground'] },
        },
        {
          condition: "variant === 'destructive'",
          attributes: {
            class: [
              'text-destructive',
              'bg-card',
              '[&>svg]:text-current',
              '*:data-[slot=alert-description]:text-destructive/90',
            ],
          },
        },
      ],
      children: [
        { type: 'slot', name: 'icon' },
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
                  attributes: { 'data-slot': 'alert-title' },
                  extensions: {
                    tailwind: {
                      classes:
                        'col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight',
                    },
                  },
                  children: [{ type: 'slot', name: 'title' }],
                },
              ],
            },
          ],
        },
        {
          type: 'element',
          tag: 'div',
          attributes: { 'data-slot': 'alert-description' },
          extensions: {
            tailwind: {
              classes:
                'text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed',
            },
          },
          children: [{ type: 'slot' }],
        },
      ],
    },
  ],
});
