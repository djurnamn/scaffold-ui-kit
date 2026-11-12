// The preview's option controls, rendered from the descriptors the controller
// holds: the kit's options and the shell's own. An option says what it means,
// and this shell decides where it goes (placement.ts). The widget follows the
// option's kind: a select for a choice, an on/off toggle for a boolean.
import { Field as CharcellField, Toggle } from 'charcell/react/unlinked';
import { useId } from 'react';
import { optionKind, type OptionValue, type PreviewOptionDescriptor } from '../../../../../src/shell';
import type { CharcellRegion } from '../../configuration';
import { usePreviewController, usePreviewState, useShellConfiguration } from '../../controller-context';
import { optionPlacement } from '../../placement';
import { Select } from '../Select';
import { Hint } from '../Hint';

// One preview-option control (a Select or an on/off toggle).
function OptionControl({
  option,
  value,
  onChange,
}: {
  option: PreviewOptionDescriptor;
  value: OptionValue | undefined;
  onChange: (value: OptionValue) => void;
}) {
  const labelId = useId();
  if (optionKind(option) === 'boolean') {
    // The toggle's text is its state; the option's label names it.
    return (
      <CharcellField label={option.label} labelId={labelId}>
        <Hint text={option.title} markdown around>
          {(hint) => (
            <Toggle
              variant="dense"
              {...hint}
              aria-labelledby={labelId}
              label={value ? 'on' : 'off'}
              pressed={Boolean(value)}
              onPressedChange={() => onChange(!value)}
            />
          )}
        </Hint>
      </CharcellField>
    );
  }
  return (
    <Select
      label={option.label}
      value={String(value ?? '')}
      onChange={(value) => onChange(value)}
      options={option.values ?? []}
    />
  );
}

// The controls of the kit's options placed in one region, in registry order.
// The options the current story marks unavailable are hidden.
export function OptionControls({ placement }: { placement: CharcellRegion }) {
  const controller = usePreviewController();
  const { groups } = useShellConfiguration();
  const values = usePreviewState((state) => state.options);
  const unavailable = usePreviewState((state) => state.unavailableOptions);
  const options = kitOptions(controller.options).filter(
    (option) => optionPlacement(option, groups) === placement && !unavailable.includes(option.id),
  );
  return (
    <>
      {options.map((option) => (
        <OptionControl
          key={option.id}
          option={option}
          value={values[option.id]}
          onChange={(value) => controller.actions.setOption(option.id, value)}
        />
      ))}
    </>
  );
}

/** Whether any option the current story offers is placed in a region - so a
 *  bar can leave out an empty zone. */
export function useHasOptionControls(placement: CharcellRegion): boolean {
  const controller = usePreviewController();
  const { groups } = useShellConfiguration();
  const unavailable = usePreviewState((state) => state.unavailableOptions);
  return kitOptions(controller.options).some(
    (option) => optionPlacement(option, groups) === placement && !unavailable.includes(option.id),
  );
}

/** The kit's options: the shell's own (the navigation, the views, the code
 *  panes' wrapping) have controls of their own. */
function kitOptions(options: PreviewOptionDescriptor[]): PreviewOptionDescriptor[] {
  return options.filter((option) => option.origin === 'kit');
}
