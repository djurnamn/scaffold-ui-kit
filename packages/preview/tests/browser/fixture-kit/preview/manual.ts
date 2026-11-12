// The fixture kit's hand-written components, which have no template: each
// is written per target under src/drivers/<target>/, and gets its story here.
import type { ManualComponentSpecification } from '@scaffold-ui-kit/preview/types';

const manual = (): ManualComponentSpecification[] => [
  // For the browser tests alone, reachable at its address and left out of
  // what a reader browses: reads its label before the markup updates.
  {
    name: 'Eager',
    file: 'src/drivers/<target>/Eager',
    unlisted: true,
    props: { label: { type: 'string' } },
  },
];

export default manual;
