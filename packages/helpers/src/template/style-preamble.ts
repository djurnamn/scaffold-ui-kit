/** What {@link definePreamble} takes. */
export interface PreambleDefinition<ModuleName extends string> {
  /**
   * The lines every component stylesheet opens with, in order, such as the
   * `@use` of a module that declares the kit's layer order.
   */
  always?: readonly string[];
  /**
   * The modules a component may load, each by a name of the kit's choosing,
   * mapped to the line that loads it (`'@use "styles/color" as color;'`).
   */
  modules?: Readonly<Record<ModuleName, string>>;
}

/**
 * Defines a kit's stylesheet preamble: the Sass lines a component's
 * stylesheet opens with.
 *
 * The kit names its modules once. Each component then asks for the ones its
 * styles use, by name, and gets the lines that load them after the lines
 * every stylesheet carries. Sass loads a module once per compilation, so a
 * module that emits CSS (a layer order statement, a set of registered
 * properties) comes out once in a bundle of many components and once in
 * each per-component stylesheet.
 *
 * @param definition - The lines every stylesheet opens with, and the named
 *   modules.
 * @returns The kit's `stylePreamble`: given module names, the preamble as
 *   one string, one line per `@use`. A name is loaded once however often it
 *   is given, in the order first given.
 *
 * @example
 * ```ts
 * export const stylePreamble = definePreamble({
 *   always: ['@use "styles/layer-order";'],
 *   modules: {
 *     mixins: '@use "styles/mixins" as *;',
 *     color: '@use "styles/color" as color;',
 *   },
 * });
 *
 * stylePreamble('mixins', 'color');
 * // '@use "styles/layer-order";\n@use "styles/mixins" as *;\n@use "styles/color" as color;'
 * ```
 */
export function definePreamble<ModuleName extends string = never>(
  definition: PreambleDefinition<ModuleName>
): (...modules: ModuleName[]) => string {
  const always = [...(definition.always ?? [])];
  const known = (definition.modules ?? {}) as Record<string, string>;
  return (...modules) => {
    const lines = [...always];
    for (const name of new Set(modules)) {
      const line = known[name];
      if (line === undefined) {
        const names = Object.keys(known).map((moduleName) => `"${moduleName}"`);
        throw new Error(
          `stylePreamble: no module named "${name}"; the preamble knows ${
            names.length > 0 ? names.join(', ') : 'no modules'
          }`
        );
      }
      lines.push(line);
    }
    return lines.join('\n');
  };
}
