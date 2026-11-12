// A kit built into one package per target beside a styles package
// (the kit configuration's `packages`): the preview imports each target from
// its package, compiles Sass with each package's importer, reads shared
// layers lying in the styles package, and checks the layout.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkPreview } from '../src/check';
import { loadPreviewContext } from '../src/context';
import { moduleOfSource } from '../src/lib/module-of-source';
import { kitImporters } from '../src/sass-importers';
import { buildViteConfiguration } from '../src/vite-configuration';

describe('moduleOfSource', () => {
  it('puts the target below a moduleBase without the token', () => {
    expect(moduleOfSource('my-ui-kit', 'react')).toBe('my-ui-kit/react');
    expect(moduleOfSource('@acme/kit', 'vue')).toBe('@acme/kit/vue');
  });

  it('replaces the token with the target', () => {
    expect(moduleOfSource('@acme/{target}', 'react')).toBe('@acme/react');
    expect(moduleOfSource('acme-{target}', 'svelte')).toBe('acme-svelte');
    expect(moduleOfSource('{target}-ui', 'vue')).toBe('vue-ui');
  });
});

describe('a kit built into one package per target', () => {
  let parent: string;
  const kitRoot = () => join(parent, 'core');
  const put = (path: string, content: string) => {
    mkdirSync(dirname(join(parent, path)), { recursive: true });
    writeFileSync(join(parent, path), content);
  };
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  const installed = (name: string) =>
    put(`node_modules/${name}/package.json`, json({ name }));

  function configure(
    moduleBase: string,
    extra: Record<string, unknown> = {}
  ): void {
    put(
      'core/scaffold-ui-kit.json',
      json({
        name: 'acme',
        targets: ['react', 'vue'],
        styling: [],
        stylesheetPlacement: 'separate-file',
        stylesheetLink: 'none',
        packages: {
          react: { name: '@acme/react', directory: '../react' },
          vue: { name: '@acme/vue', directory: '../vue' },
          styles: { name: '@acme/styles', directory: '../styles' },
        },
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase,
              templatesDirectory: 'src/components',
            },
          ],
        },
        ...extra,
      })
    );
  }

  /** The check's errors about how the preview imports the kit's packages. */
  async function layoutErrors(): Promise<string[]> {
    const report = await checkPreview(kitRoot());
    return report.errors.filter(
      (line) =>
        line.includes('moduleBase') ||
        line.includes('does not resolve') ||
        line.includes('add.shared')
    );
  }

  beforeAll(() => {
    parent = mkdtempSync(join(tmpdir(), 'preview-kit-packages-'));
  });

  beforeEach(() => {
    rmSync(parent, { recursive: true, force: true });
    put('core/package.json', json({ name: '@acme/core', version: '1.0.0' }));
    put('core/preview/shell.ts', 'export {};\n');
    put(
      'core/src/components/probe.ts',
      `export default { type: 'component', name: 'Probe', children: [{ type: 'element', tag: 'span' }] };\n`
    );
    put(
      'styles/package.json',
      json({
        name: '@acme/styles',
        version: '1.0.0',
        exports: { './styles/*': './src/styles/*.scss' },
      })
    );
    put('styles/src/styles/tokens.scss', '$space: 4px;\n');
    for (const name of ['@acme/react', '@acme/vue', '@acme/styles'])
      installed(name);
  });

  afterAll(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  it('reads the packages into the context, each directory resolved against the kit root', () => {
    configure('@acme/{target}');
    const context = loadPreviewContext(kitRoot());
    expect(context.kitPackages).toEqual([
      {
        role: 'styles',
        name: '@acme/styles',
        directoryAbsolute: join(parent, 'styles'),
      },
      {
        role: 'react',
        name: '@acme/react',
        directoryAbsolute: join(parent, 'react'),
      },
      {
        role: 'vue',
        name: '@acme/vue',
        directoryAbsolute: join(parent, 'vue'),
      },
    ]);
  });

  it('serves each package and leaves it out of the pre-bundle', () => {
    configure('@acme/{target}');
    const configuration = buildViteConfiguration(loadPreviewContext(kitRoot()));
    expect(configuration.server?.fs?.allow).toEqual(
      expect.arrayContaining([
        join(parent, 'styles'),
        join(parent, 'react'),
        join(parent, 'vue'),
      ])
    );
    expect(configuration.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining(['@acme/styles', '@acme/react', '@acme/vue'])
    );
  });

  it("gives a shared module in the styles package that package's specifier, its source as written", () => {
    configure('@acme/{target}', {
      add: { shared: [{ source: '../styles/src/styles' }] },
    });
    const context = loadPreviewContext(kitRoot());
    expect(context.sharedSpecifiers).toEqual([
      { source: '../styles/src/styles', specifier: '@acme/styles/styles' },
    ]);
  });

  it("resolves each package's own pkg: URLs through its exports", () => {
    const importers = kitImporters(kitRoot(), [join(parent, 'styles')]);
    const urls = importers.map((importer) =>
      importer.findFileUrl('pkg:@acme/styles/styles/tokens')
    );
    expect(urls[0]).toBeNull();
    expect(urls[1] && fileURLToPath(urls[1])).toBe(
      join(parent, 'styles/src/styles/tokens.scss')
    );
  });

  it('accepts a moduleBase whose token yields each target package', async () => {
    configure('@acme/{target}');
    expect(await layoutErrors()).toEqual([]);
  });

  it('reports a moduleBase naming the kit, with the token form that yields the packages', async () => {
    configure('@acme/core');
    expect(await layoutErrors()).toEqual([
      "source 'kit': moduleBase '@acme/core' imports '@acme/core/react', but the react target is built into '@acme/react'; set moduleBase to '@acme/{target}'",
    ]);
    configure('acme');
    expect(await layoutErrors()).toEqual([
      "source 'kit': moduleBase 'acme' imports 'acme/react', but the react target is built into '@acme/react'; set moduleBase to '@acme/{target}'",
    ]);
  });

  it('says to name the packages so one pattern covers them when none does', async () => {
    configure('@acme/{target}', {
      packages: {
        react: { name: '@acme/react', directory: '../react' },
        vue: { name: 'acme-vue', directory: '../vue' },
        styles: { name: '@acme/styles', directory: '../styles' },
      },
    });
    installed('acme-vue');
    expect(await layoutErrors()).toEqual([
      "source 'kit': moduleBase '@acme/{target}' imports '@acme/vue', but the vue target is built into 'acme-vue'; name the per-target packages so one pattern with '{target}' covers them all (such as 'acme-{target}'), and set moduleBase to it",
    ]);
  });

  it('reports a package that does not resolve from the kit root', async () => {
    configure('@acme/{target}');
    rmSync(join(parent, 'node_modules/@acme/vue'), {
      recursive: true,
      force: true,
    });
    expect(await layoutErrors()).toEqual([
      "packages.vue: '@acme/vue' does not resolve from the kit root, so the preview cannot import it; add it to the kit's workspace or as a dev dependency of the kit root",
    ]);
  });

  it("checks a shared specifier against the styles package's exports", async () => {
    configure('@acme/{target}', {
      add: {
        shared: [
          { source: '../styles/src/mixins', specifier: '@acme/styles/mixins' },
        ],
      },
    });
    put('styles/src/mixins/index.ts', '');
    expect(await layoutErrors()).toEqual([
      `${join(parent, 'styles/package.json')}: add.shared gives '../styles/src/mixins' the specifier '@acme/styles/mixins', but the styles package's exports has no './mixins' entry, so the preview and the kit's consumers cannot import it; add one, such as "./mixins": "./src/mixins/index.ts"`,
    ]);
  });
});
