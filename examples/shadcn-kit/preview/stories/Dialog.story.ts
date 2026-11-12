import type { Story } from '@scaffold-ui-kit/preview/types';

const field = (id: string, label: string, value: string) => ({
  kind: 'html' as const,
  tag: 'div',
  props: { class: 'grid grid-cols-4 items-center gap-4' },
  children: {
    kind: 'fragment' as const,
    children: [
      {
        kind: 'html' as const,
        tag: 'label',
        props: { for: id, class: 'text-right text-sm font-medium' },
        children: { kind: 'text' as const, value: label },
      },
      {
        kind: 'element' as const,
        component: 'Input',
        props: { id, defaultValue: value, class: 'col-span-3' },
      },
    ],
  },
});

const story: Story = {
  category: 'Overlays',
  controls: { onOpenChange: false },
  slots: {
    default: {
      kind: 'fragment',
      children: [
        // `as={Button}` stands in for shadcn's `asChild`. A story's props hold data, so this fill is written per target.
        {
          kind: 'raw',
          imports: ['DialogTrigger', 'Button'],
          react:
            '<DialogTrigger as={Button} variant="outline">Edit profile</DialogTrigger>',
          vue: '<DialogTrigger :as="Button" variant="outline">Edit profile</DialogTrigger>',
          svelte:
            '<DialogTrigger as={Button} variant="outline">Edit profile</DialogTrigger>',
          html: [
            {
              type: 'element',
              tag: 'Button',
              attributes: { variant: 'outline', 'aria-haspopup': 'dialog' },
              children: [{ type: 'text', content: 'Edit profile' }],
            },
          ],
        },
        {
          kind: 'element',
          component: 'DialogContent',
          children: {
            kind: 'fragment',
            children: [
              {
                kind: 'html',
                tag: 'div',
                props: {
                  class: 'flex flex-col gap-2 text-center sm:text-left',
                },
                children: {
                  kind: 'fragment',
                  children: [
                    {
                      kind: 'element',
                      component: 'DialogTitle',
                      children: { kind: 'text', value: 'Edit profile' },
                    },
                    {
                      kind: 'html',
                      tag: 'p',
                      props: { class: 'text-muted-foreground text-sm' },
                      children: {
                        kind: 'text',
                        value:
                          "Make changes to your profile here. Click save when you're done.",
                      },
                    },
                  ],
                },
              },
              {
                kind: 'html',
                tag: 'div',
                props: { class: 'grid gap-4 py-4' },
                children: {
                  kind: 'fragment',
                  children: [
                    field('name', 'Name', 'Jane Doe'),
                    field('username', 'Username', '@janedoe'),
                  ],
                },
              },
              {
                kind: 'html',
                tag: 'div',
                props: {
                  class:
                    'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
                },
                children: {
                  kind: 'fragment',
                  children: [
                    {
                      kind: 'raw',
                      imports: ['DialogClose', 'Button'],
                      react:
                        '<DialogClose as={Button} variant="outline">Cancel</DialogClose>',
                      vue: '<DialogClose :as="Button" variant="outline">Cancel</DialogClose>',
                      svelte:
                        '<DialogClose as={Button} variant="outline">Cancel</DialogClose>',
                      html: [
                        {
                          type: 'element',
                          tag: 'Button',
                          attributes: { variant: 'outline' },
                          children: [{ type: 'text', content: 'Cancel' }],
                        },
                      ],
                    },
                    {
                      kind: 'element',
                      component: 'Button',
                      props: { type: 'submit' },
                      children: { kind: 'text', value: 'Save changes' },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  },
  scenarios: [
    {
      id: 'open',
      label: 'Open (controlled)',
      props: { open: true },
      description:
        'A given `open`: Escape, the backdrop, Cancel or the corner button closes every pane, and the address follows.',
    },
    {
      id: 'dark',
      label: 'Open on dark',
      props: { open: true },
      options: { mode: true },
    },
  ],
};
export default story;
