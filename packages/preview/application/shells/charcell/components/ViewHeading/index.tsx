// A view's heading on the row above it: the view's name, as the top bar's
// view toggle names it - on the handle row between it and the view above, or
// on a row of its own. Styled in its index.css.
import './index.css';

export function ViewHeading({ children }: { children: string }) {
  return <h2 className="ViewHeading">{children}</h2>;
}
