import { defineTemplate } from '@js-template-engine/types';

/**
 * A shadcn-style Accordion over native `<details>`: the browser handles the
 * disclosure, keyboard and find-in-page. `type: 'single'` shares one `name`
 * across the sections, so opening one closes the others. The open sections
 * are a two-way list, so every target writes `open` from the same state.
 */
export default defineTemplate({
  type: 'component',
  name: 'Accordion',
  description:
    'A vertically stacked set of headings that each reveal a section of content.',
  props: {
    items: {
      type: 'Array<{ value: string; title: string; content: string; disabled?: boolean }>',
      required: true,
      description:
        'The sections, each with a value, the heading it shows and the content it reveals.',
    },
    type: {
      type: "'single' | 'multiple'",
      default: 'single',
      description: 'Whether opening a section closes the others.',
    },
    value: {
      type: 'string[]',
      description:
        'The values of the open sections, when controlled. Leave it out to let the accordion keep its own.',
      bindable: {
        current: 'openValues',
        setter: 'setOpenValues',
        defaultProp: 'defaultValue',
        changeProp: 'onValueChange',
      },
    },
    defaultValue: {
      type: 'string[]',
      default: [],
      description:
        'The values of the sections open at first, when uncontrolled.',
    },
    onValueChange: {
      type: '(value: string[]) => void',
      description:
        'Called with the values of the open sections whenever one opens or closes.',
    },
    name: {
      type: 'string',
      description:
        'The name the sections share in `single` mode. Each accordion gets its own when it is left out.',
    },
  },
  ids: { groupName: { prefix: 'accordion', prop: 'name' } },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      attributes: {
        'data-slot': 'accordion',
        'data-type': { $expression: 'type' },
      },
      extensions: { tailwind: { classes: ['w-full'] } },
      children: [
        {
          type: 'iteration',
          items: 'items',
          item: 'item',
          key: 'item.value',
          children: [
            {
              type: 'element',
              tag: 'details',
              attributes: {
                'data-slot': 'accordion-item',
                name: {
                  $expression: "type === 'single' ? groupName : undefined",
                },
                open: { $expression: 'openValues.includes(item.value)' },
                'data-disabled': {
                  $expression: 'item.disabled ? true : undefined',
                },
              },
              events: [
                {
                  name: 'toggle',
                  // Records what the browser shows. Opening a section in single mode closes the others, and their own
                  // toggle events remove them, so the list matches the page in every target.
                  handler:
                    "(event) => { const isNowOpen = (event.currentTarget as HTMLDetailsElement).open; setOpenValues((values) => isNowOpen ? (values.includes(item.value) ? values : type === 'single' ? [item.value] : [...values, item.value]) : values.filter((value) => value !== item.value)); }",
                },
              ],
              extensions: {
                tailwind: {
                  classes: [
                    'group',
                    'border-b',
                    'last:border-b-0',
                    'data-[disabled]:pointer-events-none',
                    'data-[disabled]:opacity-50',
                    '[&::details-content]:h-0',
                    '[&::details-content]:overflow-hidden',
                    '[&::details-content]:transition-[height,content-visibility]',
                    '[&::details-content]:duration-200',
                    '[&::details-content]:[transition-behavior:allow-discrete]',
                    'open:[&::details-content]:h-auto',
                    '[interpolate-size:allow-keywords]',
                  ],
                },
              },
              children: [
                {
                  type: 'element',
                  tag: 'summary',
                  attributes: {
                    'data-slot': 'accordion-trigger',
                    tabindex: { $expression: 'item.disabled ? -1 : undefined' },
                    'aria-disabled': {
                      $expression: 'item.disabled ? true : undefined',
                    },
                  },
                  extensions: {
                    tailwind: {
                      classes: [
                        'flex',
                        'flex-1',
                        'cursor-pointer',
                        'list-none',
                        'items-start',
                        'justify-between',
                        'gap-4',
                        'rounded-md',
                        'py-4',
                        'text-left',
                        'text-sm',
                        'font-medium',
                        'transition-all',
                        'outline-none',
                        'hover:underline',
                        'focus-visible:border-ring',
                        'focus-visible:ring-ring/50',
                        'focus-visible:ring-[3px]',
                        '[&::-webkit-details-marker]:hidden',
                      ],
                    },
                  },
                  children: [
                    { type: 'text', expression: 'item.title' },
                    {
                      type: 'element',
                      tag: 'svg',
                      attributes: {
                        'aria-hidden': 'true',
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        stroke: 'currentColor',
                        'stroke-width': '2',
                        'stroke-linecap': 'round',
                        'stroke-linejoin': 'round',
                      },
                      extensions: {
                        tailwind: {
                          classes: [
                            'text-muted-foreground',
                            'pointer-events-none',
                            'size-4',
                            'shrink-0',
                            'translate-y-0.5',
                            'transition-transform',
                            'duration-200',
                            'group-open:rotate-180',
                          ],
                        },
                      },
                      children: [
                        {
                          type: 'element',
                          tag: 'path',
                          attributes: { d: 'm6 9 6 6 6-6' },
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'element',
                  tag: 'div',
                  attributes: { 'data-slot': 'accordion-content' },
                  extensions: {
                    tailwind: { classes: ['pt-0', 'pb-4', 'text-sm'] },
                  },
                  children: [{ type: 'text', expression: 'item.content' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
