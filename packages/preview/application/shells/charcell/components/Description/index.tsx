// The info button beside a picker in the stage bar: an italic `i`, which opens a
// charcell Popover holding a description, its markdown rendered (Markdown).
// Nothing renders without a description. Styled in its index.css.
import { Button, Popover } from 'charcell/react/unlinked';
import { Hint } from '../Hint';
import { Markdown } from '../Markdown';
import './index.css';

export function Description({ text, label }: { text?: string; label: string }) {
  if (!text?.trim()) return null;
  return (
    <Popover
      label={label}
      width={48}
      trigger={({ triggerProps }) => (
        <Hint text={label} triggerProps={triggerProps}>
          {(props) => <Button variant="dense" className="Description__button" label="i" aria-label={label} {...props} />}
        </Hint>
      )}
    >
      <Markdown text={text} />
    </Popover>
  );
}
