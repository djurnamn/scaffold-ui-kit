import type { Story } from '@scaffold-ui-kit/preview/types';

const trigger = (
  value: string,
  label: string,
  props: Record<string, unknown> = {}
) => ({
  kind: 'element' as const,
  component: 'TabsTrigger',
  props: { value, ...props },
  children: { kind: 'text' as const, value: label },
});
const panel = (value: string, text: string) => ({
  kind: 'element' as const,
  component: 'TabsContent',
  props: {
    value,
    class: 'rounded-xl border p-4 text-sm text-muted-foreground',
  },
  children: { kind: 'text' as const, value: text },
});

const story: Story = {
  category: 'Navigation',
  defaultProps: { defaultValue: 'account', class: 'w-96' },
  controls: { onValueChange: false },
  slots: {
    default: {
      kind: 'fragment',
      children: [
        {
          kind: 'element',
          component: 'TabsList',
          children: {
            kind: 'fragment',
            children: [
              trigger('account', 'Account'),
              trigger('password', 'Password'),
              trigger('billing', 'Billing', { disabled: true }),
            ],
          },
        },
        panel(
          'account',
          'Make changes to your account here. Click save when you are done.'
        ),
        panel(
          'password',
          'Change your password here. After saving, you will be logged out.'
        ),
        panel('billing', 'Billing is disabled for this workspace.'),
      ],
    },
  },
  scenarios: [
    {
      id: 'password',
      label: 'Second tab selected',
      props: { defaultValue: 'password' },
      description:
        'Starts on **Password**: `data-[state=active]:bg-background` moves with it.',
    },
    {
      id: 'controlled',
      label: 'Controlled',
      props: { value: 'password' },
      description:
        'A given `value`: a click in any pane moves every pane, the controls and the address.',
    },
    { id: 'dark', label: 'On dark', props: {}, options: { mode: true } },
  ],
};
export default story;
