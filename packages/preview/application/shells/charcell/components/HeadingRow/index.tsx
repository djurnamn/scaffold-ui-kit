// A view's heading on a row of its own, where no split's handle row carries
// it: the heading a cell in from the start and the view's controls at the
// end, as a handle row lays them (the scenario row's, a custom view's).
// Styled in its index.css.
import type { ReactNode } from 'react';
import { ViewHeading } from '../ViewHeading';
import './index.css';

export function HeadingRow({ heading, end }: { heading: string; end?: ReactNode }) {
  return (
    <div className="HeadingRow">
      <ViewHeading>{heading}</ViewHeading>
      {end}
    </div>
  );
}
