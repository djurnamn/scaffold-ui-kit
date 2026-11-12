import { defineTemplate } from '@js-template-engine/types';

// The markup of a Zag dialog. The drivers own the machine and hand each part
// its prop record; the template just lays the parts out and renders nothing
// until the dialog opens.
export default defineTemplate({
  type: 'component',
  name: 'ModalVisual',
  description:
    'Markup for `Modal`: the backdrop, the positioner, the dialog and its title, description and close button, each spread with a prop record its driver supplies.',
  props: {
    open: {
      type: 'boolean',
      default: false,
      description: 'Whether the dialog is rendered.',
    },
    backdropProps: {
      type: 'Record<string, any>',
      description: 'Props for the backdrop.',
    },
    positionerProps: {
      type: 'Record<string, any>',
      description: 'Props for the positioner.',
    },
    contentProps: {
      type: 'Record<string, any>',
      description: 'Props for the dialog element.',
    },
    titleProps: {
      type: 'Record<string, any>',
      description: 'Props for the title.',
    },
    descriptionProps: {
      type: 'Record<string, any>',
      description: 'Props for the description.',
    },
    closeProps: {
      type: 'Record<string, any>',
      description: 'Props for the close button.',
    },
    title: {
      type: 'string | null',
      description:
        'The visible title. Leave it out and pass an accessible name to the driver.',
    },
    description: {
      type: 'string | null',
      description: 'The visible description.',
    },
    closeLabel: {
      type: 'string',
      default: 'Close',
      description: "The close button's accessible name.",
    },
  },
  children: [
    {
      type: 'conditional',
      conditions: [
        {
          statement: 'if',
          condition: 'open',
          children: [
            {
              type: 'element',
              tag: 'div',
              attributes: { $spread: { $expression: 'backdropProps' } },
            },
            {
              type: 'element',
              tag: 'div',
              attributes: { $spread: { $expression: 'positionerProps' } },
              children: [
                {
                  type: 'element',
                  tag: 'div',
                  attributes: { $spread: { $expression: 'contentProps' } },
                  children: [
                    {
                      type: 'conditional',
                      conditions: [
                        {
                          statement: 'if',
                          condition: 'title != null',
                          children: [
                            {
                              type: 'element',
                              tag: 'h2',
                              attributes: {
                                $spread: { $expression: 'titleProps' },
                              },
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
                          condition: 'description != null',
                          children: [
                            {
                              type: 'element',
                              tag: 'p',
                              attributes: {
                                $spread: { $expression: 'descriptionProps' },
                              },
                              children: [
                                { type: 'text', expression: 'description' },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    { type: 'slot' },
                    {
                      type: 'element',
                      tag: 'button',
                      attributes: {
                        $spread: { $expression: 'closeProps' },
                        'aria-label': { $expression: 'closeLabel' },
                      },
                      children: [
                        {
                          type: 'slot',
                          name: 'close',
                          fallback: [{ type: 'text', content: '×' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
