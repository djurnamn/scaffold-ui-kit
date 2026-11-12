// Generation against a small kit on disk (fixtures/generate-kit, run from a
// temporary copy): what lands in `.preview-generated/` - the three target
// registries, the Svelte wrappers, the scratch stubs, the module-resolution
// data, the host manifest, and the copied theme - and the missing theme
// stylesheet that fails the run.

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadPreviewContext } from '../src/context';
import { generatePreview } from '../src/generate';
import type { Manifest } from '../src/emit/manifest';
import {
  resolveKitConfiguration,
  type KitConfiguration,
} from 'scaffold-ui-kit';
import { writeSourceKit } from './support/source-kit';

const fixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/generate-kit'
);
const temporaryRoots: string[] = [];

/** A fresh copy of the fixture kit. */
function copyFixture(): string {
  const kitRoot = mkdtempSync(join(tmpdir(), 'preview-generate-'));
  temporaryRoots.push(kitRoot);
  cpSync(fixture, kitRoot, { recursive: true });
  return kitRoot;
}

type Configured = KitConfiguration & { preview: Record<string, unknown> };

/** Changes a copy's kit configuration, rewriting it as scaffold-ui-kit.json. */
function reconfigure(
  kitRoot: string,
  change: (configuration: Configured) => void
): void {
  const { configuration } = resolveKitConfiguration(kitRoot);
  change(configuration as Configured);
  rmSync(join(kitRoot, 'scaffold-ui-kit.ts'));
  writeFileSync(
    join(kitRoot, 'scaffold-ui-kit.json'),
    JSON.stringify(configuration)
  );
}

let generatedRoot: string;
const read = (path: string): string =>
  readFileSync(join(generatedRoot, path), 'utf8');

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const context = loadPreviewContext(copyFixture());
  generatedRoot = context.generatedRoot;
  await generatePreview(context);
});

afterAll(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots)
    rmSync(root, { recursive: true, force: true });
});

describe('generatePreview - the generated tree', () => {
  it('writes a registry per target holding the browseable component only', () => {
    const react = read('react/registry.tsx');
    const vue = read('vue/registry.ts');
    const svelte = read('svelte/registry.ts');
    for (const registry of [react, vue, svelte]) {
      expect(registry).toContain('Badge');
      // A component that is not standalone is editor-only and an omitted part drops out entirely.
      expect(registry).not.toContain('BadgeDot');
      expect(registry).not.toContain('BadgeVisual');
    }
    expect(react).toContain("from 'acme/react'");
    expect(vue).toContain("from 'acme/vue'");
  });

  it('writes a Svelte wrapper per browseable component', () => {
    expect(existsSync(join(generatedRoot, 'svelte/Badge.render.svelte'))).toBe(
      true
    );
    expect(read('svelte/Badge.render.svelte')).toContain("from 'acme/svelte'");
    expect(
      existsSync(join(generatedRoot, 'svelte/BadgeDot.render.svelte'))
    ).toBe(false);
    expect(
      existsSync(join(generatedRoot, 'svelte/BadgeVisual.render.svelte'))
    ).toBe(false);
  });

  it('writes empty scratch registries so the previews resolve before an edit', () => {
    for (const file of ['scratch/vue.ts', 'scratch/registry.ts']) {
      expect(read(file)).toBe(
        'export const registry: Record<string, any> = {};\n'
      );
    }
    // The React page reads `declaredAttributes` beside the registry, so the
    // placeholder exports it too: a static build warns of no missing export.
    expect(read('scratch/react.tsx')).toBe(
      'export const registry: Record<string, any> = {};\n' +
        'export const declaredAttributes: Record<string, string[]> = {};\n'
    );
  });

  it('writes the module-resolution data the scratch endpoint reads', () => {
    expect(JSON.parse(read('modules.json'))).toEqual({
      defaultModule: 'acme',
      moduleByName: { Badge: 'acme', BadgeDot: 'acme', BadgeVisual: 'acme' },
      importOverrideByName: {},
      exportByName: {},
      targets: ['react', 'vue', 'svelte'],
    });
  });

  it('writes the manifest: kit name, sources, stories and the editor-only components, labels', () => {
    const manifest = JSON.parse(read('manifest.json')) as Manifest;
    expect(manifest.kitName).toBe('acme');
    expect(manifest.kitVersion).toBe('1.2.3');
    expect(manifest.sources).toEqual([
      { id: 'kit', label: 'Acme', order: 0, moduleBase: 'acme' },
    ]);
    // Every component's import, the omitted part's included, for the source
    // the browser prints.
    expect(manifest.imports).toEqual({
      Badge: {
        exportName: 'Badge',
        modules: {
          react: 'acme/react',
          vue: 'acme/vue',
          svelte: 'acme/svelte',
        },
      },
      BadgeDot: {
        exportName: 'BadgeDot',
        modules: {
          react: 'acme/react',
          vue: 'acme/vue',
          svelte: 'acme/svelte',
        },
      },
      BadgeVisual: {
        exportName: 'BadgeVisual',
        modules: {
          react: 'acme/react',
          vue: 'acme/vue',
          svelte: 'acme/svelte',
        },
      },
    });
    expect(manifest.colorOptions).toEqual(['ink', null]);
    expect(manifest.labels).toEqual({ emptyScenario: 'Bare' });
    // A kit that names no targets builds every target.
    expect(manifest.targets).toEqual(['react', 'vue', 'svelte']);

    expect(manifest.components.map((component) => component.name)).toEqual([
      'Badge',
      'BadgeDot',
    ]);
    const [badge, dot] = manifest.components;
    expect(badge).toMatchObject({
      title: 'Parts/Badge',
      category: 'Parts',
      source: 'kit',
    });
    expect(badge.standalone).toBeUndefined();
    expect(badge.slots).toEqual({ default: true, named: [] });
    expect(badge.propTypes).toEqual([
      {
        name: 'tone',
        control: 'select',
        options: ['calm', 'loud'],
        include: true,
        declaredType: "'calm' | 'loud'",
        required: false,
        declaredDefault: 'calm',
      },
    ]);
    expect(dot.standalone).toBe(false);
  });

  it('prints no html sources unless asked', () => {
    expect(existsSync(join(generatedRoot, 'public/html-source'))).toBe(false);
  });

  it("copies each theme's stylesheet and asset directory into the served tree", () => {
    expect(read('public/themes/light/theme.css')).toBe(
      readFileSync(join(fixture, 'themes/light.css'), 'utf8')
    );
    expect(read('public/themes/light/fonts/body.woff2')).toBe('font\n');
  });
});

describe('generatePreview - a kit without a package.json', () => {
  it('writes a manifest with no kit version', async () => {
    const kitRoot = copyFixture();
    rmSync(join(kitRoot, 'package.json'));
    const context = loadPreviewContext(kitRoot);
    await generatePreview(context);
    const manifest = JSON.parse(
      readFileSync(join(context.generatedRoot, 'manifest.json'), 'utf8')
    ) as Manifest;
    expect(manifest.kitName).toBe('acme');
    expect('kitVersion' in manifest).toBe(false);
  });
});

describe('generatePreview - the kit settings', () => {
  it('writes the persistence setting into the manifest, url by default, and no pane widths unless the block gives them', async () => {
    expect((JSON.parse(read('manifest.json')) as Manifest).persistence).toBe(
      'url'
    );
    expect(
      'paneWidths' in (JSON.parse(read('manifest.json')) as Manifest)
    ).toBe(false);
    const kitRoot = copyFixture();
    reconfigure(kitRoot, (configuration) => {
      configuration.preview.persistence = 'url-and-local-storage';
    });
    const context = loadPreviewContext(kitRoot);
    await generatePreview(context);
    const manifest = JSON.parse(
      readFileSync(join(context.generatedRoot, 'manifest.json'), 'utf8')
    ) as Manifest;
    expect(manifest.persistence).toBe('url-and-local-storage');
    expect('paneWidths' in manifest).toBe(false);
  });

  /** Generate a fresh copy of the fixture kit, its preview block changed
   *  first; the manifest it writes. */
  async function generateWith(
    preview: Record<string, unknown>
  ): Promise<Manifest> {
    const kitRoot = copyFixture();
    reconfigure(kitRoot, (configuration) => {
      Object.assign(configuration.preview, preview);
    });
    const context = loadPreviewContext(kitRoot);
    await generatePreview(context);
    return JSON.parse(
      readFileSync(join(context.generatedRoot, 'manifest.json'), 'utf8')
    ) as Manifest;
  }

  it('writes the landing entry into the manifest, and none by default', async () => {
    expect('landing' in (JSON.parse(read('manifest.json')) as Manifest)).toBe(
      false
    );
    const badge = (
      JSON.parse(read('manifest.json')) as Manifest
    ).components.find((component) => component.name === 'Badge')!;
    expect(
      (await generateWith({ landing: { view: 'foundations' } })).landing
    ).toEqual({
      view: 'foundations',
    });
    const scenario = badge.scenarios[0]?.id ?? 'empty';
    expect(
      (await generateWith({ landing: { component: badge.id, scenario } }))
        .landing
    ).toEqual({ component: badge.id, scenario });
  });

  it('fails on a landing story or scenario the kit has none of', async () => {
    const badge = (
      JSON.parse(read('manifest.json')) as Manifest
    ).components.find((component) => component.name === 'Badge')!;
    await expect(
      generateWith({ landing: { component: 'parts-missing' } })
    ).rejects.toThrow(
      "[preview] preview.landing names component 'parts-missing', which has no story"
    );
    // A component that is not standalone has no story either.
    const editorOnly = (
      JSON.parse(read('manifest.json')) as Manifest
    ).components.find((component) => component.standalone === false)!;
    await expect(
      generateWith({ landing: { component: editorOnly.id } })
    ).rejects.toThrow(`names component '${editorOnly.id}', which has no story`);
    await expect(
      generateWith({ landing: { component: badge.id, scenario: 'nope' } })
    ).rejects.toThrow(
      `[preview] preview.landing names scenario 'nope' of '${badge.id}', which has the scenarios`
    );
  });

  it("writes the block's pane widths into the manifest, an empty list too", async () => {
    const paneWidths = [
      { label: 'sm', width: 640 },
      { label: 'md', width: 1024 },
    ];
    expect((await generateWith({ paneWidths })).paneWidths).toEqual(paneWidths);
    expect((await generateWith({ paneWidths: [] })).paneWidths).toEqual([]);
  });

  it('fails on unsound pane widths, naming the key', async () => {
    await expect(
      generateWith({ paneWidths: [{ label: 'sm', width: 0 }] })
    ).rejects.toThrow(
      /preview\.paneWidths must be a list of \{ label, width \}/
    );
    await expect(
      generateWith({
        paneWidths: [
          { label: 'sm', width: 640 },
          { label: 'sm', width: 720 },
        ],
      })
    ).rejects.toThrow('preview.paneWidths must not name a label twice');
  });

  it('fails on unsound preview options, naming each problem', async () => {
    const kitRoot = copyFixture();
    reconfigure(kitRoot, (configuration) => {
      // Unsound on purpose, so not a PreviewOption.
      (configuration.preview as Record<string, unknown>).options = [
        {
          id: 'box',
          label: 'box',
          control: 'toggle',
          default: 'on',
          scope: 'story',
          apply: { type: 'class', className: 'is-boxed' },
        },
      ];
    });
    await expect(generatePreview(loadPreviewContext(kitRoot))).rejects.toThrow(
      [
        `[preview] ${join(kitRoot, 'scaffold-ui-kit.json')} gives unsound preview.options:`,
        "  preview.options[0] ('box'): control is not an option field - an option with values is a choice, one with a boolean default a boolean",
        "  preview.options[0] ('box'): an option without values is a boolean and needs a boolean default; a choice lists its values",
      ].join('\n')
    );
  });
});

describe('generatePreview - the kit targets', () => {
  let kitGenRoot: string;
  const readKit = (path: string): string =>
    readFileSync(join(kitGenRoot, path), 'utf8');

  beforeAll(async () => {
    const kitRoot = copyFixture();
    // `html` is a kit target with a pane of its own, after the targets'.
    reconfigure(kitRoot, (configuration) => {
      configuration.targets = ['html', 'vue', 'react'];
    });
    const context = loadPreviewContext(kitRoot);
    expect(context.targets).toEqual(['react', 'vue']);
    expect(context.buildsHtml).toBe(true);
    kitGenRoot = context.generatedRoot;
    await generatePreview(context);
  });

  it('lists the kit targets and html in the manifest and narrows each story to the targets', () => {
    const manifest = JSON.parse(readKit('manifest.json')) as Manifest;
    expect(manifest.targets).toEqual(['react', 'vue', 'html']);
    for (const component of manifest.components) {
      expect(component.targets).toEqual(['react', 'vue']);
    }
    expect(JSON.parse(readKit('modules.json')).targets).toEqual([
      'react',
      'vue',
    ]);
  });

  it('writes an empty registry and no wrappers for a target the kit does not build', () => {
    expect(readKit('react/registry.tsx')).toContain("from 'acme/react'");
    expect(readKit('vue/registry.ts')).toContain("from 'acme/vue'");
    const svelte = readKit('svelte/registry.ts');
    expect(svelte).not.toContain('acme/svelte');
    expect(svelte).not.toContain('Badge');
    expect(svelte).toContain('export const registry');
    expect(existsSync(join(kitGenRoot, 'svelte/Badge.render.svelte'))).toBe(
      false
    );
  });

  it('keeps the scratch registry of a target the kit does not build empty', async () => {
    const { writeScratch } = await import('../src/emit/scratch');
    writeScratch(
      { rootComponent: 'Badge', props: {}, slots: undefined },
      kitGenRoot
    );
    expect(readKit('scratch/react.tsx')).toContain("from 'acme/react'");
    expect(readKit('scratch/vue.ts')).toContain("from 'acme/vue'");
    expect(readKit('scratch/registry.ts')).toBe(
      'export const registry: Record<string, any> = {};\n'
    );
  });
});

describe('generatePreview - themes', () => {
  it('fails naming the theme when its stylesheet is missing', async () => {
    const kitRoot = copyFixture();
    rmSync(join(kitRoot, 'themes/light.css'));
    await expect(generatePreview(loadPreviewContext(kitRoot))).rejects.toThrow(
      `theme 'light' stylesheet not found: ${join(kitRoot, 'themes/light.css')}`
    );
  });
});

describe('generatePreview - html sources', () => {
  it("prints each story's scenarios as html, one file per component, for the static build", async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context, { htmlSources: true });
    const directory = join(context.generatedRoot, 'public/html-source');
    // A story's file holds its anonymous default and every scenario, by id.
    expect(
      JSON.parse(readFileSync(join(directory, 'parts-badge.json'), 'utf8'))
    ).toEqual({
      '': { markup: '<span>Badge</span>\n' },
      'tone-loud': { markup: '<span>Badge</span>\n' },
    });
    // A component that is not standalone and an omitted part have no story, so no file.
    expect(existsSync(join(directory, 'parts-badgedot.json'))).toBe(false);
    expect(existsSync(join(directory, 'parts-badgevisual.json'))).toBe(false);
  });
});

describe('generatePreview - html warnings', () => {
  it('stores what the html leaves out at rest with each scenario, and prints it once per story', async () => {
    const kitRoot = mkdtempSync(join(tmpdir(), 'preview-generate-warnings-'));
    temporaryRoots.push(kitRoot);
    writeSourceKit(kitRoot);
    const context = loadPreviewContext(kitRoot);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await generatePreview(context, { htmlSources: true });
    // Two for one reason are one warning counting them.
    const warnings = [
      'Disclosure: could not evaluate 2 expressions (isOpen is not defined)',
    ];
    const stored = JSON.parse(
      readFileSync(
        join(
          context.generatedRoot,
          'public/html-source/components-disclosure.json'
        ),
        'utf8'
      )
    ) as Record<string, { warnings?: string[] }>;
    expect(Object.keys(stored)).toEqual(['', 'other']);
    for (const response of Object.values(stored))
      expect(response.warnings).toEqual(warnings);
    const printed = warn.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('Disclosure'));
    expect(printed).toEqual([
      [
        "[preview:generate] Disclosure's html leaves out what it cannot evaluate at rest:",
        '  could not evaluate 2 expressions (isOpen is not defined)',
      ].join('\n'),
    ]);
    // A story whose html leaves nothing out stores no warnings.
    expect(
      JSON.parse(
        readFileSync(
          join(
            context.generatedRoot,
            'public/html-source/components-badge.json'
          ),
          'utf8'
        )
      )['']
    ).not.toHaveProperty('warnings');
    warn.mockRestore();
  });
});

describe('generatePreview - @scaffold-ui-kit/helpers at rest', () => {
  it('evaluates an expression calling a helper when the kit has the package', async () => {
    const kitRoot = mkdtempSync(join(tmpdir(), 'preview-generate-helpers-'));
    temporaryRoots.push(kitRoot);
    writeSourceKit(kitRoot);
    mkdirSync(join(kitRoot, 'node_modules/@scaffold-ui-kit'), {
      recursive: true,
    });
    symlinkSync(
      fileURLToPath(new URL('../../helpers', import.meta.url)),
      join(kitRoot, 'node_modules/@scaffold-ui-kit/helpers'),
      'dir'
    );
    writeFileSync(
      join(kitRoot, 'src/components/summary.ts'),
      `export default { type: 'component', name: 'Summary', children: [{ type: 'element', tag: 'div', attributes: { class: 'Summary', 'data-given': { $expression: "consumerClass({ class: 'given' })" } }, children: [{ type: 'text', content: 'Summary' }] }] };\n`
    );
    const context = loadPreviewContext(kitRoot);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await generatePreview(context, { htmlSources: true });
    const printed = warn.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('Summary'));
    warn.mockRestore();
    const stored = JSON.parse(
      readFileSync(
        join(
          context.generatedRoot,
          'public/html-source/components-summary.json'
        ),
        'utf8'
      )
    ) as Record<string, { markup: string; warnings?: string[] }>;
    expect(stored[''].markup).toBe(
      '<div class="Summary" data-given="given">Summary</div>\n'
    );
    expect(stored[''].warnings).toBeUndefined();
    expect(printed).toEqual([]);
  });
});

describe('generatePreview - an unfilled default slot', () => {
  it("prints the html the panes render, the component's name in the slot as the target panes show it", async () => {
    const kitRoot = mkdtempSync(join(tmpdir(), 'preview-generate-unfilled-'));
    temporaryRoots.push(kitRoot);
    writeSourceKit(kitRoot);
    writeFileSync(
      join(kitRoot, 'src/components/summary.ts'),
      `export default { type: 'component', name: 'Summary', children: [{ type: 'element', tag: 'div', attributes: { class: 'Summary' }, children: [{ type: 'slot' }] }] };\n`
    );
    const context = loadPreviewContext(kitRoot);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await generatePreview(context, { htmlSources: true });
    warn.mockRestore();
    const stored = JSON.parse(
      readFileSync(
        join(
          context.generatedRoot,
          'public/html-source/components-summary.json'
        ),
        'utf8'
      )
    ) as Record<string, { markup: string }>;
    expect(stored[''].markup).toBe('<div class="Summary">Summary</div>\n');
  });
});
