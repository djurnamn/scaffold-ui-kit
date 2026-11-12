import { defineTemplate } from '@js-template-engine/types';

/** A shadcn-style polymorphic button: classes from `buttonVariants()` in the kit's shared lib, root renders `as` (a tag or a component). */
export default defineTemplate({
  type: 'component',
  name: 'Button',
  description: 'Displays a button or a component that looks like a button.',
  imports: [
    "import { cn, buttonVariants } from 'shadcn-style-kit-example/lib';",
    "import { consumerClass, withoutClass } from '@scaffold-ui-kit/helpers/runtime';",
  ],
  rest: { tag: 'button' },
  props: {
    variant: {
      type: "'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'",
      default: 'default',
    },
    size: { type: "'default' | 'sm' | 'lg' | 'icon'", default: 'default' },
    as: {
      type: 'any',
      description:
        "The element or component to render, such as `'a'` or a router `Link`; defaults to a button.",
    },
  },
  children: [
    {
      type: 'element',
      tag: {
        $expression: "as ?? 'button'",
        default: 'button',
        componentValued: true,
      },
      attributes: {
        'data-slot': 'button',
        $spread: { $expression: 'withoutClass(rest)' },
        class: [{ $expression: 'cn(buttonVariants({ variant, size }), consumerClass(rest))' }],
      },
      children: [{ type: 'slot' }],
    },
  ],
});
