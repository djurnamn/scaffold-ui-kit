// A hint beside a control, in place of a `title`: charcell's Tooltip, which
// opens as the reader hovers or focuses the control and closes on Escape. The
// control renders through `children`, handed the trigger's props to spread
// on the element the hint is for; with no text it renders bare. A control
// that is already another part's trigger (a popover's, a sortable grip) passes
// those `triggerProps`: the hint takes their id as its trigger's, so both
// find the one element, and the two descriptions stay. A hint the kit wrote
// (`markdown`) renders its markdown, as a description does.
//
// A control that takes its handlers on an element other than the one the
// reader sees passes `around`: the trigger is then a span around the control,
// which hears the pointer over any of it and the focus of anything inside,
// and the control is handed the description alone. charcell's Toggle is one:
// its handlers reach the checkbox it hides, which no pointer reaches. A
// disabled control takes no focus, so with `focusable` the span takes it in
// the control's place, and the hint opens from the keyboard too: a group
// named by the control's `label` (the hint's text without one) and described
// by the hint, so the stop says which control it stands for. Styled in its
// index.css.
import { Tooltip } from 'charcell/react/unlinked';
import { mergeProps } from '@zag-js/react';
import type { ReactNode } from 'react';
import { Markdown } from '../Markdown';
import './index.css';

export function Hint({
  text,
  markdown = false,
  triggerProps,
  around = false,
  focusable = false,
  label,
  children,
}: {
  text?: string;
  markdown?: boolean;
  triggerProps?: Record<string, unknown>;
  around?: boolean;
  focusable?: boolean;
  label?: string;
  children: (triggerProps: Record<string, unknown>) => ReactNode;
}) {
  if (!text?.trim()) {
    const bare = children(triggerProps ?? {});
    return around ? <span className="Hint">{bare}</span> : <>{bare}</>;
  }
  const triggerId = typeof triggerProps?.id === 'string' ? triggerProps.id : undefined;
  return (
    <Tooltip
      triggerId={around ? undefined : triggerId}
      trigger={(tooltip) => {
        if (!around)
          return children(triggerProps ? merged(triggerProps, tooltip.triggerProps) : tooltip.triggerProps);
        const { 'aria-describedby': described, ...wrapper } = tooltip.triggerProps;
        const describedBy = typeof described === 'string' ? described : undefined;
        return (
          <span
            {...wrapper}
            className={`Hint${focusable ? ' Hint--focusable' : ''}`}
            {...(focusable
              ? { tabIndex: 0, role: 'group', 'aria-label': label ?? text, 'aria-describedby': describedBy }
              : {})}
          >
            {children(merged(triggerProps ?? {}, { 'aria-describedby': describedBy }))}
          </span>
        );
      }}
    >
      {markdown ? <Markdown text={text} /> : text}
    </Tooltip>
  );
}

/** A part's trigger props with the hint's over them, keeping both descriptions. */
function merged(own: Record<string, unknown>, hint: Record<string, unknown>): Record<string, unknown> {
  const describedBy = [own['aria-describedby'], hint['aria-describedby']].filter((id) => typeof id === 'string' && id);
  return {
    ...mergeProps(own, hint),
    ...(describedBy.length ? { 'aria-describedby': describedBy.join(' ') } : { 'aria-describedby': undefined }),
  };
}
