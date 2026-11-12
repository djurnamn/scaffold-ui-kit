// The static build's stylesheet links, through a real Vite build: two chunks
// importing byte-identical CSS, a host page importing both, and a page per
// chunk. Vite alone leaves the second page unlinked (its html plugin caches
// the second chunk's list empty while processing the host);
// entryStylesheetsPlugin restores the link. Should Vite stop dropping it, the
// first test fails, and the plugin can go.

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, type Plugin, type Rollup } from 'vite';
import { entryStylesheetsPlugin } from '../src/vite-configuration';

let root: string;

beforeAll(() => {
  // The real path: Vite names pages by their path from the root.
  root = realpathSync(
    mkdtempSync(join(tmpdir(), 'preview-entry-stylesheets-'))
  );
  const page = (script: string) =>
    `<!doctype html>\n<html>\n  <head>\n    <script type="module" src="./${script}"></script>\n  </head>\n  <body></body>\n</html>\n`;
  const files: Record<string, string> = {
    'index.html': page('host.js'),
    'first.html': page('first-page.js'),
    'second.html': page('second-page.js'),
    'host.js':
      "import { first } from './first.js';\nimport { second } from './second.js';\nconsole.log(first, second);\n",
    'first-page.js':
      "import { first } from './first.js';\nconsole.log(first);\n",
    'second-page.js':
      "import { second } from './second.js';\nconsole.log(second);\n",
    'first.js': "import './first.css';\nexport const first = 'first';\n",
    'second.js': "import './second.css';\nexport const second = 'second';\n",
    // Byte-identical, so Rollup writes them as one asset.
    'first.css': '.shared { color: rebeccapurple; }\n',
    'second.css': '.shared { color: rebeccapurple; }\n',
  };
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(root, name), content);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Holds the other pages back until the host page is transformed, so Vite's
 * html plugin meets the host first, as in the preview's own build, rather
 * than in whatever order a loaded machine loads the pages.
 */
function hostFirst(): Plugin {
  let hostTransformed: () => void = () => {};
  const host = new Promise<void>(
    (resolveHost) => (hostTransformed = resolveHost)
  );
  return {
    name: 'test-host-first',
    enforce: 'pre',
    async load(id) {
      if (id.endsWith('.html') && !id.endsWith('index.html')) await host;
      return null;
    },
    transform: {
      order: 'post',
      handler(_code, id) {
        if (id.endsWith('index.html')) hostTransformed();
        return null;
      },
    },
  };
}

/** The built pages' html, by file name. */
async function buildPages(plugins: Plugin[]): Promise<Record<string, string>> {
  const output = (await build({
    configFile: false,
    root,
    base: './',
    logLevel: 'silent',
    plugins: [hostFirst(), ...plugins],
    build: {
      write: false,
      rollupOptions: {
        input: {
          host: join(root, 'index.html'),
          first: join(root, 'first.html'),
          second: join(root, 'second.html'),
        },
      },
    },
  })) as Rollup.RollupOutput;
  return Object.fromEntries(
    output.output
      .filter(
        (file): file is Rollup.OutputAsset =>
          file.type === 'asset' && file.fileName.endsWith('.html')
      )
      .map((file) => [file.fileName, String(file.source)])
  );
}

const stylesheetLinks = (html: string) =>
  html.match(/<link rel="stylesheet"[^>]*>/g) ?? [];

describe('entryStylesheetsPlugin - a real build', () => {
  it('reproduces the page Vite leaves unlinked', async () => {
    const pages = await buildPages([]);
    expect(stylesheetLinks(pages['index.html'])).toHaveLength(1);
    expect(stylesheetLinks(pages['first.html'])).toHaveLength(1);
    expect(stylesheetLinks(pages['second.html'])).toEqual([]);
  });

  it('links every page to the shared stylesheet, and adds nothing Vite linked', async () => {
    const pages = await buildPages([entryStylesheetsPlugin()]);
    const [hostLink] = stylesheetLinks(pages['index.html']);
    expect(stylesheetLinks(pages['index.html'])).toEqual([hostLink]);
    expect(stylesheetLinks(pages['first.html'])).toEqual([hostLink]);
    expect(stylesheetLinks(pages['second.html'])).toEqual([hostLink]);
  });
});
