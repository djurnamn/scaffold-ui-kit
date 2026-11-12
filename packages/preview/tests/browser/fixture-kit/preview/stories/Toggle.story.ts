import type { Story } from '@scaffold-ui-kit/preview/types';

// A controlled story: it gives `pressed`, so the preview takes each value the
// toggle reports as the story's own. Reachable at its address alone.
const story: Story = {
  unlisted: true,
  generate: false,
  defaultProps: { pressed: false },
};

export default story;
