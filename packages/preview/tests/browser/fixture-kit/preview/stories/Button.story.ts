import type { Story } from '@scaffold-ui-kit/preview/types';

// Imported into the editor "as default", a Button brings this label along;
// imported empty, it renders without it.
const story: Story = {
  slots: { default: { kind: 'text', value: 'Button' } },
  generate: false,
};

export default story;
