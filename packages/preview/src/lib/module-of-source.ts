// The module a source's components are imported from for one target, shared by
// the generator (Node) and the controller's source printer (browser).

/** The token a source's `moduleBase` names its target with. */
export const TARGET_TOKEN = '{target}';

/**
 * The module a source's components are imported from for one target: the
 * source's `moduleBase` with `{target}` replaced by the target, or, when it
 * has no `{target}`, the target as a subpath of it.
 *
 * @param moduleBase - The source's `moduleBase`.
 * @param target - The target, such as `'react'`.
 * @returns The module specifier.
 * @example
 * ```ts
 * moduleOfSource('my-ui-kit', 'react'); // 'my-ui-kit/react'
 * moduleOfSource('@acme/{target}', 'react'); // '@acme/react'
 * moduleOfSource('acme-{target}', 'vue'); // 'acme-vue'
 * ```
 */
export function moduleOfSource(moduleBase: string, target: string): string {
  return moduleBase.includes(TARGET_TOKEN)
    ? moduleBase.split(TARGET_TOKEN).join(target)
    : `${moduleBase}/${target}`;
}
