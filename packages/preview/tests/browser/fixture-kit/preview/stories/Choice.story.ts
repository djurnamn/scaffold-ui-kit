import type { Story } from '@scaffold-ui-kit/preview/types';

// A story that starts the select at its second option, and a scenario that
// unsets that start with `null`. Reachable at its address alone.
const story: Story = {
  unlisted: true,
  generate: false,
  defaultProps: { defaultValue: 'second' },
  scenarios: [{ id: 'no-default', props: { defaultValue: null } }],
};

export default story;
