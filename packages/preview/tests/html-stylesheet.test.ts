// The component styles the html pane shows its markup under: read from what
// the kit's build wrote for the html target - a page's `<style>` blocks under
// `in-file`, a component's own stylesheet under `separate-file` - for the
// story's component and each component it composes, and carried with the
// markup the development server answers and the static build stores.

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadPreviewContext, type PreviewContext } from '../src/context';
import { generatePreview } from '../src/generate';
import {
  htmlComponentStylesheet,
  htmlSourceResponse,
  styleBlocksOf,
} from '../src/html-stylesheet';
import { loadKit } from '../src/load';
import { printHtmlSource } from '../src/story-source';
import type { EnumeratedComponent } from '../src/lib/types';

const fixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/generate-kit'
);

let kitRoot: string;
let context: PreviewContext;
let components: EnumeratedComponent[];

function write(path: string, content: string): void {
  mkdirSync(dirname(join(kitRoot, path)), { recursive: true });
  writeFileSync(join(kitRoot, path), content);
}

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  kitRoot = mkdtempSync(join(tmpdir(), 'preview-html-stylesheet-'));
  cpSync(fixture, kitRoot, { recursive: true });
  // A component that composes another, each with styles built for html:
  // Badge's page under in-file, Panel's own sheet under separate-file.
  write(
    'src/components/panel.ts',
    `export default {
  type: 'component',
  name: 'Panel',
  children: [{ type: 'element', tag: 'section', attributes: { class: 'panel' }, children: [{ type: 'element', tag: 'Badge', children: [{ type: 'text', content: 'New' }] }] }],
};
`
  );
  write(
    'dist/html/Badge.html',
    '<style>\n.badge { color: red; }\n</style>\n\n<span class="badge"><!-- slot --><!-- /slot --></span>\n'
  );
  write('dist/html/Panel.html', '<section class="panel"></section>\n');
  write('dist/html/Panel.css', '.panel { display: grid; }\n');
  // An SCSS sheet that reads a module from the kit's sass loadPaths.
  write('styles/_tokens.scss', '$gap: 2px;\n');
  write(
    'dist/html/BadgeDot.scss',
    '@use "tokens";\n.badge-dot { margin: tokens.$gap; }\n'
  );
  const configurationPath = join(kitRoot, 'scaffold-ui-kit.ts');
  writeFileSync(
    configurationPath,
    readFileSync(configurationPath, 'utf8').replace(
      "styling: [],",
      "styling: [],\n  loadPaths: ['styles'],"
    )
  );
  // The kit's styles published under its own name, for a pkg: URL.
  write(
    'package.json',
    JSON.stringify({
      name: 'acme',
      version: '1.2.3',
      exports: { './styles/*': './styles/*.scss' },
    })
  );
  context = loadPreviewContext(kitRoot);
  components = (await loadKit(context)).components.map(
    (entry) => entry.component
  );
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(kitRoot, { recursive: true, force: true });
});

describe('styleBlocksOf', () => {
  it("joins a page's style blocks, and is empty for a page with none", () => {
    expect(
      styleBlocksOf(
        '<style>\n.a { color: red; }\n</style><p></p><style data-x>.b {}</style>'
      )
    ).toBe('.a { color: red; }\n.b {}');
    expect(styleBlocksOf('<p></p>')).toBe('');
  });
});

describe('htmlComponentStylesheet', () => {
  it('reads a page’s style blocks and a component’s own sheet, each under its name', () => {
    expect(
      htmlComponentStylesheet(context, components, ['Panel', 'Badge'])
    ).toBe(
      '/* Panel */\n.panel { display: grid; }\n\n/* Badge */\n.badge { color: red; }'
    );
  });

  it('adds nothing for a component with no built styles, a name that is no identifier, or a kit with no html build', () => {
    expect(htmlComponentStylesheet(context, components, ['BadgeVisual'])).toBe(
      ''
    );
    const traversing = { ...components[0], name: '../Badge' };
    expect(htmlComponentStylesheet(context, [traversing], ['../Badge'])).toBe(
      ''
    );
    const unbuilt = loadPreviewContext(fixture);
    expect(htmlComponentStylesheet(unbuilt, components, ['Badge'])).toBe('');
  });
});

describe('an SCSS sheet', () => {
  it("compiles with the kit's sass and loadPaths, once until it changes", () => {
    const sheet = join(kitRoot, 'dist/html/BadgeDot.scss');
    const mtime = new Date(2020, 0, 1);
    utimesSync(sheet, mtime, mtime);
    // The kit's own sass, as an installed kit has it.
    const coreRequire = createRequire(
      createRequire(import.meta.url).resolve('@js-template-engine/core')
    );
    mkdirSync(join(kitRoot, 'node_modules'), { recursive: true });
    symlinkSync(
      dirname(realpathSync(coreRequire.resolve('sass'))),
      join(kitRoot, 'node_modules/sass')
    );
    expect(htmlComponentStylesheet(context, components, ['BadgeDot'])).toBe(
      '/* BadgeDot */\n.badge-dot {\n  margin: 2px;\n}'
    );
    // A sheet whose modification time is unchanged is not compiled again.
    writeFileSync(sheet, '.badge-dot { margin: 4px; }\n');
    utimesSync(sheet, mtime, mtime);
    expect(
      htmlComponentStylesheet(context, components, ['BadgeDot'])
    ).toContain('margin: 2px');
    const later = new Date(mtime.getTime() + 5000);
    utimesSync(sheet, later, later);
    expect(
      htmlComponentStylesheet(context, components, ['BadgeDot'])
    ).toContain('margin: 4px');
  });

  it("resolves the kit's own pkg: URLs through its exports", () => {
    const sheet = join(kitRoot, 'dist/html/BadgeDot.scss');
    writeFileSync(
      sheet,
      '@use "pkg:acme/styles/tokens";\n.badge-dot { gap: tokens.$gap; }\n'
    );
    const later = new Date(Date.now() + 30_000);
    utimesSync(sheet, later, later);
    expect(htmlComponentStylesheet(context, components, ['BadgeDot'])).toBe(
      '/* BadgeDot */\n.badge-dot {\n  gap: 2px;\n}'
    );
  });

  it('is left out, said once, when it does not compile', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sheet = join(kitRoot, 'dist/html/BadgeDot.scss');
    writeFileSync(sheet, '.badge-dot { margin: $missing; }\n');
    const later = new Date(Date.now() + 60_000);
    utimesSync(sheet, later, later);
    expect(htmlComponentStylesheet(context, components, ['BadgeDot'])).toBe('');
    expect(htmlComponentStylesheet(context, components, ['BadgeDot'])).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(
      'the html pane leaves out BadgeDot.scss'
    );
    rmSync(sheet);
  });
});

describe('the html source with its styles', () => {
  it('carries the styles of the story’s component and each it composes', async () => {
    const panel = components.find((component) => component.name === 'Panel')!;
    const result = await printHtmlSource(context, components, {
      component: panel,
      props: {},
      named: {},
    });
    expect(result.markup).toBeDefined();
    expect(result.markup !== undefined && result.components).toEqual([
      'Panel',
      'Badge',
    ]);
    expect(htmlSourceResponse(context, components, result)).toEqual({
      markup: result.markup,
      stylesheet:
        '/* Panel */\n.panel { display: grid; }\n\n/* Badge */\n.badge { color: red; }',
    });
  });

  it('stores them with each scenario the static build prints', async () => {
    await generatePreview(context, { htmlSources: true });
    const stored = JSON.parse(
      readFileSync(
        join(context.generatedRoot, 'public/html-source/parts-panel.json'),
        'utf8'
      )
    ) as Record<string, { stylesheet?: string }>;
    expect(stored[''].stylesheet).toContain('.badge { color: red; }');
  });
});
