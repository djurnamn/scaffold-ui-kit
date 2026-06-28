import { bem } from '@js-template-engine/extension-bem';
import { react } from '@js-template-engine/extension-react';
import { svelte } from '@js-template-engine/extension-svelte';
import { tailwind } from '@js-template-engine/extension-tailwind';
import { vue } from '@js-template-engine/extension-vue';
import type { Extension } from '@js-template-engine/types';

import type { KitConfiguration, TargetName } from './configuration';

const frameworkFactories: Record<
  Exclude<TargetName, 'html'>,
  () => Extension
> = {
  react,
  vue,
  svelte,
};

/**
 * Builds the extension list for one target's `process()` call.
 *
 * Styling extensions come first, in configuration order - the order their
 * classes are contributed in - followed by the target's framework
 * extension; the `html` target renders with styling extensions alone.
 *
 * @param target - The render target.
 * @param configuration - The kit configuration.
 * @returns Extension instances ready for `process()`.
 */
export function buildExtensions(
  target: TargetName,
  configuration: KitConfiguration
): Extension[] {
  const extensions: Extension[] = configuration.styling.map((name) =>
    name === 'bem'
      ? bem({
          elementSeparator: configuration.bemElementSeparator,
          modifierSeparator: configuration.bemModifierSeparator,
          mode: configuration.bemMode,
          importSource: configuration.bemImportSource,
        })
      : tailwind({
          output: configuration.tailwindOutput,
          convertStyles: configuration.tailwindConvertStyles,
        })
  );
  if (target !== 'html') {
    extensions.push(frameworkFactories[target]());
  }
  return extensions;
}
