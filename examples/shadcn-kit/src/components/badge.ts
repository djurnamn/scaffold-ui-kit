import { defineTemplate } from '@js-template-engine/types';

/** A shadcn-style badge whose classes come from a cva-like `badgeVariants()` in the kit's shared lib module. */
export default defineTemplate({
  type: 'component',
  name: 'Badge',
  description: 'Displays a badge or a component that looks like a badge.',
  imports: [
    "import { cn, badgeVariants } from 'shadcn-style-kit-example/lib';",
    "import { consumerClass, withoutClass } from '@scaffold-ui-kit/helpers/runtime';",
  ],
  rest: { tag: 'span' },
  props: {
    variant: {
      type: "'default' | 'secondary' | 'destructive' | 'outline'",
      default: 'default',
    },
  },
  children: [
    {
      type: 'element',
      tag: 'span',
      attributes: {
        'data-slot': 'badge',
        $spread: { $expression: 'withoutClass(rest)' },
        class: [{ $expression: 'cn(badgeVariants({ variant }), consumerClass(rest))' }],
      },
      children: [{ type: 'slot' }],
    },
  ],
});
