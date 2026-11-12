// The charcell shell's page: what the host page shows before the shell's
// script has loaded. charcell's dark ground paints from the first frame, the
// upright face is declared and its font preloaded, and the root holds the
// loading note the shell mounts over.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineShellPage } from '../../shell.js';

const here = dirname(fileURLToPath(import.meta.url));

/** The loading note and its styles, kept beside the shell. */
const loadingNote = resolve(
  here,
  '../../../application/shells/charcell/page-loading.html'
);

/**
 * charcell's upright face, as its base stylesheet declares it.
 *
 * @returns The `@font-face` rule, the address it gives the font file, and
 *   the file's absolute path; or nothing when charcell or the rule cannot be
 *   found.
 */
function uprightFace():
  | { rule: string; address: string; file: string }
  | undefined {
  let stylesheet: string;
  let source: string;
  try {
    stylesheet = createRequire(import.meta.url).resolve('charcell/css/base');
    source = readFileSync(stylesheet, 'utf8');
  } catch {
    return undefined;
  }
  const rule = (source.match(/@font-face\s*\{[^}]*\}/g) ?? []).find((face) =>
    /font-style:\s*normal/.test(face)
  );
  const address = rule?.match(/url\((["']?)([^"')]+)\1\)/)?.[2];
  // Only a font file beside the stylesheet: an address of another kind, a
  // data address or one with a query, names no file to preload.
  if (
    rule === undefined ||
    address === undefined ||
    !/^\.{0,2}\/?[\w./-]+\.woff2$/.test(address)
  ) {
    return undefined;
  }
  return { rule, address, file: resolve(dirname(stylesheet), address) };
}

/**
 * The charcell shell's page: charcell's dark ground and its face in the
 * head, the font preloaded, and the loading note in the root. A kit that
 * names the charcell shell as it is gets it without naming it; a module of
 * the kit's that configures the shell names it as `preview.shell.page`.
 */
export default defineShellPage({
  head({ asset }) {
    // The ground sits in the first, lowest cascade layer, so charcell's own
    // page rule and a kit's overrides win once they load.
    const ground =
      '<style>@layer { html { color-scheme: dark; background: #000000; } }</style>';
    const face = uprightFace();
    if (face === undefined) return ground;
    const font = asset(face.file);
    // The face as charcell declares it, except that text waits for the font
    // rather than showing in another face first: the loading note appears in
    // the face the shell's text has, on the same cells.
    const rule = face.rule
      .replace(face.address, () => font)
      .replace(/font-display:\s*[a-z]+/, 'font-display:block');
    return [
      ground,
      `<link rel="preload" as="font" type="font/woff2" crossorigin href="${font}" />`,
      `<style>${rule}</style>`,
    ].join('\n');
  },
  root: () => readFileSync(loadingNote, 'utf8'),
});
