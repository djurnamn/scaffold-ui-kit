// The reset gesture on the charcell shell's grid handles
// (application/shells/charcell/split-reset): a double-click on a handle, or
// Enter while it holds the focus, runs the reset after the handle's own
// handlers, which keep running as they did.
import { describe, expect, it, vi } from 'vitest';
import { RESET_KEY, withResetGesture } from '../application/shells/charcell/split-reset';

describe('withResetGesture', () => {
  it('resets on a double-click, after the handle’s own double-click handler', () => {
    const calls: string[] = [];
    const props = withResetGesture({ id: 'a:b', onDoubleClick: () => calls.push('own') }, () => calls.push('reset'));
    props.onDoubleClick({ button: 0 });
    expect(calls).toEqual(['own', 'reset']);
    expect(props.id).toBe('a:b');
  });

  it('resets on Enter, after the handle’s own key handler, which still hears every key', () => {
    const own = vi.fn();
    const reset = vi.fn();
    const props = withResetGesture({ onKeyDown: own }, reset);
    const { onKeyDown } = props;
    onKeyDown({ key: 'ArrowLeft' });
    expect(own).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    onKeyDown({ key: RESET_KEY });
    expect(own).toHaveBeenCalledTimes(2);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('leaves Enter with a modifier, and a double-click of another button, to the browser', () => {
    const reset = vi.fn();
    const props = withResetGesture({}, reset);
    props.onKeyDown({ key: RESET_KEY, shiftKey: true });
    props.onKeyDown({ key: RESET_KEY, metaKey: true });
    props.onDoubleClick({ button: 1 });
    expect(reset).not.toHaveBeenCalled();
  });
});
