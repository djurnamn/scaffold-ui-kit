// Loading the kit configuration's `preview` block: every validation failure
// names the offending key, and a valid block resolves to a context whose
// sources are sorted by `order` and whose paths are absolute against the kit
// root. A kit configured in scaffold-ui-kit.config.json still loads, with a
// warning; preview settings under `extensions` are an error in any file.

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  jsonProblems,
  loadPreviewContext,
  paneWidthsProblem,
} from '../src/context';
import { kitPaneWidths } from '../src/load';
import { checkPreview } from '../src/check';

const here = dirname(fileURLToPath(import.meta.url));
const kitRoots: string[] = [];

/** A fresh kit root holding `configuration` as `file`, scaffold-ui-kit.json
 *  by default (none at all when `configuration` is undefined). */
function kitWith(
  configuration?: unknown,
  file = 'scaffold-ui-kit.json'
): string {
  const kitRoot = mkdtempSync(join(tmpdir(), 'preview-context-'));
  kitRoots.push(kitRoot);
  if (configuration !== undefined) {
    mkdirSync(join(kitRoot, file, '..'), { recursive: true });
    writeFileSync(join(kitRoot, file), JSON.stringify(configuration));
  }
  mkdirSync(join(kitRoot, 'preview'));
  writeFileSync(join(kitRoot, 'preview/shell.ts'), 'export {};\n');
  return kitRoot;
}

/** A kit configuration whose preview block is `preview`, with the shell set
 *  to the module `kitWith` writes unless the block names one itself. */
function withPreview(preview: unknown): unknown {
  return {
    name: 'acme',
    targets: ['react', 'vue', 'svelte'],
    preview: { shell: 'preview/shell.ts', ...(preview as object) },
  };
}

const validSource = { id: 'kit', label: 'Kit', order: 0, moduleBase: 'acme' };

afterEach(() => {
  for (const kitRoot of kitRoots.splice(0))
    rmSync(kitRoot, { recursive: true, force: true });
});

describe('loadPreviewContext - validation', () => {
  it('fails when the kit root has no kit configuration', () => {
    const kitRoot = kitWith();
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      /\[preview\] No scaffold-ui-kit\.ts or scaffold-ui-kit\.json found/
    );
  });

  it('fails when the configuration has no preview block', () => {
    expect(() =>
      loadPreviewContext(kitWith({ name: 'acme', targets: ['react'] }))
    ).toThrow('[preview] scaffold-ui-kit.json has no preview block');
    expect(() =>
      loadPreviewContext(
        kitWith({ name: 'acme', targets: ['react'], preview: 'yes' })
      )
    ).toThrow("'preview' must be an object of the preview's settings");
  });

  it('fails on a kit configuration the build would refuse', () => {
    expect(() =>
      loadPreviewContext(
        kitWith({
          name: 'acme',
          preview: { sources: [validSource], shell: 'preview/shell.ts' },
        })
      )
    ).toThrow(/scaffold-ui-kit\.json is invalid:\n {2}- 'targets' is required/);
  });

  it('fails when sources is missing or empty', () => {
    const message = /preview\.sources must be a non-empty array/;
    expect(() => loadPreviewContext(kitWith(withPreview({})))).toThrow(message);
    expect(() =>
      loadPreviewContext(kitWith(withPreview({ sources: [] })))
    ).toThrow(message);
  });

  it('fails when a source is not an object', () => {
    expect(() =>
      loadPreviewContext(kitWith(withPreview({ sources: [validSource, null] })))
    ).toThrow(/preview\.sources\[1\] must be an object/);
  });

  for (const key of ['id', 'label', 'moduleBase'] as const) {
    it(`fails when a source is missing ${key}, naming the source's index`, () => {
      const { [key]: _removed, ...source } = validSource;
      expect(() =>
        loadPreviewContext(
          kitWith(withPreview({ sources: [validSource, source] }))
        )
      ).toThrow(`preview.sources[1].${key} must be a non-empty string`);
    });

    it(`fails when a source's ${key} is an empty string`, () => {
      const source = { ...validSource, [key]: '' };
      expect(() =>
        loadPreviewContext(kitWith(withPreview({ sources: [source] })))
      ).toThrow(`preview.sources[0].${key} must be a non-empty string`);
    });
  }

  it('fails when a source order is not a number', () => {
    const source = { ...validSource, order: '1' };
    expect(() =>
      loadPreviewContext(kitWith(withPreview({ sources: [source] })))
    ).toThrow('preview.sources[0].order must be a number');
  });

  it('fails on an unknown key in the block or a source, naming each with the keys it takes', () => {
    const kitRoot = kitWith(
      withPreview({
        shel: 'x',
        paneWidth: [400],
        sources: [{ ...validSource, storyDirectory: 'preview/stories' }],
      })
    );
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      [
        "[preview] unknown key 'preview.shel'; the 'preview' block takes shell, sources, options, canvas, themes, mount, viewCanvas, paneWidths, controlHints, labels, viewsModule, codeBlock, setupModules, htmlStylesheets, aliases, scssLoadPaths, optimizeDepsExclude, dedupe, omitPattern, handWrittenComponents, port, host, persistence, landing",
        "[preview] unknown key 'preview.paneWidth'; the 'preview' block takes shell, sources, options, canvas, themes, mount, viewCanvas, paneWidths, controlHints, labels, viewsModule, codeBlock, setupModules, htmlStylesheets, aliases, scssLoadPaths, optimizeDepsExclude, dedupe, omitPattern, handWrittenComponents, port, host, persistence, landing",
        "[preview] unknown key 'preview.sources[0].storyDirectory'; a source takes id, label, order, moduleBase, templatesDirectory, manualModule, storiesDirectory",
      ].join('\n')
    );
  });

  it('says what to use for a block or source key it has a name for', () => {
    const kitRoot = kitWith(
      withPreview({
        scopes: [],
        configurationModule: './preview/configuration.ts',
        sources: [{ ...validSource, sidecarsDirectory: 'preview/stories' }],
      })
    );
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      [
        "[preview] unknown key 'preview.scopes'; use 'sources'",
        "[preview] unknown key 'preview.configurationModule'; use the keys of the 'preview' block, such as options, canvas, themes and mount",
        "[preview] unknown key 'preview.sources[0].sidecarsDirectory'; use 'storiesDirectory'",
      ].join('\n')
    );
  });

  it('keeps a key a replacement is named for to the object that had it', () => {
    const kitRoot = kitWith(
      withPreview({ sources: [{ ...validSource, scopes: [] }] })
    );
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      "[preview] unknown key 'preview.sources[0].scopes'; a source takes id, label"
    );
  });

  it('fails on an unknown key in each object inside the block, in the same words', () => {
    const kitRoot = kitWith(
      withPreview({
        sources: [validSource],
        codeBlock: { module: 'code.tsx', framwork: 'react' },
        setupModules: { react: 'setup.ts', reakt: 'setup.ts' },
        handWrittenComponents: {
          Menu: 'content',
          Dialog: { template: 'Panel', slot: {} },
        },
        landing: { component: 'components-button', scenaro: 'primary' },
      })
    );
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      [
        "[preview] unknown key 'preview.codeBlock.framwork'; a code block takes module, framework",
        "[preview] unknown key 'preview.setupModules.reakt'; the 'setupModules' map takes react, vue, svelte",
        "[preview] unknown key 'preview.landing.scenaro'; the landing entry takes view, component, scenario",
        "[preview] unknown key 'preview.handWrittenComponents.Dialog.slot'; a hand-written component takes template, slots",
      ].join('\n')
    );
  });

  it('accepts every key the block and a source take', () => {
    const kitRoot = kitWith(
      withPreview({
        sources: [
          {
            ...validSource,
            templatesDirectory: 'src',
            manualModule: 'm.ts',
            storiesDirectory: 'preview/stories',
          },
        ],
        viewsModule: 'v.ts',
        codeBlock: { module: 'code.tsx', framework: 'react' },
        setupModules: { react: 'r.ts', vue: 'v.ts', svelte: 's.ts' },
        htmlStylesheets: [],
        aliases: {},
        scssLoadPaths: [],
        optimizeDepsExclude: [],
        dedupe: [],
        omitPattern: 'Part$',
        handWrittenComponents: {
          Menu: 'content',
          Dialog: { template: 'Panel', slots: { body: 'default' } },
        },
        port: 6100,
        host: false,
        persistence: 'url',
        landing: { component: 'components-button', scenario: 'primary' },
      })
    );
    expect(() => loadPreviewContext(kitRoot)).not.toThrow();
  });

  it('names the frames after the kit without a canvas, and fails on a canvas without a name prefix', () => {
    const named = kitWith({
      ...(withPreview({ sources: [validSource] }) as object),
      name: '@acme/ui kit',
    });
    expect(loadPreviewContext(named).configuration.canvas).toEqual({
      namePrefix: 'acme-ui-kit',
    });
    expect(() =>
      loadPreviewContext(
        kitWith(
          withPreview({
            sources: [validSource],
            canvas: { pageBackground: 'black' },
          })
        )
      )
    ).toThrow(
      'preview.canvas must be { namePrefix, pageBackground?, extraCss? }'
    );
  });
});

describe('loadPreviewContext - shell', () => {
  const preview = { sources: [validSource] };

  it('fails without a shell, naming the shell shipped with the preview', () => {
    const kitRoot = kitWith({ name: 'acme', targets: ['react'], preview });
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      "preview.shell is required: the shell that renders the preview's interface, as a package specifier or a module path relative to the kit root. " +
        "To use the shell shipped with the preview, install charcell and @zag-js/react and set shell: '@scaffold-ui-kit/preview/shells/charcell'."
    );
    expect(() =>
      loadPreviewContext(kitWith(withPreview({ ...preview, shell: '' })))
    ).toThrow(/preview\.shell is required/);
  });

  it('resolves a module path against the kit root, and fails naming a missing one', () => {
    const kitRoot = kitWith(
      withPreview({ ...preview, shell: 'preview/shell.ts' })
    );
    expect(loadPreviewContext(kitRoot).shellModuleAbsolute).toBe(
      join(kitRoot, 'preview/shell.ts')
    );
    const dotted = kitWith(
      withPreview({ ...preview, shell: './preview/shell.ts' })
    );
    expect(loadPreviewContext(dotted).shellModuleAbsolute).toBe(
      join(dotted, 'preview/shell.ts')
    );
    const missing = kitWith(
      withPreview({ ...preview, shell: './preview/missing.ts' })
    );
    expect(() => loadPreviewContext(missing)).toThrow(
      `preview.shell names a module that does not exist: ${join(missing, 'preview/missing.ts')}`
    );
  });

  it("resolves a package specifier from the kit, through the package's exports", () => {
    const kitRoot = kitWith(
      withPreview({ ...preview, shell: '@acme/shells/compact' })
    );
    const packageRoot = join(kitRoot, 'node_modules/@acme/shells');
    mkdirSync(join(packageRoot, 'lib'), { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@acme/shells',
        exports: { '.': './lib/index.js', './compact': './lib/compact.tsx' },
      })
    );
    writeFileSync(join(packageRoot, 'lib/compact.tsx'), 'export default {};\n');
    // The package's real location, as the kit's own imports resolve.
    expect(loadPreviewContext(kitRoot).shellModuleAbsolute).toBe(
      realpathSync(join(packageRoot, 'lib/compact.tsx'))
    );
  });

  it("takes the shell's module and page as an object, each a path or a package specifier", () => {
    const kitRoot = kitWith(
      withPreview({
        ...preview,
        shell: { module: 'preview/shell.ts', page: 'preview/page.ts' },
      })
    );
    writeFileSync(join(kitRoot, 'preview/page.ts'), 'export default {};\n');
    const context = loadPreviewContext(kitRoot);
    expect(context.shellModuleAbsolute).toBe(join(kitRoot, 'preview/shell.ts'));
    expect(context.shellPageAbsolute).toBe(join(kitRoot, 'preview/page.ts'));
    expect(context.configuration.shell).toBe('preview/shell.ts');
    const missing = kitWith(
      withPreview({
        ...preview,
        shell: { module: 'preview/shell.ts', page: './preview/missing.ts' },
      })
    );
    expect(() => loadPreviewContext(missing)).toThrow(
      `preview.shell.page names a module that does not exist: ${join(missing, 'preview/missing.ts')}`
    );
    const nowhere = kitWith(
      withPreview({
        ...preview,
        shell: { module: 'preview/shell.ts', page: '@acme/nowhere/page' },
      })
    );
    expect(() => loadPreviewContext(nowhere)).toThrow(
      `preview.shell.page '@acme/nowhere/page' is neither a module in the kit nor a package installed in it (resolved from ${nowhere}). ` +
        "Give a path relative to the kit root, or the page module of an installed shell, such as '@scaffold-ui-kit/preview/shells/charcell/page'."
    );
  });

  it("uses the page a shell's package ships at its specifier's /page, and none for a shell without one or a shell in the kit", () => {
    const packaged = (exports: Record<string, string>) => {
      const kitRoot = kitWith(
        withPreview({ ...preview, shell: '@acme/shells/compact' })
      );
      const packageRoot = join(kitRoot, 'node_modules/@acme/shells');
      mkdirSync(join(packageRoot, 'lib'), { recursive: true });
      writeFileSync(
        join(packageRoot, 'package.json'),
        JSON.stringify({ name: '@acme/shells', exports })
      );
      writeFileSync(join(packageRoot, 'lib/compact.tsx'), 'export default {};\n');
      writeFileSync(join(packageRoot, 'lib/page.js'), 'export default {};\n');
      return { kitRoot, packageRoot };
    };
    const shipped = packaged({
      './compact': './lib/compact.tsx',
      './compact/page': './lib/page.js',
    });
    expect(loadPreviewContext(shipped.kitRoot).shellPageAbsolute).toBe(
      realpathSync(join(shipped.packageRoot, 'lib/page.js'))
    );
    const bare = packaged({ './compact': './lib/compact.tsx' });
    expect(loadPreviewContext(bare.kitRoot).shellPageAbsolute).toBeUndefined();
    // A shell in the kit names its page, or has none.
    const inKit = kitWith(withPreview(preview));
    expect(loadPreviewContext(inKit).shellPageAbsolute).toBeUndefined();
  });

  it("fails on a shell package whose page export does not resolve, and warns of a module that configures the charcell shell with no page", () => {
    const kitRoot = kitWith(
      withPreview({ ...preview, shell: '@acme/shells/compact' })
    );
    const packageRoot = join(kitRoot, 'node_modules/@acme/shells');
    mkdirSync(join(packageRoot, 'lib'), { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@acme/shells',
        exports: {
          './package.json': './package.json',
          './compact': './lib/compact.tsx',
          './compact/page': './lib/missing.js',
        },
      })
    );
    writeFileSync(join(packageRoot, 'lib/compact.tsx'), 'export default {};\n');
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      "[preview] the shell '@acme/shells/compact' exports a page at '@acme/shells/compact/page' that does not resolve: "
    );

    const wrapping = kitWith(withPreview(preview));
    const packages = join(wrapping, 'node_modules/@scaffold-ui-kit');
    mkdirSync(packages, { recursive: true });
    symlinkSync(resolve(here, '..'), join(packages, 'preview'), 'dir');
    writeFileSync(
      join(wrapping, 'preview/shell.ts'),
      "import { charcellShell } from '@scaffold-ui-kit/preview/shells/charcell';\nexport default charcellShell({});\n"
    );
    expect(loadPreviewContext(wrapping).warnings).toContain(
      "preview.shell names a module that configures the charcell shell and no page, so the host page starts empty and light until the shell loads; " +
        "name the shell's page beside it: shell: { module: 'preview/shell.ts', page: '@scaffold-ui-kit/preview/shells/charcell/page' }"
    );
    const named = kitWith(
      withPreview({
        ...preview,
        shell: {
          module: 'preview/shell.ts',
          page: '@scaffold-ui-kit/preview/shells/charcell/page',
        },
      })
    );
    const namedPackages = join(named, 'node_modules/@scaffold-ui-kit');
    mkdirSync(namedPackages, { recursive: true });
    symlinkSync(resolve(here, '..'), join(namedPackages, 'preview'), 'dir');
    writeFileSync(
      join(named, 'preview/shell.ts'),
      "import { charcellShell } from '@scaffold-ui-kit/preview/shells/charcell';\nexport default charcellShell({});\n"
    );
    const context = loadPreviewContext(named);
    expect(context.warnings.join()).not.toContain('no page');
    expect(context.shellPageAbsolute).toBe(
      resolve(here, '../dist/shells/charcell/page.js')
    );
  });

  it('finds the page of the shell shipped with the preview', () => {
    const kitRoot = kitWith(
      withPreview({
        ...preview,
        shell: '@scaffold-ui-kit/preview/shells/charcell',
      })
    );
    const packages = join(kitRoot, 'node_modules/@scaffold-ui-kit');
    mkdirSync(packages, { recursive: true });
    symlinkSync(resolve(here, '..'), join(packages, 'preview'), 'dir');
    expect(loadPreviewContext(kitRoot).shellPageAbsolute).toBe(
      resolve(here, '../dist/shells/charcell/page.js')
    );
  });

  it('fails on a shell that is neither a specifier nor a module with an optional page', () => {
    const shape =
      "preview.shell must be a package specifier or a module path, or an object with 'module' and optional 'page'";
    for (const [shell, message] of [
      [7, shape],
      [['preview/shell.ts'], shape],
      [
        { page: 'preview/page.ts' },
        "preview.shell.module is required: the shell's module, as a package specifier or a module path relative to the kit root",
      ],
      [
        { module: 'preview/shell.ts', page: 7 },
        "preview.shell.page must be a package specifier or a module path relative to the kit root: the shell's page module",
      ],
      [
        { module: 'preview/shell.ts', pages: 'preview/page.ts' },
        "unknown key 'preview.shell.pages'; preview.shell takes module and page",
      ],
    ] as const) {
      expect(() =>
        loadPreviewContext(kitWith(withPreview({ ...preview, shell })))
      ).toThrow(message);
    }
  });

  it('fails on a package the kit does not have, saying how to get a shell', () => {
    const kitRoot = kitWith(
      withPreview({ ...preview, shell: '@acme/nowhere' })
    );
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      `preview.shell '@acme/nowhere' is neither a module in the kit nor a package installed in it (resolved from ${kitRoot}). ` +
        'Install the package the shell comes from, or give a path relative to the kit root. ' +
        "The shell shipped with the preview is '@scaffold-ui-kit/preview/shells/charcell'; it needs charcell and @zag-js/react installed."
    );
  });
});

describe('loadPreviewContext - omitPattern', () => {
  it('compiles the pattern, and fails naming the key when it is not a regular expression', () => {
    const preview = { sources: [validSource] };
    expect(
      loadPreviewContext(kitWith(withPreview(preview))).omitPattern
    ).toBeUndefined();
    const context = loadPreviewContext(
      kitWith(withPreview({ ...preview, omitPattern: '(Driver|Visual)$' }))
    );
    expect(context.omitPattern?.test('ButtonVisual')).toBe(true);
    expect(context.omitPattern?.test('Button')).toBe(false);
    expect(() =>
      loadPreviewContext(kitWith(withPreview({ ...preview, omitPattern: '(' })))
    ).toThrow(/preview\.omitPattern/);
  });
});

describe('loadPreviewContext - htmlStylesheets', () => {
  it('reads a list of stylesheet paths for the html pane, and fails on anything else', () => {
    const preview = { sources: [validSource] };
    expect(
      loadPreviewContext(kitWith(withPreview(preview))).configuration
        .htmlStylesheets
    ).toBeUndefined();
    expect(
      loadPreviewContext(
        kitWith(
          withPreview({ ...preview, htmlStylesheets: ['preview/html.css'] })
        )
      ).configuration.htmlStylesheets
    ).toEqual(['preview/html.css']);
    for (const htmlStylesheets of ['preview/html.css', [''], [3]]) {
      expect(() =>
        loadPreviewContext(
          kitWith(withPreview({ ...preview, htmlStylesheets }))
        )
      ).toThrow(/preview\.htmlStylesheets must be a list of stylesheet paths/);
    }
  });
});

describe('loadPreviewContext - dedupe', () => {
  it('reads a list of package names, and fails on anything else', () => {
    const preview = { sources: [validSource] };
    expect(
      loadPreviewContext(kitWith(withPreview(preview))).configuration.dedupe
    ).toBeUndefined();
    expect(
      loadPreviewContext(
        kitWith(withPreview({ ...preview, dedupe: ['@dnd-kit/dom'] }))
      ).configuration.dedupe
    ).toEqual(['@dnd-kit/dom']);
    for (const dedupe of ['@dnd-kit/dom', [''], [3]]) {
      expect(() =>
        loadPreviewContext(kitWith(withPreview({ ...preview, dedupe })))
      ).toThrow(/preview\.dedupe must be a list of package names/);
    }
  });
});

describe('loadPreviewContext - persistence', () => {
  it("takes 'url' or 'url-and-local-storage', and fails naming the key otherwise", () => {
    const preview = { sources: [validSource] };
    expect(
      loadPreviewContext(kitWith(withPreview(preview))).configuration
        .persistence
    ).toBeUndefined();
    expect(
      loadPreviewContext(
        kitWith(
          withPreview({ ...preview, persistence: 'url-and-local-storage' })
        )
      ).configuration.persistence
    ).toBe('url-and-local-storage');
    expect(() =>
      loadPreviewContext(
        kitWith(withPreview({ ...preview, persistence: 'cookie' }))
      )
    ).toThrow(
      `preview.persistence must be 'url' or 'url-and-local-storage', not "cookie"`
    );
  });
});

describe('loadPreviewContext - landing', () => {
  const preview = { sources: [validSource] };

  it('takes a view, or a component with or without a scenario', () => {
    for (const landing of [
      { view: 'foundations' },
      { component: 'components-button' },
      { component: 'components-button', scenario: 'ghost' },
    ])
      expect(
        loadPreviewContext(kitWith(withPreview({ ...preview, landing })))
          .configuration.landing
      ).toEqual(landing);
  });

  it('fails on any other shape, naming the key and the shapes it takes', () => {
    for (const landing of [
      'foundations',
      [],
      {},
      { view: '' },
      { view: 'foundations', component: 'components-button' },
      { view: 'foundations', scenario: 'ghost' },
      { component: 3 },
      { scenario: 'ghost' },
      { component: 'components-button', scenario: '' },
    ])
      expect(() =>
        loadPreviewContext(kitWith(withPreview({ ...preview, landing })))
      ).toThrow('preview.landing must be { view } or { component, scenario? }');
  });
});

describe('pane widths', () => {
  it('reads preview.paneWidths, and names it when the list is unusable', () => {
    const preview = { sources: [validSource] };
    const context = loadPreviewContext(
      kitWith(
        withPreview({
          ...preview,
          paneWidths: [{ label: 'narrow', width: 360 }],
        })
      )
    );
    expect(kitPaneWidths(context)).toEqual({
      paneWidths: [{ label: 'narrow', width: 360 }],
      errors: [],
    });
    const unusable = loadPreviewContext(
      kitWith(
        withPreview({ ...preview, paneWidths: [{ label: 'narrow', width: 0 }] })
      )
    );
    expect(kitPaneWidths(unusable).errors).toEqual([
      expect.stringMatching(
        /^preview\.paneWidths must be a list of \{ label, width \}/
      ),
    ]);
  });

  it('takes a list of labeled widths in whole pixels, and names where the list comes from otherwise', () => {
    expect(
      paneWidthsProblem([{ label: 'narrow', width: 360 }], 'previewPaneWidths')
    ).toBeUndefined();
    expect(
      paneWidthsProblem([{ label: 'huge', width: 7680 }], 'previewPaneWidths')
    ).toBeUndefined();
    expect(paneWidthsProblem([], 'previewPaneWidths')).toBeUndefined();
    for (const paneWidths of [
      360,
      [360],
      [{ label: 'narrow' }],
      [{ label: '', width: 360 }],
      [{ label: 'narrow', width: 0 }],
      [{ label: 'narrow', width: 360.5 }],
      [{ label: 'narrow', width: '360' }],
      [{ label: 'huge', width: 7681 }],
    ]) {
      expect(paneWidthsProblem(paneWidths, 'previewPaneWidths')).toMatch(
        /^previewPaneWidths must be a list of \{ label, width \}/
      );
    }
    expect(
      paneWidthsProblem(
        [
          { label: 'narrow', width: 360 },
          { label: 'narrow', width: 390 },
        ],
        'previewPaneWidths'
      )
    ).toBe('previewPaneWidths must not name a label twice');
    expect(
      paneWidthsProblem(
        [
          { label: 'narrow', width: 360 },
          { label: 'slim', width: 360 },
        ],
        'previewPaneWidths'
      )
    ).toBe('previewPaneWidths must not name a width twice');
  });
});

describe('loadPreviewContext - a valid block', () => {
  it('sorts sources by order and resolves every path against the kit root', () => {
    const kitRoot = kitWith(
      withPreview({
        viewsModule: 'preview/views.ts',
        sources: [
          {
            id: 'icons',
            label: 'Icons',
            order: 2,
            moduleBase: '@acme/icons',
          },
          {
            id: 'kit',
            label: 'Kit',
            order: 0,
            moduleBase: 'acme',
            templatesDirectory: 'src/components',
            manualModule: 'preview/manual.ts',
            storiesDirectory: 'preview/stories',
          },
        ],
      })
    );
    const context = loadPreviewContext(kitRoot);

    expect(context.kitRoot).toBe(kitRoot);
    expect(context.kitName).toBe('acme');
    expect(context.generatedRoot).toBe(join(kitRoot, '.preview-generated'));
    expect(context.staticRoot).toBe(join(kitRoot, '.preview-static'));
    expect(context.configurationPath).toBe(
      join(kitRoot, 'scaffold-ui-kit.json')
    );
    expect(context.warnings).toEqual([]);
    expect(context.viewsModuleAbsolute).toBe(join(kitRoot, 'preview/views.ts'));

    expect(context.sources.map((source) => source.id)).toEqual([
      'kit',
      'icons',
    ]);
    const [kit, icons] = context.sources;
    expect(kit.templatesDirectoryAbsolute).toBe(
      join(kitRoot, 'src/components')
    );
    expect(kit.manualModuleAbsolute).toBe(join(kitRoot, 'preview/manual.ts'));
    expect(kit.storiesDirectoryAbsolute).toBe(join(kitRoot, 'preview/stories'));
    for (const path of [
      kit.templatesDirectoryAbsolute,
      kit.manualModuleAbsolute,
      kit.storiesDirectoryAbsolute,
    ]) {
      expect(isAbsolute(path!)).toBe(true);
    }
    // A source that declares no directories resolves none.
    expect(icons.templatesDirectoryAbsolute).toBeUndefined();
    expect(icons.manualModuleAbsolute).toBeUndefined();
    expect(icons.storiesDirectoryAbsolute).toBeUndefined();
    expect(typeof context.importModule).toBe('function');
  });

  it('leaves the views module unset, and the options and themes empty', () => {
    const context = loadPreviewContext(
      kitWith(withPreview({ sources: [validSource] }))
    );
    expect(context.viewsModuleAbsolute).toBeUndefined();
    expect(context.configuration.options).toEqual([]);
    expect(context.configuration.themes).toEqual([]);
  });

  it("reads the kit version from the kit root's package.json", () => {
    const kitRoot = kitWith(withPreview({ sources: [validSource] }));
    expect(loadPreviewContext(kitRoot).kitVersion).toBeUndefined();

    writeFileSync(
      join(kitRoot, 'package.json'),
      JSON.stringify({ name: 'acme' })
    );
    expect(loadPreviewContext(kitRoot).kitVersion).toBeUndefined();

    writeFileSync(
      join(kitRoot, 'package.json'),
      JSON.stringify({ name: 'acme', version: '1.2.3' })
    );
    expect(loadPreviewContext(kitRoot).kitVersion).toBe('1.2.3');
  });
});

describe('loadPreviewContext - shared modules', () => {
  it("takes each shared module's specifier from the kit's exports, else an older specifier", () => {
    const kitRoot = kitWith({
      ...(withPreview({ sources: [validSource] }) as object),
      add: {
        shared: [
          { name: 'lib', source: 'src/lib' },
          { source: 'src/tokens.css' },
          { source: 'vendor/helpers', specifier: 'acme/helpers' },
          { source: 'src/unpublished' },
        ],
      },
    });
    mkdirSync(join(kitRoot, 'src/lib'), { recursive: true });
    writeFileSync(
      join(kitRoot, 'src/lib/index.ts'),
      'export const cn = () => "";\n'
    );
    writeFileSync(join(kitRoot, 'src/tokens.css'), ':root {}\n');
    writeFileSync(
      join(kitRoot, 'package.json'),
      JSON.stringify({
        name: 'acme',
        exports: {
          './lib': './src/lib/index.ts',
          './tokens.css': './src/tokens.css',
        },
      })
    );
    const context = loadPreviewContext(kitRoot);
    expect(context.sharedSpecifiers).toEqual([
      { source: 'src/lib', specifier: 'acme/lib' },
      { source: 'src/tokens.css', specifier: 'acme/tokens.css' },
      { source: 'vendor/helpers', specifier: 'acme/helpers' },
    ]);
    // Only code modules are evaluated for their exports.
    expect(context.sharedModulesAbsolute).toEqual([
      join(kitRoot, 'src/lib'),
      join(kitRoot, 'vendor/helpers'),
    ]);
  });
});

describe('loadPreviewContext - @scaffold-ui-kit/helpers', () => {
  /** Installs a stand-in helpers package with ESM-only exports under `directory`. */
  function installHelpers(directory: string): string {
    const packageDirectory = join(
      directory,
      'node_modules/@scaffold-ui-kit/helpers'
    );
    mkdirSync(join(packageDirectory, 'dist'), { recursive: true });
    writeFileSync(
      join(packageDirectory, 'package.json'),
      JSON.stringify({
        name: '@scaffold-ui-kit/helpers',
        type: 'module',
        exports: {
          './runtime': { import: './dist/runtime.js' },
          './runtime/svelte': { import: './dist/runtime-svelte.js' },
          './zag': { import: './dist/zag.js' },
        },
      })
    );
    for (const file of ['runtime.js', 'runtime-svelte.js', 'zag.js']) {
      writeFileSync(join(packageDirectory, 'dist', file), 'export {};\n');
    }
    return realpathSync(packageDirectory);
  }

  it('resolves the framework-free entries as the kit root has them installed', () => {
    const kitRoot = kitWith(withPreview({ sources: [validSource] }));
    writeFileSync(
      join(kitRoot, 'package.json'),
      JSON.stringify({ name: 'acme' })
    );
    const installed = installHelpers(kitRoot);
    expect(
      loadPreviewContext(kitRoot).helperModulesAbsolute.map((path) =>
        realpathSync(path)
      )
    ).toEqual([
      join(installed, 'dist/runtime.js'),
      join(installed, 'dist/zag.js'),
    ]);
  });

  it('resolves them from a kit package when the kit root does not have them', () => {
    const kitRoot = kitWith({
      ...(withPreview({ sources: [validSource] }) as object),
      targets: ['react'],
      stylesheetPlacement: 'separate-file',
      stylesheetLink: 'none',
      packages: {
        react: { name: '@acme/react', directory: 'react' },
        styles: { name: '@acme/styles', directory: 'styles' },
      },
    });
    mkdirSync(join(kitRoot, 'react'));
    writeFileSync(
      join(kitRoot, 'react/package.json'),
      JSON.stringify({ name: '@acme/react' })
    );
    const installed = installHelpers(join(kitRoot, 'react'));
    expect(
      loadPreviewContext(kitRoot).helperModulesAbsolute.map((path) =>
        realpathSync(path)
      )
    ).toEqual([
      join(installed, 'dist/runtime.js'),
      join(installed, 'dist/zag.js'),
    ]);
  });

  it('is empty for a kit without the package', () => {
    const kitRoot = kitWith(withPreview({ sources: [validSource] }));
    expect(loadPreviewContext(kitRoot).helperModulesAbsolute).toEqual([]);
  });
});

describe('loadPreviewContext - the data the pages read', () => {
  const preview = { sources: [validSource] };

  it('fails on a value the browser cannot be sent as JSON, naming where it sits', () => {
    const kitRoot = kitWith();
    writeFileSync(
      join(kitRoot, 'scaffold-ui-kit.ts'),
      `export default {
  name: 'acme',
  targets: ['react'],
  preview: {
    shell: 'preview/shell.ts',
    sources: [${JSON.stringify(validSource)}],
    options: [{ id: 'mode', label: 'mode', default: false, scope: 'global', apply: { type: 'class', className: () => 'dark' } }],
    canvas: { namePrefix: 'acme', extraCss: undefined },
    themes: [{ id: 'light', label: 'Light', css: 'light.css', assets: /fonts/ }],
    mount: { children: [undefined] },
  },
};
`
    );
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      [
        "[preview] preview.options[0].apply.className is a function, which can't be sent to the browser as JSON",
        "[preview] preview.themes[0].assets is RegExp object, which can't be sent to the browser as JSON",
        "[preview] preview.mount.children[0] is undefined, which can't be sent to the browser as JSON",
      ].join('\n')
    );
  });

  it('keeps the hooks only Node reads as functions, and the unset color token as null', () => {
    const kitRoot = kitWith();
    writeFileSync(
      join(kitRoot, 'scaffold-ui-kit.ts'),
      `export default {
  name: 'acme',
  targets: ['react'],
  preview: {
    shell: 'preview/shell.ts',
    sources: [${JSON.stringify(validSource)}],
    controlHints: { colorTokens: [undefined, 'ink'], componentSizeRem: (name: string) => (name === 'Badge' ? 0.75 : undefined) },
    labels: { generatedScenario: (prop: string, value: string | boolean) => \`\${prop} \${String(value)}\` },
  },
};
`
    );
    const { configuration } = loadPreviewContext(kitRoot);
    expect(configuration.controlHints?.colorTokens).toEqual([null, 'ink']);
    expect(configuration.controlHints?.componentSizeRem?.('Badge')).toBe(0.75);
    expect(configuration.labels?.generatedScenario?.('tone', 'loud')).toBe(
      'tone loud'
    );
  });

  it('reports an object inside itself as a cycle naming both places, and the same object twice as nothing', () => {
    const shared = { value: 'light', label: 'light' };
    const looped: Record<string, unknown> = { classes: ['frame'] };
    looped.children = [looped];
    expect(
      jsonProblems({ values: [shared, shared] }, 'preview.options[0]')
    ).toEqual([]);
    expect(jsonProblems(looped, 'preview.mount')).toEqual([
      "preview.mount.children[0] is preview.mount again, a cycle that can't be sent to the browser as JSON",
    ]);
  });

  it('records the kit modules a scaffold-ui-kit.ts imports', () => {
    const kitRoot = kitWith();
    writeFileSync(
      join(kitRoot, 'preview/prefix.ts'),
      "export const prefix = 'acme';\n"
    );
    writeFileSync(
      join(kitRoot, 'scaffold-ui-kit.ts'),
      `import { prefix } from './preview/prefix';
export default { name: 'acme', targets: ['react'], preview: { shell: 'preview/shell.ts', sources: [${JSON.stringify(validSource)}], canvas: { namePrefix: prefix } } };
`
    );
    const context = loadPreviewContext(kitRoot);
    expect(context.configuration.canvas).toEqual({ namePrefix: 'acme' });
    expect(
      context.configurationModules.map((module) => realpathSync(module))
    ).toEqual([realpathSync(join(kitRoot, 'preview/prefix.ts'))]);
  });

  it("resolves with the kit's own scaffold-ui-kit when it has the resolver, else with the preview's", () => {
    /** A kit with its own copy of scaffold-ui-kit, its entry `source`. */
    const kitWithScaffolder = (source: string): string => {
      const kitRoot = kitWith(withPreview({ sources: [validSource] }));
      const installed = join(kitRoot, 'node_modules/scaffold-ui-kit');
      mkdirSync(installed, { recursive: true });
      writeFileSync(
        join(installed, 'package.json'),
        JSON.stringify({ name: 'scaffold-ui-kit', main: 'index.js' })
      );
      writeFileSync(join(installed, 'index.js'), source);
      return kitRoot;
    };
    // An older copy, without the resolver: the preview's own reads the kit.
    expect(
      loadPreviewContext(kitWithScaffolder('exports.diagnoseKit = () => {};\n'))
        .kitName
    ).toBe('acme');
    const current = kitWithScaffolder(
      `const real = require(${JSON.stringify(createRequire(import.meta.url).resolve('scaffold-ui-kit'))});
exports.resolveKitConfiguration = (...parameters) => {
  const resolved = real.resolveKitConfiguration(...parameters);
  return { ...resolved, configuration: { ...resolved.configuration, name: 'the-kit-copy' } };
};
`
    );
    expect(loadPreviewContext(current).kitName).toBe('the-kit-copy');
  });

  it('reads the configuration --configuration names', () => {
    const kitRoot = kitWith(
      withPreview({ ...preview, canvas: { namePrefix: 'named' } }),
      'configuration/kit.json'
    );
    expect(() => loadPreviewContext(kitRoot)).toThrow(
      /No scaffold-ui-kit\.ts or scaffold-ui-kit\.json found/
    );
    const context = loadPreviewContext(kitRoot, {
      configuration: join(kitRoot, 'configuration/kit.json'),
    });
    expect(context.configurationPath).toBe(
      join(kitRoot, 'configuration/kit.json')
    );
    expect(context.configuration.canvas).toEqual({ namePrefix: 'named' });
  });
});

describe('loadPreviewContext - scaffold-ui-kit.config.json', () => {
  /** A kit configured in scaffold-ui-kit.config.json. */
  function oldNameKit(configuration: Record<string, unknown>): string {
    return kitWith(
      { name: 'acme', targets: ['react', 'vue', 'svelte'], ...configuration },
      'scaffold-ui-kit.config.json'
    );
  }

  it('reads a preview block there, with one warning naming the new file', () => {
    const context = loadPreviewContext(
      oldNameKit({
        preview: {
          shell: 'preview/shell.ts',
          sources: [validSource],
          port: 6300,
        },
      })
    );
    expect(context.configuration.port).toBe(6300);
    expect(context.warnings).toEqual([
      'scaffold-ui-kit.config.json: warning: the kit configuration is read under its old name, which stops being read in 3.0.0; rename it to scaffold-ui-kit.json, or write it as scaffold-ui-kit.ts with defineKit',
    ]);
  });

  it('keeps the warning a warning in check, under strict too', async () => {
    const kitRoot = oldNameKit({
      preview: { shell: 'preview/shell.ts', sources: [validSource] },
    });
    const { warnings } = loadPreviewContext(kitRoot);
    for (const strict of [false, true]) {
      const report = await checkPreview(kitRoot, { strict });
      expect(report.errors).toEqual([]);
      expect(report.warnings).toEqual(warnings);
    }
  });

  it('points preview settings under extensions to the preview block, an error under a new name', () => {
    const extensions = {
      preview: { shell: 'preview/shell.ts', sources: [validSource] },
    };
    // In scaffold-ui-kit.config.json an unknown top-level key is ignored,
    // with a warning, so the preview finds no block of its own.
    expect(() => loadPreviewContext(oldNameKit({ extensions }))).toThrow(
      "[preview] scaffold-ui-kit.config.json has no preview block; the preview's settings go in a top-level 'preview' block, not 'extensions'"
    );
    expect(() =>
      loadPreviewContext(
        kitWith({ name: 'acme', targets: ['react'], extensions })
      )
    ).toThrow(
      "unknown key 'extensions'; the preview's settings go in a top-level 'preview' block"
    );
  });
});
