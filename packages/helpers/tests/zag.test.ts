// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearingOnReset,
  closingOnPressOutside,
  labelListbox,
  mergeTriggerProps,
  resolveOverlayLabeling,
  returningFocus,
  selectLabelId,
  selectValueId,
  withoutUnrenderedDescription,
} from '../src/zag/index.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resolveOverlayLabeling', () => {
  it('drops a reference to an unrendered part', () => {
    expect(
      resolveOverlayLabeling({ id: 'panel', 'aria-labelledby': 'panel-title' })
    ).toEqual({ id: 'panel' });
  });

  it('names the record with a label given in its place', () => {
    expect(
      resolveOverlayLabeling({ 'aria-labelledby': 'panel-title' }, 'Filters')
    ).toEqual({ 'aria-label': 'Filters' });
  });

  it('returns the same record when there is nothing to change, a blank label counting as none', () => {
    const props = { id: 'panel' };
    expect(resolveOverlayLabeling(props)).toBe(props);
    expect(resolveOverlayLabeling(props, '  ')).toBe(props);
  });
});

describe('withoutUnrenderedDescription', () => {
  it('drops a reference to an unrendered description', () => {
    expect(
      withoutUnrenderedDescription({
        id: 'panel',
        'aria-describedby': 'popover:panel:desc',
      })
    ).toEqual({ id: 'panel' });
  });

  it('drops a reference the machine left undefined', () => {
    expect(
      withoutUnrenderedDescription({
        id: 'panel',
        'aria-describedby': undefined,
      })
    ).toEqual({ id: 'panel' });
  });

  it('returns the same record when there is no reference', () => {
    const props = { id: 'panel' };
    expect(withoutUnrenderedDescription(props)).toBe(props);
  });
});

describe('select ids', () => {
  it('derives the value and label ids from the trigger id', () => {
    expect(selectValueId('select:trigger')).toBe('select:trigger-value');
    expect(selectLabelId('select:trigger')).toBe('select:trigger-label');
  });
});

describe('mergeTriggerProps', () => {
  const machine = {
    id: 'trigger',
    role: 'combobox',
    'aria-labelledby': 'select:label',
  };

  it('names the trigger by the consumer, the visible label, then the value', () => {
    expect(
      mergeTriggerProps(
        machine,
        { 'aria-labelledby': 'field-label' },
        { labelId: 'trigger-label', valueId: 'trigger-value' }
      )['aria-labelledby']
    ).toBe('field-label trigger-label trigger-value');
  });

  it('names the trigger by its value alone with no label', () => {
    const merged = mergeTriggerProps(machine, undefined, {
      valueId: 'trigger-value',
    });
    expect(merged).toEqual({
      id: 'trigger',
      role: 'combobox',
      'aria-labelledby': 'trigger-value',
    });
  });

  it("leaves a consumer's aria-label to win outright", () => {
    const merged = mergeTriggerProps(
      machine,
      { 'aria-label': 'Tier' },
      { valueId: 'trigger-value' }
    );
    expect(merged['aria-label']).toBe('Tier');
    expect(merged['aria-labelledby']).toBeUndefined();
  });

  it("only drops the machine's reference and merges when given no ids", () => {
    expect(mergeTriggerProps(machine, { 'data-size': 'small' })).toEqual({
      id: 'trigger',
      role: 'combobox',
      'data-size': 'small',
    });
  });

  it("lets the consumer's props win over the machine's", () => {
    expect(mergeTriggerProps(machine, { id: 'field-control' }).id).toBe(
      'field-control'
    );
  });
});

describe('labelListbox', () => {
  const content = { role: 'listbox', 'aria-labelledby': 'select:label' };

  it('names the listbox by the visible label', () => {
    expect(labelListbox(content, { id: 'trigger' }, 'trigger-label')).toEqual({
      role: 'listbox',
      'aria-labelledby': 'trigger-label',
    });
  });

  it("names it by the trigger's aria-label without a visible label", () => {
    expect(
      labelListbox(content, { id: 'trigger', 'aria-label': 'Tier' }, undefined)
    ).toEqual({ role: 'listbox', 'aria-label': 'Tier' });
  });

  it('names it by the trigger otherwise', () => {
    expect(labelListbox(content, { id: 'trigger' }, undefined)).toEqual({
      role: 'listbox',
      'aria-labelledby': 'trigger',
    });
  });
});

describe('closingOnPressOutside', () => {
  const press = (target: Element) =>
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

  it('closes on a press outside, restoring focus unless the press lands on something focusable', () => {
    document.body.innerHTML =
      '<button id="trigger"></button><div id="content"></div><p id="text"></p><button id="other"></button>';
    const element = (id: string) => document.getElementById(id);
    const close = vi.fn();
    const detach = closingOnPressOutside(
      () => [element('trigger'), element('content')],
      close
    );

    press(element('trigger')!);
    press(element('content')!);
    expect(close).not.toHaveBeenCalled();

    press(element('text')!);
    expect(close).toHaveBeenLastCalledWith(true);
    press(element('other')!);
    expect(close).toHaveBeenLastCalledWith(false);

    detach();
    press(element('text')!);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("leaves a press inside another overlay's content to Zag", () => {
    document.body.innerHTML =
      '<div data-part="positioner"><span id="option"></span></div>';
    const close = vi.fn();
    const detach = closingOnPressOutside(() => [], close);
    press(document.getElementById('option')!);
    expect(close).not.toHaveBeenCalled();
    detach();
  });
});

describe('returningFocus', () => {
  it('leaves focus to Zag while the trigger or the opener is on the page', () => {
    document.body.innerHTML =
      '<button id="trigger"></button><a id="fallback" href="#"></a>';
    const fallback = () => document.getElementById('fallback');
    const focusReturn = returningFocus();
    focusReturn.remember();
    expect(focusReturn.finalFocusEl(() => 'trigger', fallback)()).toBeNull();
  });

  it("hands focus to the consumer's fallback when both are gone", () => {
    document.body.innerHTML =
      '<button id="opener"></button><a id="fallback" href="#"></a>';
    const opener = document.getElementById('opener')!;
    opener.focus();
    const focusReturn = returningFocus();
    focusReturn.remember();
    opener.remove();
    const fallback = document.getElementById('fallback');
    expect(
      focusReturn.finalFocusEl(
        () => 'trigger',
        () => fallback
      )()
    ).toBe(fallback);
  });

  it('gives nothing without a fallback', () => {
    expect(
      returningFocus().finalFocusEl(() => 'trigger', undefined)()
    ).toBeNull();
  });
});

describe('clearingOnReset', () => {
  it("clears on its form's reset until cleaned up", () => {
    document.body.innerHTML = '<form><input id="input" /></form>';
    const clear = vi.fn();
    const cleanup = clearingOnReset(
      () => document.getElementById('input'),
      clear
    );
    const form = document.querySelector('form')!;
    form.dispatchEvent(new Event('reset'));
    expect(clear).toHaveBeenCalledTimes(1);
    cleanup();
    form.dispatchEvent(new Event('reset'));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an input in no form', () => {
    document.body.innerHTML = '<input id="input" />';
    const clear = vi.fn();
    clearingOnReset(() => document.getElementById('input'), clear)();
    expect(clear).not.toHaveBeenCalled();
  });
});
