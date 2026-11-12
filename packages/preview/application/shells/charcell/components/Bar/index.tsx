// The preview's bands: the prompt bar, the stage bar and the status bar. Two
// rows, each with one job, the way a terminal prints them: `header` is a
// content row over a rule row, `status` a rule row over a content row. The
// content row has two zones - the children pack from the start, `end` packs
// against the end. When they do not fit, the content wraps onto further rows, a whole row at a
// time, so a control is never cut off.
// `lead` is the bold word that opens the start zone (the prompt), the children beside it a cell apart. The rule row is a charcell
// Separator across the band's full width; `joined` runs its ends on to meet
// the lines beside the band (the frame's ring, a divider), as ├ and ┤.
// `unruled`, the rule row is left empty: a band that sits inside a place with
// edges of its own (the stage, beside the navigation's line), where a rule across
// it would cross them. `flush`, the content row takes no cells at its sides,
// the place around the band holding them.
// Styled in its index.css.
import { Separator } from 'charcell/react/unlinked';
import type { ReactNode } from 'react';
import './index.css';

export function Bar({
  variant = 'header',
  joined,
  unruled,
  flush,
  lead,
  end,
  children,
}: {
  variant?: 'header' | 'status';
  joined?: boolean;
  unruled?: boolean;
  flush?: boolean;
  lead?: ReactNode;
  end?: ReactNode;
  children?: ReactNode;
}) {
  const rule = unruled ? (
    <div className="Bar__space" />
  ) : (
    <Separator decorative join={joined ? 'both' : undefined} />
  );
  return (
    <div className={`Bar Bar--${variant}${flush ? ' Bar--flush' : ''}`}>
      {variant === 'status' && rule}
      <div className="Bar__content">
        <div className="Bar__start">
          {lead === undefined ? (
            children
          ) : (
            <div className="Bar__cluster">
              <strong className="Bar__lead">{lead}</strong>
              {children}
            </div>
          )}
        </div>
        {end !== undefined && <div className="Bar__end">{end}</div>}
      </div>
      {variant === 'header' && rule}
    </div>
  );
}
