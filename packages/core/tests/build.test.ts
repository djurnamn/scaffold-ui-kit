import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCommand, diagnoseKit } from '../src/commands/build';
import type { TargetName } from '../src/configuration';
import { scaffoldKit } from '../src/scaffold';

// Kits are scaffolded inside the package directory (not the OS tmpdir) so
// the example templates' `@js-template-engine/types` import resolves
// through the workspace's node_modules when jiti loads them.
const packageDirectory = join(__dirname, '..');

let parentDirectory: string;
let kitDirectory: string;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  parentDirectory = mkdtempSync(join(packageDirectory, '.test-build-'));
  scaffoldKit({
    projectName: 'built-kit',
    parentDirectory,
    targets: ['react', 'vue', 'svelte', 'html'],
    styling: ['bem', 'tailwind'],
    includeExamples: true,
    // JSON, so a test can rewrite the configuration it builds with.
    configurationFile: 'scaffold-ui-kit.json',
  });
  kitDirectory = join(parentDirectory, 'built-kit');
  // The tests build this Tailwind kit with stylesheets, so its components
  // carry style blocks, those of the examples of a kit without Tailwind, and
  // it publishes them.
  for (const example of ['button.ts', 'card.ts']) {
    copyFileSync(
      join(packageDirectory, 'assets', 'components', example),
      join(kitDirectory, 'src', 'components', example)
    );
  }
  const packagePath = join(kitDirectory, 'package.json');
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  manifest.exports = {
    ...manifest.exports,
    './react/*.css': './dist/react/*.css',
    './stylesheets/*.css': './dist/stylesheets/*.css',
  };
  writeFileSync(packagePath, JSON.stringify(manifest, null, 2));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(parentDirectory, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('a freshly scaffolded kit', () => {
  /** The files one `exports` target leads to, relative to the kit root. */
  const filesOfExport = (directory: string, target: string): string[] => {
    if (!target.includes('*')) {
      return existsSync(join(directory, target)) ? [target] : [];
    }
    const [before, after] = target.split('*');
    const walk = (current: string): string[] =>
      readdirSync(join(directory, current), { withFileTypes: true }).flatMap(
        (entry) =>
          entry.isDirectory()
            ? walk(`${current}/${entry.name}`)
            : [`${current}/${entry.name}`]
      );
    return walk('./dist').filter(
      (file) => file.startsWith(before) && file.endsWith(after)
    );
  };

  it.each([
    [['react', 'vue', 'svelte', 'html'], ['bem']],
    [['react', 'vue', 'svelte', 'html'], []],
    [['react'], ['bem']],
    [['vue'], []],
    [['svelte'], ['bem']],
    [['html'], ['bem']],
    [['react', 'vue', 'svelte', 'html'], ['tailwind']],
    [['react'], ['bem', 'tailwind']],
  ] as const)(
    'builds %j styled %j without a warning, its exports all leading to files',
    async (targets, styling) => {
      scaffoldKit({
        projectName: 'fresh-kit',
        parentDirectory,
        targets: [...targets],
        styling: [...styling],
        includeExamples: true,
        includePreview: false,
        configurationFile: 'scaffold-ui-kit.json',
      });
      const directory = join(parentDirectory, 'fresh-kit');
      vi.mocked(console.error).mockClear();
      await buildCommand(directory);
      expect(vi.mocked(console.error).mock.calls).toEqual([]);
      expect(process.exitCode).toBeUndefined();
      const { exports: kitExports = {} } = JSON.parse(
        readFileSync(join(directory, 'package.json'), 'utf8')
      ) as { exports?: Record<string, string> };
      const dangling = Object.entries(kitExports).filter(
        ([, target]) => filesOfExport(directory, target).length === 0
      );
      expect(dangling).toEqual([]);
    }
  );
});

describe('the example components of a kit styled with Tailwind', () => {
  it.each([
    [['react', 'vue', 'svelte', 'html'], ['tailwind']],
    [
      ['react', 'vue', 'svelte'],
      ['bem', 'tailwind'],
    ],
  ] as const)(
    'build for %j styled %j with no style block in any component',
    async (targets, styling) => {
      scaffoldKit({
        projectName: 'fresh-kit',
        parentDirectory,
        targets: [...targets],
        styling: [...styling],
        includeExamples: true,
        includePreview: false,
        configurationFile: 'scaffold-ui-kit.json',
      });
      const directory = join(parentDirectory, 'fresh-kit');
      vi.mocked(console.error).mockClear();
      await buildCommand(directory);
      expect(vi.mocked(console.error).mock.calls).toEqual([]);
      expect(process.exitCode).toBeUndefined();
      const componentFiles: Array<[string, string]> = [
        ['react', 'Button.tsx'],
        ['react', 'Card.tsx'],
        ['vue', 'Button.vue'],
        ['vue', 'Card.vue'],
        ['svelte', 'Button.svelte'],
        ['svelte', 'Card.svelte'],
      ];
      for (const [target, file] of componentFiles) {
        const emitted = readFileSync(
          join(directory, 'dist', target, file),
          'utf8'
        );
        expect(emitted).not.toContain('<style');
      }
      expect(
        readFileSync(join(directory, 'dist', 'react', 'Button.tsx'), 'utf8')
      ).toContain('px-4');
    }
  );
});

describe('buildCommand', () => {
  it('renders every template for every configured target', async () => {
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    const expectations: Array<[string, string]> = [
      [join('react', 'Button.tsx'), 'export function Button'],
      [join('react', 'Card.tsx'), 'export function Card'],
      [join('vue', 'Button.vue'), '<script setup lang="ts">'],
      [join('vue', 'Card.vue'), '<slot>'],
      [join('svelte', 'Button.svelte'), "export let label: string = 'Button';"],
      [join('svelte', 'Card.svelte'), '<slot>'],
      [join('html', 'Button.html'), '<button'],
      [join('html', 'Card.html'), '<article'],
    ];
    for (const [file, marker] of expectations) {
      const filePath = join(kitDirectory, 'dist', file);
      expect(existsSync(filePath), file).toBe(true);
      expect(readFileSync(filePath, 'utf8'), file).toContain(marker);
    }
  });

  it('applies the configured styling extensions in order', async () => {
    await buildCommand(kitDirectory);
    const button = readFileSync(
      join(kitDirectory, 'dist', 'react', 'Button.tsx'),
      'utf8'
    );
    expect(button).toContain('button rounded px-4 py-2');
  });

  it('accepts the deprecated scripting keys with one warning and writes no script', async () => {
    writeFileSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      JSON.stringify({
        name: 'built-kit',
        targets: ['react', 'html'],
        styling: ['bem'],
        scriptingStrategy: 'separate-file',
        scriptingLanguage: 'typescript',
      })
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const warnings = vi
      .mocked(console.error)
      .mock.calls.filter(([message]) =>
        String(message).includes('scriptingStrategy')
      );
    expect(warnings).toHaveLength(1);
    expect(existsSync(join(kitDirectory, 'dist', 'html', 'Button.ts'))).toBe(
      false
    );
    expect(
      readFileSync(join(kitDirectory, 'dist', 'html', 'Button.html'), 'utf8')
    ).not.toContain('<script');
  });

  it('converts Tailwind utilities to styles under tailwind.output: styles', async () => {
    writeFileSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      JSON.stringify({
        name: 'built-kit',
        targets: ['react', 'html'],
        styling: ['bem', 'tailwind'],
        tailwind: { output: 'styles' },
      })
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    // The utility classes no longer ride along on the element...
    const button = readFileSync(
      join(kitDirectory, 'dist', 'react', 'Button.tsx'),
      'utf8'
    );
    expect(button).not.toContain('rounded px-4 py-2');

    // ...they have become plain CSS instead (px-4 → padding-inline: 1rem).
    const html = readFileSync(
      join(kitDirectory, 'dist', 'html', 'Button.html'),
      'utf8'
    );
    expect(html).toContain('padding-inline: 1rem');
  });

  it('emits unlinked, layered stylesheets under stylesheetLink and stylingLayer', async () => {
    writeFileSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      JSON.stringify({
        name: 'built-kit',
        targets: ['react', 'vue', 'svelte', 'html'],
        styling: ['bem'],
        stylesheetPlacement: 'separate-file',
        stylesheetLink: 'none',
        stylingLayer: {
          name: 'kit.components',
          order: ['kit.base', 'kit.components'],
        },
      })
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    for (const [component, stylesheet] of [
      [join('react', 'Button.tsx'), join('react', 'Button.css')],
      [join('vue', 'Button.vue'), join('vue', 'Button.css')],
      [join('svelte', 'Button.svelte'), join('svelte', 'Button.css')],
      [join('html', 'Button.html'), join('html', 'Button.css')],
    ]) {
      const componentContent = readFileSync(
        join(kitDirectory, 'dist', component),
        'utf8'
      );
      expect(componentContent).not.toContain('Button.css');
      const stylesheetContent = readFileSync(
        join(kitDirectory, 'dist', stylesheet),
        'utf8'
      );
      expect(stylesheetContent).toContain('@layer kit.base, kit.components;');
      expect(stylesheetContent).toContain('@layer kit.components {');
    }
  });

  describe("stylesheetLink: 'both'", () => {
    const configureBoth = (extra: Record<string, unknown> = {}): void => {
      writeFileSync(
        join(kitDirectory, 'scaffold-ui-kit.json'),
        JSON.stringify({
          name: 'built-kit',
          targets: ['react', 'vue', 'svelte', 'html'],
          styling: [],
          stylesheetPlacement: 'separate-file',
          stylingLanguage: 'scss',
          stylesheetLink: 'both',
          ...extra,
        })
      );
      // A template whose stylesheet needs the kit's load paths to compile.
      mkdirSync(join(kitDirectory, 'src', 'styles'), { recursive: true });
      writeFileSync(
        join(kitDirectory, 'src', 'styles', '_tokens.scss'),
        '$chip-gap: 4px;\n'
      );
      writeFileSync(
        join(kitDirectory, 'src', 'components', 'chip.ts'),
        [
          'export default {',
          "  type: 'component',",
          "  name: 'Chip',",
          `  style: '@use "styles/tokens" as *;',`,
          '  children: [',
          "    { type: 'element', tag: 'span', attributes: { class: ['chip'], style: { gap: '$chip-gap' } } },",
          '  ],',
          '};',
          '',
        ].join('\n')
      );
      // A driver composing both, whose linked module must link both sheets.
      const driverDirectory = join(kitDirectory, 'src', 'drivers', 'react');
      mkdirSync(driverDirectory, { recursive: true });
      writeFileSync(
        join(driverDirectory, 'Fancy.tsx'),
        "import { Button } from './Button';\nimport { Chip } from './Chip';\n\nexport function Fancy() {}\n"
      );
    };
    const built = (...segments: string[]): string =>
      readFileSync(join(kitDirectory, 'dist', ...segments), 'utf8');

    it("keeps a failed component's entries in both barrels and _index.scss", async () => {
      configureBoth({ loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      expect(built('react', '_index.scss')).toContain('@use "./Chip"');

      // Chip's template now fails validation.
      const componentsDirectory = join(kitDirectory, 'src', 'components');
      rmSync(join(componentsDirectory, 'chip.ts'));
      writeFileSync(
        join(componentsDirectory, 'chip.json'),
        JSON.stringify({ type: 'nonsense' })
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(built('react', '_index.scss')).toContain('@use "./Button"');
      expect(built('react', '_index.scss')).toContain('@use "./Chip"');
      expect(built('react', 'index.ts')).toContain("from './linked/Chip'");
      expect(built('react', 'unlinked', 'index.ts')).toContain(
        "export * from '../Chip';"
      );
    });

    it("drops a failed component's _index.scss entry once its sheet is gone", async () => {
      configureBoth({ loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      const componentsDirectory = join(kitDirectory, 'src', 'components');
      rmSync(join(componentsDirectory, 'chip.ts'));
      writeFileSync(
        join(componentsDirectory, 'chip.json'),
        JSON.stringify({ type: 'nonsense' })
      );
      rmSync(join(kitDirectory, 'dist', 'react', 'Chip.scss'));
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(built('react', '_index.scss')).toContain('@use "./Button"');
      expect(built('react', '_index.scss')).not.toContain('Chip');
      // The module is still there, so the barrels keep it.
      expect(built('react', 'unlinked', 'index.ts')).toContain(
        "export * from '../Chip';"
      );
    });

    it('renders the components once, unlinked', async () => {
      configureBoth({ loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      expect(built('react', 'Button.tsx')).not.toContain('Button.scss');
      expect(built('vue', 'Button.vue')).not.toContain('<style');
      expect(built('svelte', 'Button.svelte')).not.toContain('Button.scss');
      expect(built('react', 'Button.scss')).toContain('.button');
      expect(existsSync(join(kitDirectory, 'dist', 'html', 'linked'))).toBe(
        false
      );
    });

    it('links each html page to its compiled stylesheet, which a browser can load', async () => {
      configureBoth({ loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      const page = built('html', 'Button.html');
      expect(
        page.startsWith(
          '<link rel="stylesheet" href="../stylesheets/Button.css">\n\n'
        )
      ).toBe(true);
      expect(page).not.toContain('Button.scss');
      // The html sheet compiles to the scripted targets' CSS, so it shares their copy.
      expect(built('html', 'Chip.html')).toMatch(
        /^<link rel="stylesheet" href="\.\.\/stylesheets\/Chip\.css">\n\n/
      );
    });

    it("writes an index of each target's SCSS sheets that a kit stylesheet can take whole", async () => {
      configureBoth({ loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      for (const target of ['react', 'vue', 'svelte', 'html']) {
        expect(built(target, '_index.scss')).toContain(
          '@use "./Button" as button;\n@use "./Card" as card;\n@use "./Chip" as chip;\n'
        );
      }
      // `@use` of the target directory resolves to its index and compiles every sheet.
      const sass = await import('sass');
      const { css } = sass.compileString('@use "dist/react";', {
        loadPaths: [kitDirectory, join(kitDirectory, 'src')],
      });
      expect(css).toContain('.button');
      expect(css).toContain('.chip');
    });

    it('states the layer order first in every compiled sheet, ahead of what a loaded module emits', async () => {
      configureBoth({
        loadPaths: ['src'],
        stylingLayer: {
          name: 'kit.components',
          order: ['kit.base', 'kit.components'],
        },
      });
      // A loaded module that emits a rule inside one of the kit's layers.
      writeFileSync(
        join(kitDirectory, 'src', 'styles', '_tokens.scss'),
        '$chip-gap: 4px;\n@layer kit.components { .chip-base { margin: 0; } }\n'
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      const compiledDirectory = join(kitDirectory, 'dist', 'stylesheets');
      const sheets = readdirSync(compiledDirectory).filter((file) =>
        file.endsWith('.css')
      );
      expect(sheets).toContain('Chip.css');
      for (const sheet of sheets) {
        const css = readFileSync(join(compiledDirectory, sheet), 'utf8');
        expect(css.startsWith('@layer kit.base, kit.components;'), sheet).toBe(
          true
        );
        expect(
          css.split('@layer kit.base, kit.components;'),
          sheet
        ).toHaveLength(2);
      }
      const chip = readFileSync(join(compiledDirectory, 'Chip.css'), 'utf8');
      expect(chip).toContain('.chip-base{margin:0}');
    });

    it("writes the layer order module beside each target's sheets, which load it first", async () => {
      configureBoth({
        loadPaths: ['src'],
        stylingLayer: {
          name: 'kit.components',
          order: ['kit.base', 'kit.components'],
        },
      });
      writeFileSync(
        join(kitDirectory, 'src', 'styles', '_tokens.scss'),
        '$chip-gap: 4px;\n@layer kit.components { .chip-base { margin: 0; } }\n'
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      for (const target of ['react', 'vue', 'svelte', 'html']) {
        expect(built(target, '_layer-order.scss'), target).toBe(
          '@layer kit.base, kit.components;\n'
        );
        const sheet = built(target, 'Chip.scss');
        expect(sheet.startsWith("@use './layer-order' as *;\n"), target).toBe(
          true
        );
        expect(sheet, target).not.toContain('@layer kit.base, kit.components;');
        expect(built(target, '_index.scss'), target).not.toContain(
          'layer-order'
        );
      }
      const manifest = JSON.parse(
        readFileSync(
          join(kitDirectory, 'dist', 'scaffold-ui-kit-manifest.json'),
          'utf8'
        )
      );
      expect(manifest.stylingLayer).toMatchObject({
        name: 'kit.components',
        order: ['kit.base', 'kit.components'],
      });
      // One per target, published where the package's exports reach it.
      expect(manifest.stylingLayer.orderModules).toMatchObject(
        ['react', 'vue', 'svelte', 'html'].map((target) => ({
          path: `dist/${target}/_layer-order.scss`,
          imports: [],
        }))
      );
      expect(manifest.stylingLayer.orderModules[1].import).toBe(
        'built-kit/vue/_layer-order.scss'
      );

      // A consumer compiling the emitted sheet with their own sass, against
      // the kit's load paths, gets the order first and once.
      const sass = await import('sass');
      const { css } = sass.compile(
        join(kitDirectory, 'dist', 'react', 'Chip.scss'),
        {
          loadPaths: [join(kitDirectory, 'src')],
          style: 'compressed',
        }
      );
      expect(css.startsWith('@layer kit.base, kit.components;')).toBe(true);
      expect(css.split('@layer kit.base, kit.components;')).toHaveLength(2);
      expect(css.indexOf('.chip-base{margin:0}')).toBeLessThan(
        css.indexOf('.chip{')
      );
    });

    it('writes no layer order module for a layer without an order', async () => {
      configureBoth({
        loadPaths: ['src'],
        stylingLayer: { name: 'kit.components' },
      });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();
      expect(
        existsSync(join(kitDirectory, 'dist', 'react', '_layer-order.scss'))
      ).toBe(false);
      expect(built('react', 'Chip.scss')).not.toContain('layer-order');
      const manifest = JSON.parse(
        readFileSync(
          join(kitDirectory, 'dist', 'scaffold-ui-kit-manifest.json'),
          'utf8'
        )
      );
      expect(manifest.stylingLayer).toEqual({ name: 'kit.components' });
    });

    it('writes no index for a kit whose sheets are CSS', async () => {
      configureBoth({ stylingLanguage: 'css', loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      expect(
        existsSync(join(kitDirectory, 'dist', 'react', '_index.scss'))
      ).toBe(false);
    });

    it("links a css kit's html pages the way the engine does", async () => {
      configureBoth({ stylingLanguage: 'css', loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      expect(
        built('html', 'Button.html').startsWith(
          '<link rel="stylesheet" href="Button.css">\n\n'
        )
      ).toBe(true);
    });

    it('compiles each stylesheet against the load paths, once for every target', async () => {
      configureBoth({ loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      expect(built('stylesheets', 'Button.css')).toContain(
        '.button{cursor:pointer'
      );
      expect(built('stylesheets', 'Chip.css')).toBe('.chip{gap:4px}\n');
      for (const target of ['react', 'vue', 'svelte']) {
        expect(
          existsSync(join(kitDirectory, 'dist', target, 'linked', 'Button.css'))
        ).toBe(false);
      }
    });

    it('writes the shared stylesheets to the directory the kit names', async () => {
      configureBoth({
        loadPaths: ['src'],
        compiledStylesheetDirectory: 'dist/components',
      });
      // A consumer who owns a component imports its compiled sheet from there.
      const packagePath = join(kitDirectory, 'package.json');
      const kitPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
      kitPackage.exports['./components/*.css'] = './dist/components/*.css';
      writeFileSync(packagePath, JSON.stringify(kitPackage));
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      expect(built('components', 'Chip.css')).toBe('.chip{gap:4px}\n');
      expect(built('vue', 'linked', 'Chip.ts')).toMatch(
        /^import '\.\.\/\.\.\/components\/Chip\.css';\n/
      );
    });

    it('writes a linked module per module, linking its closure dependencies first', async () => {
      configureBoth({ loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      expect(built('react', 'linked', 'Button.ts')).toBe(
        "import '../../stylesheets/Button.css';\n" +
          "import { Button as ButtonExport } from '../Button';\n" +
          "export * from '../Button';\n" +
          'export const Button = ButtonExport;\n'
      );
      expect(built('react', 'linked', 'Fancy.ts')).toMatch(
        /^import '\.\.\/\.\.\/stylesheets\/Button\.css';\nimport '\.\.\/\.\.\/stylesheets\/Chip\.css';\nimport \{ Fancy as FancyExport \}/
      );
      expect(built('vue', 'linked', 'Chip.ts')).toBe(
        "import '../../stylesheets/Chip.css';\n" +
          "import ChipExport from '../Chip.vue';\n" +
          "export * from '../Chip.vue';\n" +
          'export default ChipExport;\n'
      );
      expect(built('svelte', 'linked', 'Button.ts')).toBe(
        "import '../../stylesheets/Button.css';\n" +
          "import ButtonExport from '../Button.svelte';\n" +
          "export * from '../Button.svelte';\n" +
          'export default ButtonExport;\n'
      );
    });

    it('binds every runtime export in the linked module, so none passes through', async () => {
      configureBoth({ loadPaths: ['src'] });
      const reactDrivers = join(kitDirectory, 'src', 'drivers', 'react');
      writeFileSync(
        join(reactDrivers, 'Fancy.tsx'),
        [
          "import { Button } from './Button';",
          "import { Chip } from './Chip';",
          '',
          'export function Fancy() {}',
          'export const fancyDefaults = {};',
          'export class FancyStore {}',
          'export type FancyProps = {};',
          'export interface FancyOptions {}',
          'export { Chip as FancyChip, type Chip as FancyChipType };',
          "export * from './fancy-helpers';",
          '',
        ].join('\n')
      );
      writeFileSync(
        join(reactDrivers, 'fancy-helpers.ts'),
        'export function helpFancy() {}\nexport const enum FancyKind { A }\n'
      );
      const svelteDrivers = join(kitDirectory, 'src', 'drivers', 'svelte');
      mkdirSync(svelteDrivers, { recursive: true });
      writeFileSync(
        join(svelteDrivers, 'Tag.svelte'),
        '<script context="module" lang="ts">\nexport const tagSize = 2;\n</script>\n\n<script lang="ts">\nexport let label: string;\n</script>\n\n<span>{label}</span>\n'
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      expect(built('react', 'linked', 'Fancy.ts')).toBe(
        "import '../../stylesheets/Button.css';\n" +
          "import '../../stylesheets/Chip.css';\n" +
          "import { Fancy as FancyExport, fancyDefaults as fancyDefaultsExport, FancyStore as FancyStoreExport, FancyChip as FancyChipExport, helpFancy as helpFancyExport } from '../Fancy';\n" +
          "export * from '../Fancy';\n" +
          'export const Fancy = FancyExport;\n' +
          'export const fancyDefaults = fancyDefaultsExport;\n' +
          'export const FancyStore = FancyStoreExport;\n' +
          'export type FancyStore = FancyStoreExport;\n' +
          'export const FancyChip = FancyChipExport;\n' +
          'export const helpFancy = helpFancyExport;\n'
      );
      expect(built('svelte', 'linked', 'Tag.ts')).toBe(
        "import TagExport, { tagSize as tagSizeExport } from '../Tag.svelte';\n" +
          "export * from '../Tag.svelte';\n" +
          'export default TagExport;\n' +
          'export const tagSize = tagSizeExport;\n'
      );
    });

    it('warns about an export * the linked module cannot bind', async () => {
      configureBoth({ loadPaths: ['src'] });
      writeFileSync(
        join(kitDirectory, 'src', 'drivers', 'react', 'Shared.tsx'),
        "export * from 'some-package';\n"
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "dist/react/Shared.tsx: warning: re-exports 'some-package' through 'export *'"
        )
      );
    });

    it('exports the linked modules from index.ts and the components from unlinked/', async () => {
      configureBoth({ loadPaths: ['src'] });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      expect(built('react', 'index.ts')).toBe(
        "export * from './linked/Button';\n" +
          "export * from './linked/Card';\n" +
          "export * from './linked/Chip';\n" +
          "export * from './linked/Fancy';\n"
      );
      expect(built('react', 'unlinked', 'index.ts')).toBe(
        "export * from '../Button';\n" +
          "export * from '../Card';\n" +
          "export * from '../Chip';\n" +
          "export * from '../Fancy';\n"
      );
      expect(built('vue', 'index.ts')).toContain(
        "export { default as Button } from './linked/Button';\n" +
          "export * from './linked/Button';\n"
      );
      expect(built('vue', 'unlinked', 'index.ts')).toContain(
        "export { default as Button } from '../Button.vue';\n" +
          "export * from '../Button.vue';\n"
      );
    });

    it('reports a stylesheet that fails to compile and exits non-zero', async () => {
      configureBoth();
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('dist/react/Chip.scss: ')
      );
    });
  });

  it('writes a barrel per scripted target and none for html', async () => {
    await buildCommand(kitDirectory);
    expect(
      readFileSync(join(kitDirectory, 'dist', 'react', 'index.ts'), 'utf8')
    ).toBe("export * from './Button';\nexport * from './Card';\n");
    expect(
      readFileSync(join(kitDirectory, 'dist', 'vue', 'index.ts'), 'utf8')
    ).toBe(
      "export { default as Button } from './Button.vue';\n" +
        "export * from './Button.vue';\n" +
        "export { default as Card } from './Card.vue';\n" +
        "export * from './Card.vue';\n"
    );
    expect(existsSync(join(kitDirectory, 'dist', 'html', 'index.ts'))).toBe(
      false
    );
  });

  it("re-exports a component template's exported types from the barrel", async () => {
    // A template may declare `export type` / `export interface` beside its
    // component (module-scope lines ride the `imports` field verbatim). The
    // barrel must carry that full module surface on every scripted target
    // with no post-build step.
    writeFileSync(
      join(kitDirectory, 'src', 'components', 'table.json'),
      JSON.stringify({
        type: 'component',
        name: 'Table',
        imports: [
          'export interface TableColumn { key: string; label: string; }',
        ],
        props: { columns: { type: 'TableColumn[]', required: true } },
        children: [{ type: 'element', tag: 'table', children: [] }],
      })
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    const cases: Array<[string, string, string[]]> = [
      ['react', 'Table.tsx', ["export * from './Table';"]],
      [
        'vue',
        'Table.vue',
        [
          "export { default as Table } from './Table.vue';",
          "export * from './Table.vue';",
        ],
      ],
      [
        'svelte',
        'Table.svelte',
        [
          "export { default as Table } from './Table.svelte';",
          "export * from './Table.svelte';",
        ],
      ],
    ];
    for (const [target, fileName, barrelLines] of cases) {
      expect(
        readFileSync(join(kitDirectory, 'dist', target, fileName), 'utf8'),
        fileName
      ).toContain('export interface TableColumn');
      const barrel = readFileSync(
        join(kitDirectory, 'dist', target, 'index.ts'),
        'utf8'
      );
      for (const barrelLine of barrelLines) {
        expect(barrel, target).toContain(barrelLine);
      }
    }
  });

  const writeDriver = (target: string, fileName: string, content: string) => {
    const path = join(kitDirectory, 'src', 'drivers', target, fileName);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };

  it('copies drivers through and merges them into the barrel', async () => {
    writeDriver('react', 'Toast.tsx', 'export function Toast() {}\n');
    writeDriver('vue', 'Toast.vue', '<template><div /></template>\n');
    writeDriver('svelte', 'Toast.svelte', '<div />\n');
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    const cases: Array<[string, string, string[]]> = [
      ['react', 'Toast.tsx', ["export * from './Toast';"]],
      [
        'vue',
        'Toast.vue',
        [
          "export { default as Toast } from './Toast.vue';",
          "export * from './Toast.vue';",
        ],
      ],
      [
        'svelte',
        'Toast.svelte',
        [
          "export { default as Toast } from './Toast.svelte';",
          "export * from './Toast.svelte';",
        ],
      ],
    ];
    for (const [target, fileName, barrelLines] of cases) {
      const driverPath = join(kitDirectory, 'dist', target, fileName);
      expect(existsSync(driverPath), fileName).toBe(true);
      const barrel = readFileSync(
        join(kitDirectory, 'dist', target, 'index.ts'),
        'utf8'
      );
      for (const barrelLine of barrelLines) {
        // The generated Visuals are exported first, the drivers after them.
        expect(barrel.indexOf('Button')).toBeLessThan(
          barrel.indexOf(barrelLine)
        );
        expect(barrel, target).toContain(barrelLine);
      }
    }
  });

  it('preserves driver subdirectories and only barrels top-level modules', async () => {
    writeDriver('react', 'Toast.tsx', 'export function Toast() {}\n');
    writeDriver(
      join('react', 'internal'),
      'use-toast.ts',
      'export const useToast = () => {};\n'
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    expect(
      existsSync(
        join(kitDirectory, 'dist', 'react', 'internal', 'use-toast.ts')
      )
    ).toBe(true);
    const barrel = readFileSync(
      join(kitDirectory, 'dist', 'react', 'index.ts'),
      'utf8'
    );
    expect(barrel).toContain("export * from './Toast';");
    expect(barrel).not.toContain('use-toast');
  });

  it('ignores drivers for the html target', async () => {
    writeDriver('html', 'Toast.html', '<div>Toast</div>\n');
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(join(kitDirectory, 'dist', 'html', 'Toast.html'))).toBe(
      false
    );
  });

  it('fails the build when a driver collides with a generated file', async () => {
    writeDriver('react', 'Button.tsx', 'export const Button = "driver";\n');
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('collides with generated dist/react/Button.tsx')
    );
    // The generated component is left intact, not clobbered by the driver.
    expect(
      readFileSync(join(kitDirectory, 'dist', 'react', 'Button.tsx'), 'utf8')
    ).toContain('export function Button');
  });

  it('fails the build when a driver collides with the target index', async () => {
    writeDriver('react', 'index.ts', '// a driver\n');
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "drivers/react/index.ts: error: collides with the target's index the build writes at dist/react/index.ts; rename the driver"
    );
  });

  it('fails the build when a driver collides with the stylesheet index of a target with SCSS sheets', async () => {
    writeFileSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      JSON.stringify({
        name: 'built-kit',
        targets: ['vue'],
        styling: [],
        stylesheetPlacement: 'separate-file',
        stylingLanguage: 'scss',
      })
    );
    writeDriver('vue', '_index.scss', '// a driver\n');
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "drivers/vue/_index.scss: error: collides with the target's stylesheet index the build writes at dist/vue/_index.scss; rename the driver"
    );
  });

  it('copies an _index.scss driver for a target the build writes no stylesheet index for', async () => {
    writeDriver('vue', '_index.scss', '// a driver\n');
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(
      readFileSync(join(kitDirectory, 'dist', 'vue', '_index.scss'), 'utf8')
    ).toBe('// a driver\n');
  });

  it('fails the build when a driver collides with the linked modules or the unlinked index', async () => {
    writeFileSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      JSON.stringify({
        name: 'built-kit',
        targets: ['react'],
        styling: [],
        stylesheetPlacement: 'separate-file',
        stylingLanguage: 'scss',
        stylesheetLink: 'both',
      })
    );
    writeDriver('react', 'linked/Button.ts', '// a driver\n');
    writeDriver('react', 'unlinked/index.ts', '// a driver\n');
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      'drivers/react/linked/Button.ts: error: collides with the linked modules the build writes at dist/react/linked/Button.ts; rename the driver'
    );
    expect(console.error).toHaveBeenCalledWith(
      "drivers/react/unlinked/index.ts: error: collides with the target's unlinked index the build writes at dist/react/unlinked/index.ts; rename the driver"
    );
  });

  it('copies a driver under linked/ when the build writes no linked modules', async () => {
    writeDriver('react', 'linked/helper.ts', 'export const helper = 1;\n');
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(
      existsSync(join(kitDirectory, 'dist', 'react', 'linked', 'helper.ts'))
    ).toBe(true);
  });

  it('reports a failing template, continues, and exits non-zero', async () => {
    writeFileSync(
      join(kitDirectory, 'src', 'components', 'broken.json'),
      JSON.stringify({ type: 'nonsense' })
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(kitDirectory, 'dist', 'react', 'Button.tsx'))).toBe(
      true
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('broken.json: error:')
    );
  });

  describe('diagnostics', () => {
    const errorLines = (): string[] =>
      vi.mocked(console.error).mock.calls.map(([line]) => String(line));

    it('reports every validation error of a template once, and renders it for no target', async () => {
      writeFileSync(
        join(kitDirectory, 'src', 'components', 'Tabs.json'),
        JSON.stringify({
          type: 'component',
          name: 'Tabs',
          props: { go: { type: '() => void' } },
          children: [
            {
              type: 'element',
              tag: 'div',
              events: [
                { name: 'keydown', handler: 'go', modifiers: ['home', 'end'] },
              ],
              conditionalAttributes: [
                { condition: 'go', attributes: { style: { color: 'red' } } },
              ],
            },
          ],
        })
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      const tabs = errorLines().filter((line) => line.includes('Tabs.json'));
      expect(tabs).toEqual([
        expect.stringMatching(
          /^src\/components\/Tabs\.json: error: A conditionalAttributes style needs a class .* \(at children\[0\]\.conditionalAttributes\[0\]\.attributes\)$/
        ),
        expect.stringMatching(
          /^src\/components\/Tabs\.json: error: Unknown event modifier "home".* \(at children\[0\]\.events\[0\]\.modifiers\[0\]\)$/
        ),
        expect.stringMatching(
          /^src\/components\/Tabs\.json: error: Unknown event modifier "end".* \(at children\[0\]\.events\[0\]\.modifiers\[1\]\)$/
        ),
      ]);
      expect(existsSync(join(kitDirectory, 'dist', 'html', 'Tabs.html'))).toBe(
        false
      );
      expect(
        existsSync(join(kitDirectory, 'dist', 'react', 'Button.tsx'))
      ).toBe(true);
    });

    it('prints a warning every target reports once, and one target reports labeled with it', async () => {
      writeFileSync(
        join(kitDirectory, 'src', 'components', 'Panel.json'),
        JSON.stringify({
          type: 'component',
          name: 'Panel',
          extensions: { vue: { omitProps: ['open'] } },
          children: [
            {
              type: 'element',
              tag: 'div',
              extensions: { bem: { block: 'panel', blok: 'typo' } },
            },
          ],
        })
      );
      await buildCommand(kitDirectory);
      const panel = errorLines().filter((line) => line.includes('Panel.json'));
      expect(panel).toEqual([
        expect.stringMatching(
          /^src\/components\/Panel\.json: warning: The bem override has no 'blok' key.* \(at children\[0\]\.extensions\.bem\.blok\)$/
        ),
        expect.stringMatching(
          /^src\/components\/Panel\.json \(vue\): warning: The vue override has no 'omitProps' key.* \(at extensions\.vue\.omitProps\)$/
        ),
      ]);
    });

    it('reports what the build reports, as diagnoseKit, writing no output', async () => {
      writeFileSync(
        join(kitDirectory, 'src', 'components', 'Panel.json'),
        JSON.stringify({
          type: 'component',
          name: 'Panel',
          extensions: { vue: { omitProps: ['open'] } },
          children: [{ type: 'element', tag: 'div' }],
        })
      );
      writeFileSync(
        join(kitDirectory, 'src', 'components', 'Counter.json'),
        JSON.stringify({
          type: 'component',
          name: 'Counter',
          props: { label: { type: 'string', default: 5 } },
          children: [{ type: 'element', tag: 'span' }],
        })
      );
      const report = await diagnoseKit(kitDirectory);
      expect(report.errors).toEqual([
        expect.stringMatching(/^src\/components\/Counter\.json: .*label/),
      ]);
      expect(report.warnings).toEqual([
        expect.stringMatching(
          /^src\/components\/Panel\.json \(vue\): The vue override has no 'omitProps' key.* \(at extensions\.vue\.omitProps\)$/
        ),
      ]);
      expect(existsSync(join(kitDirectory, 'dist'))).toBe(false);
      // A kit directory relative to the working directory reads the same.
      expect(await diagnoseKit(relative(process.cwd(), kitDirectory))).toEqual(
        report
      );
      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    describe('Svelte compiler warnings', () => {
      // The workspace's Svelte, installed in the kit as a kit targeting
      // Svelte installs it.
      const installSvelte = (): void => {
        mkdirSync(join(kitDirectory, 'node_modules'), { recursive: true });
        symlinkSync(
          realpathSync(join(packageDirectory, 'node_modules')) + '/svelte',
          join(kitDirectory, 'node_modules', 'svelte'),
          'dir'
        );
      };
      const writeTrack = (ignore?: string[]): void => {
        writeFileSync(
          join(kitDirectory, 'src', 'components', 'Track.json'),
          JSON.stringify({
            type: 'component',
            name: 'Track',
            props: { onPress: { type: '() => void' } },
            children: [
              {
                type: 'element',
                tag: 'div',
                events: [{ name: 'pointerdown', handler: 'onPress' }],
                ...(ignore === undefined
                  ? {}
                  : { extensions: { svelte: { ignore } } }),
              },
            ],
          })
        );
      };
      const trackLines = (lines: string[]): string[] =>
        lines.filter((line) => line.includes('Track.json'));
      // A printed line names its severity; diagnoseKit's report holds it apart.
      const trackDiagnostic =
        /^src\/components\/Track\.json \(svelte\): a11y_no_static_element_interactions: .*<div>.* must have an ARIA role \(at dist\/svelte\/Track\.svelte:\d+:\d+\)$/;
      const trackWarning =
        /^src\/components\/Track\.json \(svelte\): warning: a11y_no_static_element_interactions: .*<div>.* must have an ARIA role \(at dist\/svelte\/Track\.svelte:\d+:\d+\)$/;

      it("reports a warning the kit's Svelte compiler gives the emitted component, in build and diagnoseKit", async () => {
        installSvelte();
        writeTrack();
        await buildCommand(kitDirectory);
        expect(process.exitCode).toBeUndefined();
        const track = trackLines(errorLines());
        expect(track).toEqual([expect.stringMatching(trackWarning)]);
        expect(track[0]).toContain(': warning: ');
        // The location points at the element in the emitted file.
        const [, line, column] = /:(\d+):(\d+)\)$/.exec(track[0]) ?? [];
        const emitted = readFileSync(
          join(kitDirectory, 'dist', 'svelte', 'Track.svelte'),
          'utf8'
        ).split('\n');
        expect(emitted[Number(line) - 1].slice(Number(column) - 1)).toMatch(
          /^<div/
        );

        const report = await diagnoseKit(kitDirectory);
        expect(report.errors).toEqual([]);
        expect(trackLines(report.warnings)).toEqual([
          expect.stringMatching(trackDiagnostic),
        ]);
      });

      describe('a component the Svelte compiler cannot compile', () => {
        // The script and the Svelte override's script are joined, so the
        // function is declared twice.
        const writeTwice = (): void => {
          const script = 'function removeTag() {}';
          writeFileSync(
            join(kitDirectory, 'src', 'components', 'Twice.json'),
            JSON.stringify({
              type: 'component',
              name: 'Twice',
              script,
              extensions: { svelte: { script } },
              children: [{ type: 'element', tag: 'p' }],
            })
          );
        };
        const twiceLines = (lines: string[]): string[] =>
          lines.filter((line) => line.includes('Twice.json'));
        const twiceDiagnostic =
          /^src\/components\/Twice\.json \(svelte\): js_parse_error: the Svelte compiler could not compile the component: .*removeTag.* \(at dist\/svelte\/Twice\.svelte:\d+:\d+\)$/;
        const twiceError =
          /^src\/components\/Twice\.json \(svelte\): error: js_parse_error: the Svelte compiler could not compile the component: .*removeTag.* \(at dist\/svelte\/Twice\.svelte:\d+:\d+\)$/;

        it('fails the build as an error and leaves the file written', async () => {
          installSvelte();
          writeTwice();
          await buildCommand(kitDirectory);
          expect(process.exitCode).toBe(1);
          expect(twiceLines(errorLines())).toEqual([
            expect.stringMatching(twiceError),
          ]);
          expect(
            existsSync(join(kitDirectory, 'dist', 'svelte', 'Twice.svelte'))
          ).toBe(true);
          // The component is this build's, so its target still indexes it.
          expect(
            readFileSync(
              join(kitDirectory, 'dist', 'svelte', 'index.ts'),
              'utf8'
            )
          ).toContain('Twice');
        });

        it('is an error in diagnoseKit, beside a warning that stays one', async () => {
          installSvelte();
          writeTwice();
          writeTrack();
          const report = await diagnoseKit(kitDirectory);
          expect(twiceLines(report.errors)).toEqual([
            expect.stringMatching(twiceDiagnostic),
          ]);
          expect(trackLines(report.errors)).toEqual([]);
          expect(trackLines(report.warnings)).toEqual([
            expect.stringMatching(trackDiagnostic),
          ]);
        });
      });

      it('leaves out a warning the template ignores with a svelte-ignore comment', async () => {
        installSvelte();
        writeTrack(['a11y_no_static_element_interactions']);
        const report = await diagnoseKit(kitDirectory);
        expect(report.errors).toEqual([]);
        expect(trackLines(report.warnings)).toEqual([]);
      });

      // Outside this package, which installs Svelte for these tests, so that
      // no Svelte above the kit can be found. JSON templates only: a
      // TypeScript one imports the engine's types from this package.
      const useKitOutsideThisPackage = (targets: TargetName[]): void => {
        rmSync(parentDirectory, { recursive: true, force: true });
        parentDirectory = mkdtempSync(join(tmpdir(), 'scaffold-build-'));
        scaffoldKit({
          projectName: 'built-kit',
          parentDirectory,
          targets,
          styling: [],
          includeExamples: false,
          configurationFile: 'scaffold-ui-kit.json',
        });
        kitDirectory = join(parentDirectory, 'built-kit');
      };
      const skippedNotes = (): unknown[] =>
        vi
          .mocked(console.error)
          .mock.calls.map(([line]) => line)
          .filter((line) => String(line).includes('not compile-checked'));

      it('checks nothing when the kit has no Svelte installed', async () => {
        useKitOutsideThisPackage(['react', 'svelte']);
        writeTrack();
        const report = await diagnoseKit(kitDirectory);
        expect(trackLines(report.warnings)).toEqual([]);
      });

      it('says the check was skipped when a kit with a Svelte target has no Svelte installed', async () => {
        useKitOutsideThisPackage(['react', 'svelte']);
        writeTrack();
        await buildCommand(kitDirectory);
        expect(process.exitCode).toBeUndefined();
        expect(skippedNotes()).toEqual([
          expect.stringMatching(/^note: .*Svelte 5 or later is not installed/),
        ]);
      });

      it('says nothing of the check when the kit has Svelte installed', async () => {
        installSvelte();
        await buildCommand(kitDirectory);
        expect(skippedNotes()).toEqual([]);
      });

      it('says nothing of the check when the kit has no Svelte target', async () => {
        useKitOutsideThisPackage(['react']);
        await buildCommand(kitDirectory);
        expect(skippedNotes()).toEqual([]);
      });
    });
  });

  describe('output the build no longer produces', () => {
    const distributionPath = (...segments: string[]): string =>
      join(kitDirectory, 'dist', ...segments);

    it("removes a deleted template's files from every target, and nothing the kit put in dist", async () => {
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();
      writeFileSync(distributionPath('react', 'theme.css'), ':root {}\n');
      writeFileSync(distributionPath('notes.md'), 'hand-written\n');

      rmSync(join(kitDirectory, 'src', 'components', 'card.ts'));
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      for (const file of [
        ['react', 'Card.tsx'],
        ['vue', 'Card.vue'],
        ['svelte', 'Card.svelte'],
        ['html', 'Card.html'],
      ]) {
        expect(existsSync(distributionPath(...file)), file.join('/')).toBe(
          false
        );
        expect(console.log).toHaveBeenCalledWith(
          `removed dist/${file.join('/')}`
        );
      }
      expect(existsSync(distributionPath('react', 'Button.tsx'))).toBe(true);
      expect(
        readFileSync(distributionPath('react', 'index.ts'), 'utf8')
      ).not.toContain('Card');
      expect(existsSync(distributionPath('react', 'theme.css'))).toBe(true);
      expect(existsSync(distributionPath('notes.md'))).toBe(true);
      // The record stays out of the published dist.
      expect(
        existsSync(
          join(
            kitDirectory,
            'node_modules',
            '.cache',
            'scaffold-ui-kit',
            'build-record.json'
          )
        )
      ).toBe(true);
      expect(readdirSync(distributionPath())).toEqual([
        'html',
        'notes.md',
        'react',
        'scaffold-ui-kit-manifest.json',
        'svelte',
        'vue',
      ]);
    });

    it("removes a deleted driver's copy and a dropped target's output", async () => {
      writeDriver(
        join('react', 'internal'),
        'use-toast.ts',
        'export const useToast = () => {};\n'
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      rmSync(join(kitDirectory, 'src', 'drivers'), { recursive: true });
      const configurationPath = join(kitDirectory, 'scaffold-ui-kit.json');
      const configuration = JSON.parse(readFileSync(configurationPath, 'utf8'));
      writeFileSync(
        configurationPath,
        JSON.stringify({
          ...configuration,
          targets: ['react', 'vue', 'svelte'],
        })
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      // The emptied directories go with the files.
      expect(existsSync(distributionPath('react', 'internal'))).toBe(false);
      expect(existsSync(distributionPath('html'))).toBe(false);
      expect(existsSync(distributionPath('vue', 'Card.vue'))).toBe(true);
    });

    it('keeps a file changed since the build wrote it, with a warning', async () => {
      await buildCommand(kitDirectory);
      writeFileSync(distributionPath('react', 'Card.tsx'), '// edited\n');

      rmSync(join(kitDirectory, 'src', 'components', 'card.ts'));
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      expect(readFileSync(distributionPath('react', 'Card.tsx'), 'utf8')).toBe(
        '// edited\n'
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('dist/react/Card.tsx: warning: no longer built')
      );
      expect(existsSync(distributionPath('vue', 'Card.vue'))).toBe(false);
    });

    it('keeps the files of a component renamed only by case, under the new spelling', async () => {
      await buildCommand(kitDirectory);
      // A JSON template in the module's place, as a module already loaded
      // is not read again.
      const componentsDirectory = join(kitDirectory, 'src', 'components');
      rmSync(join(componentsDirectory, 'card.ts'));
      writeFileSync(
        join(componentsDirectory, 'card.json'),
        JSON.stringify({
          type: 'component',
          name: 'CARD',
          children: [{ type: 'element', tag: 'article' }],
        })
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      // Where file names ignore case the old spelling is the file the build
      // just wrote, which a removal would take with it.
      for (const [target, extension] of [
        ['react', 'tsx'],
        ['vue', 'vue'],
        ['svelte', 'svelte'],
        ['html', 'html'],
      ]) {
        const files = readdirSync(distributionPath(target));
        expect(files, target).toContain(`CARD.${extension}`);
        expect(files, target).not.toContain(`Card.${extension}`);
      }
      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('no longer built')
      );
    });

    it('fails on two templates that declare one component name', async () => {
      writeFileSync(
        join(kitDirectory, 'src', 'components', 'second-card.json'),
        JSON.stringify({
          type: 'component',
          name: 'Card',
          children: [{ type: 'element', tag: 'div' }],
        })
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringMatching(
          /error: The component name 'Card' is also src\/components\/\S+'s, and the two would write the same files/
        )
      );
    });

    it('removes nothing when the build fails, and catches up on the next good one', async () => {
      await buildCommand(kitDirectory);
      const componentsDirectory = join(kitDirectory, 'src', 'components');
      const brokenCardPath = join(componentsDirectory, 'card.json');

      // A template that fails to process keeps its last good output.
      rmSync(join(componentsDirectory, 'card.ts'));
      writeFileSync(brokenCardPath, JSON.stringify({ type: 'nonsense' }));
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(existsSync(distributionPath('react', 'Card.tsx'))).toBe(true);

      rmSync(brokenCardPath);
      process.exitCode = undefined;
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();
      expect(existsSync(distributionPath('react', 'Card.tsx'))).toBe(false);
    });

    it("keeps a failed component's barrel entry from the last build, and adds the components this build made", async () => {
      await buildCommand(kitDirectory);
      const barrelPath = distributionPath('react', 'index.ts');
      expect(readFileSync(barrelPath, 'utf8')).toContain("from './Card'");

      const componentsDirectory = join(kitDirectory, 'src', 'components');
      // Pill is new in a build where Card fails.
      writeFileSync(
        join(componentsDirectory, 'pill.json'),
        JSON.stringify({
          type: 'component',
          name: 'Pill',
          children: [{ type: 'element', tag: 'span' }],
        })
      );
      rmSync(join(componentsDirectory, 'card.ts'));
      writeFileSync(
        join(componentsDirectory, 'card.json'),
        JSON.stringify({ type: 'nonsense' })
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(existsSync(distributionPath('react', 'Card.tsx'))).toBe(true);
      expect(existsSync(distributionPath('react', 'Pill.tsx'))).toBe(true);
      const barrel = readFileSync(barrelPath, 'utf8');
      expect(barrel).toContain("from './Pill'");
      expect(barrel).toContain("from './Button'");
      expect(barrel.match(/from '\.\/Card'/g)).toHaveLength(1);
      const vueBarrel = readFileSync(
        distributionPath('vue', 'index.ts'),
        'utf8'
      );
      expect(vueBarrel).toContain(
        "export { default as Card } from './Card.vue';"
      );
      expect(vueBarrel).toContain("export * from './Card.vue';");
      expect(vueBarrel).toContain("from './Pill.vue'");
      const warnings = vi
        .mocked(console.error)
        .mock.calls.map(([line]) => String(line))
        .filter((line) => line.startsWith('dist/react: warning:'));
      expect(warnings).toEqual([
        "dist/react: warning: Card failed to build, so its files from the last build stay, and the target's index files keep naming them until a build succeeds",
      ]);
    });

    it("drops a failed component's entry once its files are gone", async () => {
      await buildCommand(kitDirectory);
      const componentsDirectory = join(kitDirectory, 'src', 'components');
      rmSync(join(componentsDirectory, 'card.ts'));
      writeFileSync(
        join(componentsDirectory, 'card.json'),
        JSON.stringify({ type: 'nonsense' })
      );
      rmSync(distributionPath('react', 'Card.tsx'));
      // A stylesheet of the same name is not what the barrel imports.
      writeFileSync(distributionPath('react', 'Card.css'), '.card {}\n');
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(
        readFileSync(distributionPath('react', 'index.ts'), 'utf8')
      ).not.toContain('Card');
    });

    it('writes the barrel of a failed build when there is none yet', async () => {
      writeFileSync(
        join(kitDirectory, 'src', 'components', 'broken.json'),
        JSON.stringify({ type: 'nonsense' })
      );
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      const barrel = readFileSync(
        distributionPath('react', 'index.ts'),
        'utf8'
      );
      expect(barrel).toContain("from './Card'");
      expect(barrel).not.toContain('Broken');
    });
  });

  it('errors without a configuration file', async () => {
    rmSync(join(kitDirectory, 'scaffold-ui-kit.json'));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
  });

  it('builds a kit configured by the scaffold-ui-kit.ts initialize writes', async () => {
    const typed = mkdtempSync(join(packageDirectory, '.test-build-'));
    try {
      scaffoldKit({
        projectName: 'typed-kit',
        parentDirectory: typed,
        targets: ['react'],
        styling: ['bem'],
        includeExamples: true,
        includePreview: false,
      });
      const typedKit = join(typed, 'typed-kit');
      // The kit imports defineKit from scaffold-ui-kit, which a kit installs.
      mkdirSync(join(typedKit, 'node_modules'));
      symlinkSync(
        packageDirectory,
        join(typedKit, 'node_modules', 'scaffold-ui-kit')
      );
      await buildCommand(typedKit);
      expect(process.exitCode).toBeUndefined();
      expect(existsSync(join(typedKit, 'dist', 'react', 'Button.tsx'))).toBe(
        true
      );
    } finally {
      rmSync(typed, { recursive: true, force: true });
    }
  });

  it('reads scaffold-ui-kit.config.json under its old name, warning once in its name', async () => {
    renameSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      join(kitDirectory, 'scaffold-ui-kit.config.json')
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const warnings = vi
      .mocked(console.error)
      .mock.calls.map(([line]) => String(line))
      .filter((line) => line.includes('old name'));
    expect(warnings).toEqual([
      'scaffold-ui-kit.config.json: warning: the kit configuration is read under its old name, which stops being read in 3.0.0; rename it to scaffold-ui-kit.json, or write it as scaffold-ui-kit.ts with defineKit',
    ]);
  });

  it('builds with the configuration --configuration names', async () => {
    renameSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      join(kitDirectory, 'kit-configuration.json')
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    await buildCommand(kitDirectory, {
      configuration: join(kitDirectory, 'kit-configuration.json'),
    });
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(join(kitDirectory, 'dist', 'react', 'Button.tsx'))).toBe(
      true
    );
  });

  it('errors when src/components has no templates', async () => {
    rmSync(join(kitDirectory, 'src', 'components'), {
      recursive: true,
      force: true,
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
  });
});

describe('the kit manifest', () => {
  const manifestPath = (): string =>
    join(kitDirectory, 'dist', 'scaffold-ui-kit-manifest.json');
  const readManifest = (): any =>
    JSON.parse(readFileSync(manifestPath(), 'utf8'));
  const writeConfiguration = (configuration: Record<string, unknown>): void => {
    writeFileSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      JSON.stringify({ name: 'built-kit', styling: [], ...configuration })
    );
  };
  const updatePackage = (update: (kitPackage: any) => void): void => {
    const packagePath = join(kitDirectory, 'package.json');
    const kitPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
    update(kitPackage);
    writeFileSync(packagePath, JSON.stringify(kitPackage));
  };
  const errors = (): string[] =>
    vi.mocked(console.error).mock.calls.map(([message]) => String(message));
  const writeTemplate = (file: string, source: string[]): void => {
    writeFileSync(
      join(kitDirectory, 'src', 'components', file),
      [...source, ''].join('\n')
    );
  };

  it('records each component per target with the imports the exports give', async () => {
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    const manifest = readManifest();
    expect(manifest).toMatchObject({
      format: 1,
      kit: { name: 'built-kit', version: '0.1.0' },
      targets: ['react', 'vue', 'svelte', 'html'],
      consumerConfiguration: 'built-kit.json',
      ownership: 'partial',
      shared: [],
    });
    expect(Object.keys(manifest.components)).toEqual(['Button', 'Card']);
    expect(manifest.components.Button.kebabName).toBe('button');
    expect(manifest.components.Button.files.react.component).toEqual({
      path: 'dist/react/Button.tsx',
      import: 'built-kit/react/Button',
      imports: ['react'],
    });
    expect(manifest.components.Button.files.vue.component).toMatchObject({
      path: 'dist/vue/Button.vue',
      import: 'built-kit/vue/Button.vue',
    });
    // An html page has no module to import: its consumers copy it.
    expect(manifest.components.Button.files.html.component).toEqual({
      path: 'dist/html/Button.html',
      imports: [],
    });
  });

  it("records a compound root's parts and each part's compound", async () => {
    writeTemplate('dialog.ts', [
      'export default {',
      "  type: 'component',",
      "  name: 'Dialog',",
      "  parts: ['DialogTrigger'],",
      "  children: [{ type: 'element', tag: 'div' }],",
      '};',
    ]);
    writeTemplate('dialog-trigger.ts', [
      'export default {',
      "  type: 'component',",
      "  name: 'DialogTrigger',",
      "  children: [{ type: 'element', tag: 'button' }],",
      '};',
    ]);
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    const { components } = readManifest();
    expect(components.Dialog.parts).toEqual(['DialogTrigger']);
    expect(components.DialogTrigger.partOf).toBe('Dialog');
    expect(components.DialogTrigger.kebabName).toBe('dialog-trigger');
    expect(components.Button.parts).toBeUndefined();
    expect(components.Button.partOf).toBeUndefined();
  });

  it('fails on a part that is not a component of the kit', async () => {
    writeTemplate('dialog.ts', [
      'export default {',
      "  type: 'component',",
      "  name: 'Dialog',",
      "  parts: ['DialogTriger'],",
      "  children: [{ type: 'element', tag: 'div' }],",
      '};',
    ]);
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(errors()).toContain(
      "Dialog: error: parts names 'DialogTriger', which is not a component of the kit"
    );
    expect(existsSync(manifestPath())).toBe(false);
  });

  describe('parts of a compound whose root has no template', () => {
    const writeDriver = (name: string): void => {
      const directory = join(kitDirectory, 'src', 'drivers', 'react');
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, `${name}.tsx`),
        `export function ${name}() { return <div />; }\n`
      );
    };
    const writeHeader = (): void => {
      writeTemplate('shell-header.ts', [
        'export default {',
        "  type: 'component',",
        "  name: 'ShellHeader',",
        "  children: [{ type: 'element', tag: 'header' }],",
        '};',
      ]);
    };

    it("records the configuration's parts on a hand-written root and each part's compound", async () => {
      writeDriver('Shell');
      writeHeader();
      writeConfiguration({
        targets: ['react'],
        parts: { Shell: ['ShellHeader'] },
      });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBeUndefined();

      const { components } = readManifest();
      expect(components.Shell.parts).toEqual(['ShellHeader']);
      expect(components.ShellHeader.partOf).toBe('Shell');
    });

    it('fails on a root that has a template, which lists its own parts', async () => {
      writeConfiguration({ targets: ['react'], parts: { Card: ['Button'] } });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(errors()).toContain(
        "scaffold-ui-kit.json: error: parts names 'Card', which has a template; list its parts in the template's parts instead"
      );
      expect(existsSync(manifestPath())).toBe(false);
    });

    it('fails on a root that is not a component of the kit', async () => {
      writeConfiguration({ targets: ['react'], parts: { Shel: ['Button'] } });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(errors()).toContain(
        "scaffold-ui-kit.json: error: parts names 'Shel', which is not a component of the kit"
      );
      expect(existsSync(manifestPath())).toBe(false);
    });

    it('fails on a part that a template root also lists', async () => {
      writeDriver('Shell');
      writeHeader();
      writeTemplate('dialog.ts', [
        'export default {',
        "  type: 'component',",
        "  name: 'Dialog',",
        "  parts: ['ShellHeader'],",
        "  children: [{ type: 'element', tag: 'div' }],",
        '};',
      ]);
      writeConfiguration({
        targets: ['react'],
        parts: { Shell: ['ShellHeader'] },
      });
      await buildCommand(kitDirectory);
      expect(process.exitCode).toBe(1);
      expect(errors()).toContain(
        "Shell: error: parts names 'ShellHeader', which is already a part of 'Dialog'; a part belongs to one compound"
      );
      expect(existsSync(manifestPath())).toBe(false);
    });
  });

  it('fails on a piece no export reaches under declared partial ownership, naming the export to add', async () => {
    updatePackage((kitPackage) => {
      kitPackage.exports = { './react': './dist/react/index.ts' };
    });
    writeConfiguration({ targets: ['react'], add: { ownership: 'partial' } });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(errors()).toContain(
      'package.json: error: no export reaches dist/react/Button.tsx, dist/react/Card.tsx; for example, add "./react/*": "./dist/react/*.tsx" to "exports"'
    );
    expect(
      errors().filter((line) => line.includes('builds only for full ownership'))
    ).toHaveLength(1);
    expect(existsSync(manifestPath())).toBe(false);
  });

  it('builds a kit that declares no ownership and exports only its barrels for full ownership, with a warning', async () => {
    // A kit as 2.2.1 built it: barrels only, no add.ownership.
    updatePackage((kitPackage) => {
      kitPackage.exports = { './react': './dist/react/index.ts' };
    });
    writeConfiguration({
      targets: ['react'],
      stylesheetPlacement: 'separate-file',
      stylingLanguage: 'scss',
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(errors().filter((line) => line.includes('error:'))).toEqual([]);
    expect(errors()).toContain(
      'package.json: warning: no export reaches dist/react/Button.tsx, dist/react/Card.tsx; for example, add "./react/*": "./dist/react/*.tsx" to "exports"'
    );
    expect(
      errors().filter((line) => line.includes('set add.ownership to "partial"'))
    ).toHaveLength(1);
    const manifest = readManifest();
    expect(manifest.ownership).toBe('full');
    // A sheet no linked module links and no consumer imports is not compiled.
    expect(existsSync(join(kitDirectory, 'dist', 'stylesheets'))).toBe(false);
    expect(manifest.components.Button.files.react.css).toBeUndefined();
  });

  it('records full ownership when only some pieces have an export, and warns of the rest', async () => {
    updatePackage((kitPackage) => {
      kitPackage.exports = {
        './react': './dist/react/index.ts',
        './react/Button': './dist/react/Button.tsx',
      };
    });
    writeConfiguration({ targets: ['react'] });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(errors()).toContain(
      'package.json: warning: no export reaches dist/react/Card.tsx; for example, add "./react/*": "./dist/react/*.tsx" to "exports"'
    );
    const manifest = readManifest();
    expect(manifest.ownership).toBe('full');
    expect(manifest.components.Button.files.react.component.import).toBe(
      'built-kit/react/Button'
    );
  });

  it('builds a kit that exports only its barrels for declared full ownership', async () => {
    updatePackage((kitPackage) => {
      kitPackage.exports = { './react': './dist/react/index.ts' };
    });
    writeConfiguration({ targets: ['react'], add: { ownership: 'full' } });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(
      errors().filter((line) => line.includes('no export reaches'))
    ).toEqual([]);
    const manifest = readManifest();
    expect(manifest.ownership).toBe('full');
    expect(manifest.components.Button.files.react.component.import).toBe(
      undefined
    );
  });

  it('compiles each component stylesheet to css for a consumer who owns only the component', async () => {
    writeConfiguration({
      targets: ['react', 'vue'],
      stylesheetPlacement: 'separate-file',
      stylingLanguage: 'scss',
      add: { ownership: 'partial' },
      stylingLayer: {
        name: 'kit.components',
        order: ['kit.components', 'kit.owned'],
        owned: 'kit.owned',
      },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    expect(
      readFileSync(
        join(kitDirectory, 'dist', 'stylesheets', 'Button.css'),
        'utf8'
      )
    ).toContain('@layer kit.components');
    const manifest = readManifest();
    expect(manifest.stylingLayer).toMatchObject({
      name: 'kit.components',
      order: ['kit.components', 'kit.owned'],
      owned: 'kit.owned',
      orderModules: [
        { path: 'dist/react/_layer-order.scss', imports: [] },
        { path: 'dist/vue/_layer-order.scss', imports: [] },
      ],
    });
    expect(manifest.stylingLayer.orderModules).toHaveLength(2);
    expect(manifest.components.Button.files.react).toMatchObject({
      component: { imports: ['react', './Button.scss'] },
      stylesheet: { path: 'dist/react/Button.scss' },
      css: {
        path: 'dist/stylesheets/Button.css',
        import: 'built-kit/stylesheets/Button.css',
      },
    });
    expect(manifest.components.Button.files.vue.css.path).toBe(
      'dist/stylesheets/Button.css'
    );
  });

  it('records the css of a css kit as its stylesheet', async () => {
    writeConfiguration({
      targets: ['react'],
      stylesheetPlacement: 'separate-file',
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(readManifest().components.Button.files.react.css).toEqual({
      path: 'dist/react/Button.css',
      import: 'built-kit/react/Button.css',
      imports: [],
    });
  });

  it('warns that a stylesheet-only consumer loads the kit sheet too, unless stylesheetLink is both', async () => {
    writeConfiguration({
      targets: ['react'],
      stylesheetPlacement: 'separate-file',
    });
    await buildCommand(kitDirectory);
    expect(readManifest().ownership).toBe('partial');
    const warning = (): string[] =>
      errors().filter((line) =>
        line.includes("loads the kit's stylesheet too, beside their copy")
      );
    expect(warning()).toHaveLength(1);
    expect(warning()[0]).toContain('set stylesheetLink to "both"');

    vi.mocked(console.error).mockClear();
    writeConfiguration({
      targets: ['react'],
      stylesheetPlacement: 'separate-file',
      stylesheetLink: 'none',
    });
    await buildCommand(kitDirectory);
    expect(warning()).toEqual([]);
  });

  it('records shared modules by name with the import the exports give', async () => {
    mkdirSync(join(kitDirectory, 'src', 'scripts'), { recursive: true });
    writeFileSync(
      join(kitDirectory, 'src', 'scripts', 'index.ts'),
      "export * from './ids';\n"
    );
    writeFileSync(
      join(kitDirectory, 'src', 'scripts', 'ids.ts'),
      'export const nextId = () => 1;\n'
    );
    mkdirSync(join(kitDirectory, 'src', 'styles'), { recursive: true });
    writeFileSync(
      join(kitDirectory, 'src', 'styles', 'theme.css'),
      ':root {}\n'
    );
    updatePackage((kitPackage) => {
      kitPackage.exports['./scripts/*'] = './src/scripts/*.ts';
      kitPackage.exports['./theme.css'] = './src/styles/theme.css';
      kitPackage.files.push('src/scripts', 'src/styles');
    });
    writeConfiguration({
      targets: ['react'],
      add: {
        shared: [
          {
            name: 'scripts',
            source: 'src/scripts',
            copy: 'reached',
            exclude: ['index.ts'],
          },
          { source: 'src/styles/theme.css' },
        ],
        notes: ['Import the theme once.'],
        consumerConfiguration: 'kit-settings.json',
      },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    const manifest = readManifest();
    expect(manifest.consumerConfiguration).toBe('kit-settings.json');
    expect(manifest.notes).toEqual(['Import the theme once.']);
    expect(manifest.shared).toEqual([
      {
        name: 'scripts',
        source: 'src/scripts',
        import: 'built-kit/scripts',
        copy: 'reached',
        files: [
          {
            path: 'src/scripts/ids.ts',
            import: 'built-kit/scripts/ids',
            imports: [],
          },
        ],
      },
      {
        name: 'theme',
        source: 'src/styles/theme.css',
        import: 'built-kit/theme.css',
        copy: 'all',
        files: [
          {
            path: 'src/styles/theme.css',
            import: 'built-kit/theme.css',
            imports: [],
          },
        ],
      },
    ]);
  });

  it('fails on a shared module no export reaches', async () => {
    mkdirSync(join(kitDirectory, 'src', 'scripts'), { recursive: true });
    writeFileSync(
      join(kitDirectory, 'src', 'scripts', 'ids.ts'),
      'export const nextId = () => 1;\n'
    );
    writeConfiguration({
      targets: ['react'],
      add: { shared: [{ source: 'src/scripts' }], ownership: 'partial' },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(
      errors().find((line) => line.includes('no export reaches src/scripts'))
    ).toContain('add "./scripts/*": "./src/scripts/*.ts"');
  });

  it('warns of a deprecated destination and specifier and builds', async () => {
    mkdirSync(join(kitDirectory, 'src', 'lib'), { recursive: true });
    writeFileSync(
      join(kitDirectory, 'src', 'lib', 'index.ts'),
      'export const cn = () => "";\n'
    );
    updatePackage((kitPackage) => {
      kitPackage.exports['./lib'] = './src/lib/index.ts';
    });
    writeConfiguration({
      targets: ['react'],
      add: {
        shared: [
          { source: 'src/lib', destination: 'lib', specifier: 'built-kit/lib' },
        ],
      },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(
      errors().filter((line) =>
        line.includes(
          'add.shared[0].destination, add.shared[0].specifier are deprecated'
        )
      )
    ).toHaveLength(1);
    expect(readManifest().shared[0]).toMatchObject({
      name: 'lib',
      import: 'built-kit/lib',
    });
  });

  it('fails when package.json files leaves the manifest out', async () => {
    updatePackage((kitPackage) => {
      kitPackage.files = ['bin', 'dist/react', 'README.md'];
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(errors()).toContain(
      'package.json: error: "files" leaves out dist/scaffold-ui-kit-manifest.json, which the kit\'s consumer command reads; add "dist"'
    );
  });

  it('only warns of files leaving the manifest out when the kit declares no ownership', async () => {
    updatePackage((kitPackage) => {
      kitPackage.files = ['bin', 'dist/react', 'README.md'];
    });
    writeConfiguration({ targets: ['react'] });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(errors()).toContain(
      'package.json: warning: "files" leaves out dist/scaffold-ui-kit-manifest.json, which the kit\'s consumer command reads; add "dist"'
    );
  });

  it('keeps the last good manifest when a build fails', async () => {
    await buildCommand(kitDirectory);
    const written = readFileSync(manifestPath(), 'utf8');
    writeTemplate('broken.ts', ['export default { type: "component" };']);
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(readFileSync(manifestPath(), 'utf8')).toBe(written);
  });
});

describe("a kit's own pkg: URLs", () => {
  const writeKit = (configuration: Record<string, unknown>): void => {
    writeFileSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      JSON.stringify({
        name: 'built-kit',
        targets: ['react'],
        styling: [],
        stylesheetPlacement: 'separate-file',
        ...configuration,
      })
    );
    const packagePath = join(kitDirectory, 'package.json');
    const kitPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
    kitPackage.exports['./styles/*'] = './src/styles/*.scss';
    writeFileSync(packagePath, JSON.stringify(kitPackage));
    mkdirSync(join(kitDirectory, 'src', 'styles'), { recursive: true });
    writeFileSync(
      join(kitDirectory, 'src', 'styles', '_tokens.scss'),
      '$chip-gap: 4px;\n'
    );
    // Another package's styles, which Sass's own package importer resolves.
    const otherPackage = join(kitDirectory, 'node_modules', 'other-styles');
    mkdirSync(otherPackage, { recursive: true });
    writeFileSync(
      join(otherPackage, 'package.json'),
      JSON.stringify({
        name: 'other-styles',
        exports: { './colors': './colors.scss' },
      })
    );
    writeFileSync(join(otherPackage, 'colors.scss'), '$chip-color: red;\n');
    writeFileSync(
      join(kitDirectory, 'src', 'components', 'chip.ts'),
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Chip',",
        `  style: '@use "pkg:built-kit/styles/tokens" as *;\\n@use "pkg:other-styles/colors" as *;',`,
        '  children: [',
        "    { type: 'element', tag: 'span', attributes: { class: ['chip'], style: { gap: '$chip-gap', color: '$chip-color' } } },",
        '  ],',
        '};',
        '',
      ].join('\n')
    );
  };

  it('resolves through the kit exports when the engine compiles the Sass itself', async () => {
    writeKit({});
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const css = readFileSync(
      join(kitDirectory, 'dist', 'react', 'Chip.css'),
      'utf8'
    );
    expect(css).toContain('gap: 4px');
    expect(css).toContain('color: red');
  });

  it('keeps the pkg: URL in an emitted SCSS sheet and compiles it for consumers', async () => {
    writeKit({ stylingLanguage: 'scss', add: { ownership: 'partial' } });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(
      readFileSync(join(kitDirectory, 'dist', 'react', 'Chip.scss'), 'utf8')
    ).toContain('@use "pkg:built-kit/styles/tokens" as *;');
    expect(
      readFileSync(
        join(kitDirectory, 'dist', 'stylesheets', 'Chip.css'),
        'utf8'
      )
    ).toBe('.chip{gap:4px;color:red}\n');
  });
});

describe('the kit manifest: ownership, shared modules and recorded settings', () => {
  const manifestPath = (): string =>
    join(kitDirectory, 'dist', 'scaffold-ui-kit-manifest.json');
  const readManifest = (): any =>
    JSON.parse(readFileSync(manifestPath(), 'utf8'));
  const writeConfiguration = (configuration: Record<string, unknown>): void => {
    writeFileSync(
      join(kitDirectory, 'scaffold-ui-kit.json'),
      JSON.stringify({ name: 'built-kit', styling: [], ...configuration })
    );
  };
  const updatePackage = (update: (kitPackage: any) => void): void => {
    const packagePath = join(kitDirectory, 'package.json');
    const kitPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
    update(kitPackage);
    writeFileSync(packagePath, JSON.stringify(kitPackage));
  };
  const messages = (): string[] =>
    vi.mocked(console.error).mock.calls.map(([message]) => String(message));
  const writeFile = (path: string, content: string | Buffer): void => {
    mkdirSync(join(kitDirectory, path, '..'), { recursive: true });
    writeFileSync(join(kitDirectory, path), content);
  };

  it('infers partial ownership when every leavable piece has an export', async () => {
    writeConfiguration({ targets: ['react', 'vue'] });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(readManifest().ownership).toBe('partial');
    expect(
      messages().filter((line) => line.includes('no export reaches'))
    ).toEqual([]);
  });

  it('never compiles sheets under inferred ownership, and records full for them', async () => {
    // Every component file is exported, but an scss kit's sheets are
    // compiled for consumers only when the kit declares partial ownership.
    writeConfiguration({
      targets: ['react'],
      stylesheetPlacement: 'separate-file',
      stylingLanguage: 'scss',
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(join(kitDirectory, 'dist', 'stylesheets'))).toBe(false);
    expect(readManifest().ownership).toBe('full');
    expect(
      messages().filter((line) =>
        line.includes(
          'component stylesheets are not compiled to CSS for consumers'
        )
      )
    ).toHaveLength(1);
  });

  it('requires nothing of a declared full kit, its shared modules included', async () => {
    writeFile('src/scripts/ids.ts', 'export const nextId = () => 1;\n');
    updatePackage((kitPackage) => {
      kitPackage.exports = { './react': './dist/react/index.ts' };
    });
    writeConfiguration({
      targets: ['react'],
      add: { ownership: 'full', shared: [{ source: 'src/scripts' }] },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(
      messages().filter((line) => line.includes('no export reaches'))
    ).toEqual([]);
    expect(readManifest().shared[0]).toEqual({
      name: 'scripts',
      source: 'src/scripts',
      copy: 'all',
      files: [{ path: 'src/scripts/ids.ts', imports: [] }],
    });
  });

  it('records the build settings, the load paths and the generator', async () => {
    writeFile('src/styles/_tokens.scss', '$gap: 4px;\n');
    writeConfiguration({
      targets: ['react'],
      stylesheetPlacement: 'separate-file',
      stylingLanguage: 'scss',
      loadPaths: ['./src/'],
      add: { ownership: 'partial' },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const manifest = readManifest();
    expect(manifest.generator).toEqual({
      name: 'scaffold-ui-kit',
      version: JSON.parse(
        readFileSync(join(packageDirectory, 'package.json'), 'utf8')
      ).version,
    });
    expect(manifest).toMatchObject({
      stylesheetLink: 'component',
      stylingLanguage: 'scss',
      stylesheetPlacement: 'separate-file',
      loadPaths: ['src'],
    });
    expect(manifest.stylingStrategy).toBeUndefined();
  });

  it('records each styling with its class kind and the extension blocks, defaults filled, for the extensions in use', async () => {
    writeConfiguration({
      targets: ['react', 'svelte'],
      styling: ['bem', 'tailwind'],
      bem: { mode: 'runtime' },
      tailwind: { output: 'styles', darkSelector: '[data-mode="dark"]' },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const manifest = readManifest();
    expect(manifest.styling).toEqual([
      { name: 'bem', classKind: 'semantic' },
      { name: 'tailwind', classKind: 'utility' },
    ]);
    expect(manifest.bem).toEqual({
      elementSeparator: '__',
      modifierSeparator: '--',
      mode: 'runtime',
      importSource: 'use-bem',
    });
    expect(manifest.tailwind).toEqual({
      output: 'styles',
      darkSelector: '[data-mode="dark"]',
      convertStyles: false,
    });
    expect(manifest.svelte).toEqual({ mode: 'legacy' });

    writeConfiguration({ targets: ['react'], styling: ['tailwind'] });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const plain = readManifest();
    expect(plain.styling).toEqual([{ name: 'tailwind', classKind: 'utility' }]);
    expect(plain.tailwind).toEqual({ output: 'classes', convertStyles: false });
    expect(plain.bem).toBeUndefined();
    expect(plain.svelte).toBeUndefined();
  });

  it('reads the deprecated flat keys into the blocks and stylesheetPlacement, warning once per key, and records the blocks', async () => {
    writeConfiguration({
      targets: ['react', 'svelte'],
      styling: ['bem'],
      stylingStrategy: 'separate-file',
      bemMode: 'runtime',
      svelteMode: 'runes',
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(messages()).toEqual(
      expect.arrayContaining([
        "scaffold-ui-kit.json: warning: 'stylingStrategy' is deprecated, is read as 'stylesheetPlacement' and will be removed in 3.0.0; rename the key",
        "scaffold-ui-kit.json: warning: 'bemMode' is deprecated, is read as 'bem.mode' and will be removed in 3.0.0; move it into the 'bem' block",
        "scaffold-ui-kit.json: warning: 'svelteMode' is deprecated, is read as 'svelte.mode' and will be removed in 3.0.0; move it into the 'svelte' block",
      ])
    );
    // Core is handed the placement, so it warns of no deprecated option.
    expect(messages().filter((line) => /outputStrategy/.test(line))).toEqual(
      []
    );
    expect(existsSync(join(kitDirectory, 'dist', 'react', 'Button.css'))).toBe(
      true
    );
    expect(
      readFileSync(
        join(kitDirectory, 'dist', 'svelte', 'Button.svelte'),
        'utf8'
      )
    ).toMatch(/\$props\(\)|svelte:options/);
    const manifest = readManifest();
    expect(manifest.stylesheetPlacement).toBe('separate-file');
    expect(manifest.bem.mode).toBe('runtime');
    expect(manifest.svelte).toEqual({ mode: 'runes' });
  });

  it("records each component's linked module under both, and suggests the unlinked module under /unlinked/", async () => {
    writeConfiguration({
      targets: ['react', 'vue'],
      stylesheetPlacement: 'separate-file',
      stylingLanguage: 'scss',
      stylesheetLink: 'both',
    });
    updatePackage((kitPackage) => {
      kitPackage.exports = {
        './react': './dist/react/index.ts',
        './vue': './dist/vue/index.ts',
      };
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const lines = messages();
    expect(lines).toContain(
      'package.json: warning: no export reaches dist/react/Button.tsx, dist/react/Card.tsx; for example, add "./react/unlinked/*": "./dist/react/*.tsx" to "exports"'
    );
    // A sheet every target shares is one piece, listed once.
    expect(lines).toContain(
      'package.json: warning: no export reaches dist/stylesheets/Button.css, dist/stylesheets/Card.css; for example, add "./stylesheets/*.css": "./dist/stylesheets/*.css" to "exports"'
    );
    const manifest = readManifest();
    expect(manifest.ownership).toBe('full');
    expect(manifest.components.Button.files.react.linked).toEqual({
      path: 'dist/react/linked/Button.ts',
      imports: ['../../stylesheets/Button.css', '../Button'],
    });
    expect(manifest.components.Button.files.vue.linked.path).toBe(
      'dist/vue/linked/Button.ts'
    );
  });

  it("records a driver's helper modules, its relative import closure", async () => {
    writeFile(
      'src/drivers/react/Toast.tsx',
      "import { Button } from './Button';\nimport { queue } from './toast/queue';\nexport function Toast() { queue(); return <Button label=\"x\" />; }\n"
    );
    writeFile(
      'src/drivers/react/toast/queue.ts',
      "import { timer } from './timer';\nexport const queue = () => timer();\n"
    );
    writeFile(
      'src/drivers/react/toast/timer.ts',
      'export const timer = () => 0;\n'
    );
    writeConfiguration({ targets: ['react'] });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const toast = readManifest().components.Toast.files.react;
    expect(toast.helpers.map((file: { path: string }) => file.path)).toEqual([
      'dist/react/toast/queue.ts',
      'dist/react/toast/timer.ts',
    ]);
    expect(toast.helpers[0].imports).toEqual(['./timer']);
    expect(
      readManifest().components.Button.files.react.helpers
    ).toBeUndefined();
  });

  it('counts a directory layer exported file by file as reached, an scss index as its index', async () => {
    writeFile('src/styles/index.scss', '@forward "base";\n');
    writeFile('src/styles/_base.scss', '$gap: 4px;\n');
    writeFile(
      'src/styles/fonts/mono.woff2',
      Buffer.from([0x77, 0x4f, 0x46, 0x32, 0xff, 0xfe])
    );
    updatePackage((kitPackage) => {
      kitPackage.exports['./styles'] = './src/styles/index.scss';
      kitPackage.exports['./styles/base'] = './src/styles/_base.scss';
    });
    writeConfiguration({
      targets: ['react'],
      add: {
        ownership: 'partial',
        shared: [{ source: 'src/styles', exclude: ['fonts'] }],
      },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(readManifest().shared[0]).toEqual({
      name: 'styles',
      source: 'src/styles',
      import: 'built-kit/styles',
      copy: 'all',
      files: [
        {
          path: 'src/styles/_base.scss',
          import: 'built-kit/styles/base',
          imports: [],
        },
        {
          path: 'src/styles/index.scss',
          import: 'built-kit/styles',
          imports: ['base'],
        },
      ],
    });
  });

  it('reports only the files of a layer that lack an export, and reads no font as text', async () => {
    writeFile('src/styles/index.scss', '@forward "base";\n');
    writeFile('src/styles/_base.scss', '$gap: 4px;\n');
    writeFile(
      'src/styles/fonts/mono.woff2',
      Buffer.from([0x77, 0x4f, 0x46, 0x32, 0xff, 0xfe])
    );
    updatePackage((kitPackage) => {
      kitPackage.exports['./styles'] = './src/styles/index.scss';
    });
    writeConfiguration({
      targets: ['react'],
      add: { ownership: 'partial', shared: [{ source: 'src/styles' }] },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    const gap = messages().find((line) =>
      line.includes('no export reaches src/')
    );
    // A font is never imported on its own, so it needs no export.
    expect(gap).toContain('no export reaches src/styles/_base.scss;');
    expect(gap).not.toContain('index.scss');
    expect(gap).not.toContain('mono.woff2');
  });

  it("records a stylesheet's url() references to files in the kit, and exempts assets from the reach check", async () => {
    writeFile('src/styles/index.scss', '@forward "fonts";\n');
    writeFile(
      'src/styles/_fonts.scss',
      [
        '@font-face {',
        '  font-family: Mono;',
        '  src: url("./fonts/mono.woff2?v=2") format("woff2"), url(fonts/mono-bold.woff2);',
        '}',
        '.a { background: url(data:image/png;base64,AAAA); }',
        '.b { background: url("https://example.com/x.png"); }',
        '.c { background: url(/root.png); }',
        '.d { background: url(./missing.png); }',
        '',
      ].join('\n')
    );
    writeFile(
      'src/styles/fonts/mono.woff2',
      Buffer.from([0x77, 0x4f, 0x46, 0x32])
    );
    writeFile(
      'src/styles/fonts/mono-bold.woff2',
      Buffer.from([0x77, 0x4f, 0x46, 0x32])
    );
    updatePackage((kitPackage) => {
      kitPackage.exports['./styles'] = './src/styles/index.scss';
      kitPackage.exports['./styles/fonts'] = './src/styles/_fonts.scss';
    });
    writeConfiguration({
      targets: ['react'],
      add: { ownership: 'partial', shared: [{ source: 'src/styles' }] },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(
      messages().filter((line) => line.includes('no export reaches'))
    ).toEqual([]);
    const files = readManifest().shared[0].files;
    expect(files).toContainEqual({
      path: 'src/styles/_fonts.scss',
      import: 'built-kit/styles/fonts',
      imports: ['./fonts/mono.woff2', 'fonts/mono-bold.woff2'],
    });
    expect(files).toContainEqual({
      path: 'src/styles/fonts/mono.woff2',
      imports: [],
    });
  });

  it('derives the name of a shared module whose default name another takes, with a warning', async () => {
    writeFile('src/lib/index.ts', 'export const a = 1;\n');
    writeFile('vendor/lib/index.ts', 'export const b = 2;\n');
    writeConfiguration({
      targets: ['react'],
      add: {
        ownership: 'full',
        shared: [{ source: 'src/lib' }, { source: 'vendor/lib' }],
      },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(
      readManifest().shared.map((entry: { name: string }) => entry.name)
    ).toEqual(['lib', 'vendor-lib']);
    expect(messages()).toContain(
      "scaffold-ui-kit.json: warning: add.shared[1] takes the name 'vendor-lib', since another shared module is named 'lib'; give it a 'name' of its own"
    );
  });

  it('warns of a shared source that does not exist and leaves it out', async () => {
    writeConfiguration({
      targets: ['react'],
      add: { shared: [{ source: 'src/missing' }] },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(messages()).toContain(
      "scaffold-ui-kit.json: warning: add.shared[0] names 'src/missing', which does not exist in the kit; it is left out of the manifest"
    );
    expect(readManifest().shared).toEqual([]);
  });
});
