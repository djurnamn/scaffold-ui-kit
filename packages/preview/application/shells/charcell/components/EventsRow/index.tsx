// The events row, the stage's last row while the events view shows: the log
// of the events the story's panes recorded (`state.events`), each as it
// fires, newest last - when, in which pane, which event, and a summary of
// what it was called with - in a quiet charcell Frame, scrolling in a
// charcell ScrollArea, a whole row at a time, and following the newest, as a
// terminal does. A story that declares no events
// says so, and one that has fired none yet says how one shows. Its heading,
// with `clear` (EventsClear), sits on the row above. Styled in its index.css.
import { Button, Frame, ScrollArea } from 'charcell/react/unlinked';
import { useLayoutEffect, useRef } from 'react';
import { usePreviewController, usePreviewState } from '../../controller-context';
import './index.css';

/** A time of day as the log shows it, `hh:mm:ss`. */
function clock(time: number): string {
  const date = new Date(time);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export function EventsRow() {
  const controller = usePreviewController();
  const events = usePreviewState((state) => state.events);
  const selection = usePreviewState((state) => state.selection);
  const declared =
    controller.catalog.components.find((component) => component.id === selection.id)?.events ?? [];
  // Each new event scrolls the log to its end: the scrolling region (the
  // ScrollArea's, by its role) as far down as it goes.
  const log = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const region = log.current?.closest('[role="region"]');
    if (region instanceof HTMLElement) region.scrollTop = region.scrollHeight;
  }, [events]);
  return (
    <div className="EventsRow" data-preview-events>
      <Frame quiet flush fill>
        {events.length > 0 ? (
          <ScrollArea label="events" overscroll="none" fill>
            <ol ref={log} className="EventsRow__log">
              {events.map((event) => (
                <li key={event.id} className="EventsRow__event">
                  <span className="EventsRow__time">{clock(event.time)}</span>
                  <span className="EventsRow__target">{event.target}</span>
                  <span className="EventsRow__name">{event.name}</span>
                  <span className="EventsRow__payload">{event.payload}</span>
                </li>
              ))}
            </ol>
          </ScrollArea>
        ) : (
          <p className="EventsRow__note">
            {declared.length === 0
              ? 'This story declares no events.'
              : `No events yet: ${declared.join(', ')} show here as the story fires them.`}
          </p>
        )}
      </Frame>
    </div>
  );
}

/** The events row's `clear`, at the end of its heading row. */
export function EventsClear() {
  const controller = usePreviewController();
  const empty = usePreviewState((state) => state.events.length === 0);
  return <Button variant="dense" label="clear" disabled={empty} onClick={() => controller.actions.clearEvents()} />;
}
