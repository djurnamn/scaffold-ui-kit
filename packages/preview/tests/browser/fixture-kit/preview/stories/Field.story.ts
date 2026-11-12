import type { Story } from '@scaffold-ui-kit/preview/types';

// A story that gives `value` and leaves `marks` to the field, with a class,
// a style and a tabindex of its own on the field's root, each spelled as HTML
// does, and an aria-describedby naming the hint it renders after the field
// (`around`). Reachable at its address alone.
const story: Story = {
  unlisted: true,
  generate: false,
  defaultProps: {
    value: 'hello',
    class: 'FixtureFieldStory',
    style: 'outline-offset: 3px',
    tabindex: 0,
    'aria-describedby': 'field-hint',
  },
  around: {
    after: {
      kind: 'html',
      tag: 'p',
      props: { id: 'field-hint', class: 'FixtureFieldHint' },
      children: { kind: 'text', value: 'Type to mark the field.' },
    },
  },
};

export default story;
