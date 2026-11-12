/**
 * Options for {@link scriptFailureBootstrapScript}.
 */
export interface ScriptFailureBootstrapOptions {
  /**
   * The kit's prefix, as its components' data attributes use it: `djui`
   * stamps `data-djui-scripts`. Lowercase letters, digits and hyphens,
   * starting with a letter.
   */
  prefix: string;
}

const PREFIX_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * The attribute {@link scriptFailureBootstrapScript} stamps on `<html>` for a
 * kit, for a stylesheet or a test to read: `data-<prefix>-scripts`, which
 * holds `failed` once a script has failed to load.
 *
 * @param prefix - The kit's prefix.
 * @returns The attribute name.
 * @throws When the prefix is not lowercase letters, digits and hyphens
 *   starting with a letter.
 *
 * @example
 * ```ts
 * scriptFailureAttribute('djui'); // 'data-djui-scripts'
 * ```
 */
export function scriptFailureAttribute(prefix: string): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      `The prefix "${prefix}" cannot name an attribute: use lowercase letters, digits and hyphens, starting with a letter.`
    );
  }
  return `data-${prefix}-scripts`;
}

/**
 * An inline script that stamps `data-<prefix>-scripts="failed"` on `<html>`
 * when the page's scripts fail to load.
 *
 * A server-rendered page can hold content that only a script reveals, such as
 * the panels of a Tabs the server rendered hidden. A browser that runs no
 * scripts at all matches `@media (scripting: none)`, where the stylesheet can
 * show that content. A browser that runs scripts but never gets the page's
 * own (a failed request, a content blocker, a dropped connection) matches no
 * media query. This script covers that case. It loads nothing itself, so it
 * runs whatever happens to the page's bundles, and on the first failure it
 * stamps the attribute. While nothing fails it stamps nothing, so a page that
 * loads normally never shows the fallback, however long its components take
 * to start.
 *
 * The kit keeps the other half: each driver marks its own root once it
 * mounts, and the component's fallback CSS applies under `scripting: none`, or
 * on a failed page, to a root without that mark. A page where one unrelated
 * script failed keeps its working components working.
 *
 * What counts as a failure:
 *
 * - an `error` event from a `<script>`, or from a `<link>` preloading a
 *   script (`modulepreload`, or `preload` as `script`). An error thrown by a
 *   script that did load is not one, and neither is a failed image or
 *   stylesheet.
 * - an unhandled rejection with the `TypeError` browsers reject a failed
 *   dynamic `import()` with, whose message names the module.
 *
 * Embed it in a `<script>` in `<head>`, before the page's own scripts, so it
 * listens before any of them can fail. The string has no import, so the
 * document never waits on a module to run it. A Content Security Policy that
 * blocks inline scripts needs a nonce or a hash for it.
 *
 * @param options - The kit's prefix.
 * @returns The script's source, to place inside a `<script>` element.
 * @throws When the prefix is not lowercase letters, digits and hyphens
 *   starting with a letter.
 *
 * @example
 * ```tsx
 * <head>
 *   <script
 *     dangerouslySetInnerHTML={{
 *       __html: scriptFailureBootstrapScript({ prefix: 'djui' }),
 *     }}
 *   />
 * </head>
 * ```
 */
export function scriptFailureBootstrapScript(
  options: ScriptFailureBootstrapOptions
): string {
  const attribute = scriptFailureAttribute(options.prefix);
  return (
    '(function(){' +
    `function failed(){document.documentElement.setAttribute("${attribute}","failed")}` +
    'addEventListener("error",function(event){var target=event.target;' +
    'if(!target||typeof target.tagName!=="string")return;' +
    'if(target.tagName==="SCRIPT"||target.tagName==="LINK"&&' +
    '(target.rel==="modulepreload"||target.rel==="preload"&&target.as==="script"))failed()},true);' +
    'addEventListener("unhandledrejection",function(event){var reason=event.reason;' +
    'if(reason instanceof TypeError&&/module/i.test(reason.message))failed()})})();'
  );
}
