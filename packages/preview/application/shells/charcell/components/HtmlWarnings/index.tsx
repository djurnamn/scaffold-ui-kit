// How many warnings a story's html has, as a dense charcell Button that opens
// them in a charcell Popover on a click, Enter or Space, where they stay open
// to be read and copied until a click outside or Escape closes them. Hovering
// or focusing it shows a short hint saying what it opens (Hint), as the
// description button's does. The pane that holds it gives its color through
// `className`.
import { Button, Popover } from 'charcell/react/unlinked';
import { Hint } from '../Hint';
import { Markdown } from '../Markdown';
import { htmlWarningsHint, htmlWarningsLabel } from '../../html-warnings';

export function HtmlWarnings({
  warnings,
  className,
  attributes,
}: {
  warnings: readonly string[];
  className?: string;
  attributes?: Record<string, string>;
}) {
  return (
    <Popover
      label="html warnings"
      width={64}
      trigger={({ triggerProps }) => (
        <Hint
          text="what the html leaves out at rest"
          triggerProps={triggerProps}
        >
          {(props) => (
            <Button
              variant="dense"
              label={htmlWarningsLabel(warnings)}
              className={className}
              {...props}
              {...attributes}
            />
          )}
        </Hint>
      )}
    >
      <Markdown text={htmlWarningsHint(warnings)} />
    </Popover>
  );
}
