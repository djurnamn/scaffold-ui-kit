import type { StylingExtension } from '@js-template-engine/core';
import { bem } from '@js-template-engine/extension-bem';
import { react } from '@js-template-engine/extension-react';
import { svelte } from '@js-template-engine/extension-svelte';
import { tailwind } from '@js-template-engine/extension-tailwind';
import { vue } from '@js-template-engine/extension-vue';
import type { Extension } from '@js-template-engine/types';

import type { KitConfiguration, TargetName } from './configuration';

const targetFactories: Record<
  Exclude<TargetName, 'html' | 'svelte'>,
  () => Extension
> = {
  react,
  vue,
};

/**
 * Every scripted target's extension. A kit is built for every target, so
 * its templates are validated against all of them: a name any target's
 * output declares is reserved in every kit component, and each target's own
 * override checks run. Each target's `process()` call reserves their names
 * too (`reserveNamesOf`), so a prop's alias is the same in every target.
 *
 * @returns The React, Vue and Svelte extensions.
 */
export function everyTargetExtension(): Extension[] {
  return [react(), vue(), svelte()];
}

/**
 * The styling extensions a kit applies, in configuration order - the order
 * their classes are contributed in - each built with its block of the
 * configuration (`bem`, `tailwind`).
 *
 * @param configuration - The kit configuration.
 * @returns The styling extension instances.
 */
export function stylingExtensionsOf(
  configuration: KitConfiguration
): StylingExtension[] {
  return configuration.styling.map((name) =>
    name === 'bem'
      ? bem(configuration.bem ?? {})
      : tailwind(configuration.tailwind ?? {})
  );
}

/**
 * Builds the extension list for one target's `process()` call.
 *
 * Styling extensions come first, in configuration order, followed by the
 * target's extension, the Svelte one built with the configuration's
 * `svelte` block; the `html` target renders with styling extensions alone.
 *
 * @param target - The render target.
 * @param configuration - The kit configuration.
 * @returns Extension instances ready for `process()`.
 */
export function buildExtensions(
  target: TargetName,
  configuration: KitConfiguration
): Extension[] {
  const extensions: Extension[] = stylingExtensionsOf(configuration);
  if (target === 'svelte') {
    extensions.push(svelte(configuration.svelte ?? {}));
  } else if (target !== 'html') {
    extensions.push(targetFactories[target]());
  }
  return extensions;
}

/**
 * The peer dependencies one target's output needs, as the extensions it is
 * built with declare them.
 *
 * @param target - The render target.
 * @param configuration - The kit configuration.
 * @returns Each package with its version range; empty for the `html` target.
 */
export function peerDependenciesOf(
  target: TargetName,
  configuration: KitConfiguration
): Record<string, string> {
  return Object.assign(
    {},
    ...buildExtensions(target, configuration).map(
      (extension) => extension.peerDependencies ?? {}
    )
  ) as Record<string, string>;
}
