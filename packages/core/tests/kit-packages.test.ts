import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCommand, diagnoseKit } from '../src/commands/build';
import { validateConfiguration } from '../src/configuration';
import { packageOfPath, targetPackageExports } from '../src/kit-packages';
import { scaffoldKit } from '../src/scaffold';

// Kits are scaffolded inside the package directory, so the example
// templates' `@js-template-engine/types` import resolves through the
// workspace's node_modules when jiti loads them.
const packageDirectory = join(__dirname, '..');

let parentDirectory: string;
let kitDirectory: string;

const at = (...parts: string[]): string => join(parentDirectory, ...parts);
const writeFile = (path: string, content: string): void => {
  mkdirSync(dirname(at(path)), { recursive: true });
  writeFileSync(at(path), content);
};
const readJson = (path: string) => JSON.parse(readFileSync(at(path), 'utf8'));
const messages = (): string[] =>
  vi
    .mocked(console.error)
    .mock.calls.map((call) => String(call[0]))
    .concat(vi.mocked(console.log).mock.calls.map((call) => String(call[0])));

const configuration = {
  name: 'acme',
  targets: ['react', 'vue'],
  styling: [],
  stylesheetPlacement: 'separate-file',
  stylingLanguage: 'scss',
  stylesheetLink: 'both',
  loadPaths: ['../styles/src'],
  packages: {
    react: { name: '@acme/react', directory: '../react' },
    vue: { name: '@acme/vue', directory: '../vue' },
    styles: { name: '@acme/styles', directory: '../styles' },
  },
  add: {
    ownership: 'partial',
    shared: [
      { name: 'scripts', source: 'src/scripts' },
      { name: 'styles', source: '../styles/src/styles' },
    ],
  },
};

const writeConfiguration = (extra: Record<string, unknown> = {}): void =>
  writeFile(
    'core/scaffold-ui-kit.json',
    JSON.stringify({ ...configuration, ...extra }, null, 2)
  );

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  parentDirectory = mkdtempSync(join(packageDirectory, '.test-packages-'));
  scaffoldKit({
    projectName: 'core',
    parentDirectory,
    targets: ['react', 'vue'],
    styling: [],
    includeExamples: true,
    configurationFile: 'scaffold-ui-kit.json',
  });
  kitDirectory = at('core');
  writeConfiguration();
  const kitPackage = readJson('core/package.json');
  kitPackage.name = '@acme/core';
  kitPackage.exports = {
    './scripts': './src/scripts/index.ts',
    './scripts/*': './src/scripts/*.ts',
  };
  kitPackage.files = ['src/scripts'];
  kitPackage.devDependencies['tiny-lib'] = '^2.0.0';
  writeFile('core/package.json', JSON.stringify(kitPackage, null, 2));
  writeFile('core/src/scripts/index.ts', 'export const id = () => "x";\n');
  // A component whose stylesheet compiles against the styles package.
  writeFile(
    'core/src/components/chip.ts',
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
  // A driver importing a package the kit root lists.
  writeFile(
    'core/src/drivers/react/Fancy.tsx',
    "import { tiny } from 'tiny-lib';\nimport { Chip } from './Chip';\n\nexport function Fancy() { tiny(); return <Chip />; }\n"
  );
  writeFile('styles/src/styles/_tokens.scss', '$chip-gap: 4px;\n');
  writeFile(
    'styles/package.json',
    JSON.stringify(
      {
        name: '@acme/styles',
        version: '0.1.0',
        files: ['dist', 'src'],
        exports: {
          './stylesheets/*.css': './dist/stylesheets/*.css',
          './stylesheets/*.scss': './dist/stylesheets/*.scss',
          './styles/*': './src/styles/*.scss',
        },
      },
      null,
      2
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(parentDirectory, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('a kit built into packages', () => {
  it("copies an _index.scss driver into the target package, the styles package taking the target's index", async () => {
    writeFile('core/src/drivers/react/_index.scss', '// a driver\n');
    await buildCommand(kitDirectory);
    expect(messages().filter((line) => line.includes('error'))).toEqual([]);
    expect(process.exitCode).toBeUndefined();
    expect(readFileSync(at('react/dist/_index.scss'), 'utf8')).toBe(
      '// a driver\n'
    );
    expect(readFileSync(at('styles/dist/react/_index.scss'), 'utf8')).toContain(
      '@use "../stylesheets/Chip"'
    );
  });

  it('writes each target into its package and the stylesheets once into the styles package', async () => {
    await buildCommand(kitDirectory);
    expect(messages().filter((line) => line.includes('error'))).toEqual([]);
    expect(process.exitCode).toBeUndefined();

    expect(existsSync(at('react/dist/Button.tsx'))).toBe(true);
    expect(existsSync(at('react/dist/Fancy.tsx'))).toBe(true);
    expect(existsSync(at('vue/dist/Button.vue'))).toBe(true);
    expect(existsSync(at('core/dist/react'))).toBe(false);
    expect(existsSync(at('react/dist/Button.scss'))).toBe(false);

    // The same sheet on every target is written once, beside its CSS.
    expect(existsSync(at('styles/dist/stylesheets/Chip.scss'))).toBe(true);
    expect(existsSync(at('styles/dist/stylesheets/Chip.css'))).toBe(true);
    expect(
      readFileSync(at('styles/dist/stylesheets/Chip.css'), 'utf8')
    ).toContain('gap:4px');
    expect(readFileSync(at('styles/dist/react/_index.scss'), 'utf8')).toContain(
      '@use "../stylesheets/Chip" as stylesheets-chip;'
    );

    // A linked module imports its stylesheet from the styles package.
    expect(readFileSync(at('react/dist/linked/Chip.ts'), 'utf8')).toContain(
      "import '@acme/styles/stylesheets/Chip.css';"
    );
  });

  it("writes each target package's package.json, keeping the author's fields", async () => {
    writeFile(
      'react/package.json',
      JSON.stringify(
        {
          name: '@acme/react',
          description: 'React components',
          license: 'MIT',
        },
        null,
        2
      )
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    const reactPackage = readJson('react/package.json');
    expect(reactPackage).toMatchObject({
      name: '@acme/react',
      description: 'React components',
      license: 'MIT',
      version: '0.1.0',
      type: 'module',
      files: ['bin', 'dist'],
      bin: { 'acme-react': './bin/add.mjs' },
      exports: targetPackageExports('react', 'both'),
      peerDependencies: { '@acme/styles': '0.1.0', react: '^19.0.0' },
    });
    expect(reactPackage.dependencies).toMatchObject({
      '@acme/core': '0.1.0',
      'tiny-lib': '^2.0.0',
    });
    expect(reactPackage.dependencies['@scaffold-ui-kit/add']).toBeDefined();
    expect(existsSync(at('react/bin/add.mjs'))).toBe(true);

    const vuePackage = readJson('vue/package.json');
    expect(vuePackage.name).toBe('@acme/vue');
    expect(vuePackage.bin).toEqual({ 'acme-vue': './bin/add.mjs' });
    expect(vuePackage.peerDependencies).toEqual({
      '@acme/styles': '0.1.0',
      vue: '^3.5.0',
    });
    expect(vuePackage.dependencies['tiny-lib']).toBeUndefined();
  });

  it('writes a manifest into each target package naming the package of every file', async () => {
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(at('core/dist/scaffold-ui-kit-manifest.json'))).toBe(
      false
    );

    const manifest = readJson('react/dist/scaffold-ui-kit-manifest.json');
    expect(manifest).toMatchObject({
      kit: { name: 'acme', version: '0.1.0' },
      packages: {
        kit: '@acme/core',
        styles: '@acme/styles',
        targets: { react: '@acme/react', vue: '@acme/vue' },
      },
      targets: ['react'],
      ownership: 'partial',
      consumerConfiguration: 'acme.json',
      loadPaths: [{ package: '@acme/styles', path: 'src' }],
    });
    expect(manifest.components.Chip.files).toEqual({
      react: {
        component: {
          path: 'dist/Chip.tsx',
          import: '@acme/react/unlinked/Chip',
          imports: expect.any(Array),
        },
        stylesheet: {
          package: '@acme/styles',
          path: 'dist/stylesheets/Chip.scss',
          import: '@acme/styles/stylesheets/Chip.scss',
          imports: ['styles/tokens'],
        },
        css: {
          package: '@acme/styles',
          path: 'dist/stylesheets/Chip.css',
          import: '@acme/styles/stylesheets/Chip.css',
          imports: [],
        },
        linked: {
          path: 'dist/linked/Chip.ts',
          import: '@acme/react/Chip',
          imports: ['@acme/styles/stylesheets/Chip.css', '../Chip'],
        },
      },
    });
    expect(manifest.shared).toEqual([
      expect.objectContaining({
        name: 'scripts',
        package: '@acme/core',
        source: 'src/scripts',
        import: '@acme/core/scripts',
      }),
      expect.objectContaining({
        name: 'styles',
        package: '@acme/styles',
        source: 'src/styles',
        files: [
          {
            path: 'src/styles/_tokens.scss',
            import: '@acme/styles/styles/_tokens',
            imports: [],
          },
        ],
      }),
    ]);
    expect(readJson('vue/dist/scaffold-ui-kit-manifest.json').targets).toEqual([
      'vue',
    ]);
  });

  it('warns that the kit root still has the consumer command', async () => {
    await buildCommand(kitDirectory);
    expect(messages()).toContainEqual(
      expect.stringMatching(
        /^bin\/add\.mjs: warning: the kit root still has the consumer command, .*\(acme-react, acme-vue\)/
      )
    );
  });

  it('removes what a target package no longer builds', async () => {
    await buildCommand(kitDirectory);
    expect(existsSync(at('react/dist/Chip.tsx'))).toBe(true);
    rmSync(at('core/src/drivers'), { recursive: true });
    rmSync(at('core/src/components/chip.ts'));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(at('react/dist/Chip.tsx'))).toBe(false);
    expect(existsSync(at('react/dist/linked/Chip.ts'))).toBe(false);
    expect(existsSync(at('styles/dist/stylesheets/Chip.scss'))).toBe(false);
    expect(existsSync(at('styles/dist/stylesheets/Chip.css'))).toBe(false);
    expect(existsSync(at('react/dist/Button.tsx'))).toBe(true);
  });

  it('fails when the styles package publishes no export a linked module can import', async () => {
    const stylesPackage = readJson('styles/package.json');
    stylesPackage.exports = { './styles/*': './src/styles/*.scss' };
    writeFile('styles/package.json', JSON.stringify(stylesPackage));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(messages()).toContainEqual(
      expect.stringMatching(
        /^\.\.\/styles\/package\.json: error: no export reaches dist\/stylesheets\/.*\.css.*, which the linked modules import; for example, add "\.\/stylesheets\/\*\.css": "\.\/dist\/stylesheets\/\*\.css" to "exports"$/
      )
    );
  });

  it("fails on a template's relative import of a stylesheet the build moved, under both saying the linked module brings it", async () => {
    const chipPath = 'core/src/components/chip.ts';
    writeFile(
      chipPath,
      readFileSync(at(chipPath), 'utf8').replace(
        '  children: [',
        '  extensions: { react: { imports: ["import \'./Chip.css\';"] } },\n  children: ['
      )
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(messages()).toContain(
      "../react/dist/Chip.tsx: error: imports './Chip.css', a stylesheet the build writes into the styles package @acme/styles, so nothing is there to import; remove the import, as the linked module brings the stylesheet"
    );
    // A failed build writes no package.json for the target.
    expect(existsSync(at('react/package.json'))).toBe(false);
  });

  it("names the styles package's export for a moved stylesheet under stylesheetLink none", async () => {
    writeConfiguration({ stylesheetLink: 'none' });
    const chipPath = 'core/src/components/chip.ts';
    writeFile(
      chipPath,
      readFileSync(at(chipPath), 'utf8').replace(
        '  children: [',
        '  extensions: { react: { imports: ["import \'./Chip.css\';"] } },\n  children: ['
      )
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(messages()).toContain(
      "../react/dist/Chip.tsx: error: imports './Chip.css', a stylesheet the build writes into the styles package @acme/styles, so nothing is there to import; remove the import, or import it as '@acme/styles/stylesheets/Chip.css'"
    );
  });

  it('fails on a relative import leading nowhere, or out of the package', async () => {
    writeFile(
      'core/src/drivers/react/Lost.tsx',
      "import './missing.css';\nimport '../../core/package.json';\n\nexport function Lost() { return null; }\n"
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(messages()).toContain(
      "../react/dist/Lost.tsx: error: imports './missing.css', which leads to no file in the package @acme/react, and a package is published alone; point it at a file the package holds, or import it from a package by name"
    );
    expect(messages()).toContain(
      "../react/dist/Lost.tsx: error: imports '../../core/package.json', which leads to no file in the package @acme/react, and a package is published alone; point it at a file the package holds, or import it from a package by name"
    );
  });

  it('counts a file the build no longer writes as gone', async () => {
    writeFile('core/src/drivers/react/Helper.ts', 'export const helper = 1;\n');
    writeFile(
      'core/src/drivers/react/Uses.tsx',
      "import { helper } from './Helper';\n\nexport function Uses() { return helper; }\n"
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    rmSync(at('core/src/drivers/react/Helper.ts'));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(
      messages().some((message) =>
        message.startsWith(
          "../react/dist/Uses.tsx: error: imports './Helper', which leads to no file"
        )
      )
    ).toBe(true);
  });

  it('keeps counting a file the last build wrote when the author changed it since', async () => {
    writeFile('core/src/drivers/react/Helper.ts', 'export const helper = 1;\n');
    writeFile(
      'core/src/drivers/react/Uses.tsx',
      "import { helper } from './Helper';\n\nexport function Uses() { return helper; }\n"
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    rmSync(at('core/src/drivers/react/Helper.ts'));
    writeFile('react/dist/Helper.ts', 'export const helper = 2;\n');
    await buildCommand(kitDirectory);
    expect(messages().filter((line) => line.includes('error:'))).toEqual([]);
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(at('react/dist/Helper.ts'))).toBe(true);
  });

  it('accepts the partial forms Sass finds, for a @use and not for an import', async () => {
    writeFile('vue/dist/_tokens.scss', '$gap: 1px;\n');
    writeFile('vue/dist/theme/_index.scss', '$mode: light;\n');
    writeFile(
      'core/src/drivers/vue/Sassy.vue',
      "<template><span /></template>\n<style lang=\"scss\">\n@use './tokens';\n@use './theme';\n</style>\n"
    );
    await buildCommand(kitDirectory);
    expect(messages().filter((line) => line.includes('error:'))).toEqual([]);
    expect(process.exitCode).toBeUndefined();

    writeFile(
      'core/src/drivers/vue/Scripted.vue',
      "<script setup>\nimport './tokens';\n</script>\n<template><span /></template>\n"
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(
      messages().some((message) =>
        message.startsWith(
          "../vue/dist/Scripted.vue: error: imports './tokens', which leads to no file"
        )
      )
    ).toBe(true);
  });

  it('accepts every relative import that resolves in the package', async () => {
    writeFile('core/src/drivers/react/Helper.ts', 'export const helper = 1;\n');
    writeFile(
      'core/src/drivers/react/widgets/index.ts',
      'export const widget = 1;\n'
    );
    writeFile(
      'core/src/drivers/react/state.svelte.ts',
      'export const state = 1;\n'
    );
    writeFile(
      'core/src/drivers/react/ambient.d.ts',
      'export type Ambient = string;\n'
    );
    writeFile(
      'core/src/drivers/react/module.mts',
      'export const moduled = 1;\n'
    );
    writeFile(
      'core/src/drivers/react/Uses.tsx',
      [
        "import { Chip } from './Chip';",
        "import { helper } from './Helper.js';",
        "import type { Helper } from './Helper';",
        "import raw from './Helper.ts?raw';",
        "import { widget } from './widgets';",
        "import { state } from './state.svelte';",
        "import type { Ambient } from './ambient';",
        "import { moduled } from './module';",
        "export { Chip as Alias } from './Chip';",
        '',
        "export function Uses() { import('./Helper'); return <Chip data-helper={helper} data-raw={raw} />; }",
        '',
      ].join('\n')
    );
    await buildCommand(kitDirectory);
    expect(messages().filter((line) => line.includes('error:'))).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it('fails on a bare import neither the target nor the kit root lists', async () => {
    const kitPackage = readJson('core/package.json');
    delete kitPackage.devDependencies['tiny-lib'];
    writeFile('core/package.json', JSON.stringify(kitPackage));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(messages()).toContain(
      "../react/dist/Fancy.tsx: error: imports 'tiny-lib', which neither packages.react.dependencies nor the kit root's package.json lists; add its version range to either"
    );
  });

  it("takes a target's own dependency and peer ranges over the defaults", async () => {
    writeConfiguration({
      packages: {
        ...configuration.packages,
        react: {
          name: '@acme/react',
          directory: '../react',
          dependencies: { 'tiny-lib': '3.1.0' },
          peerDependencies: { react: '>=18' },
        },
      },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const reactPackage = readJson('react/package.json');
    expect(reactPackage.dependencies['tiny-lib']).toBe('3.1.0');
    expect(reactPackage.peerDependencies.react).toBe('>=18');
  });

  it('keeps a workspace: spec for another package of the kit', async () => {
    writeFile(
      'react/package.json',
      JSON.stringify({
        name: '@acme/react',
        dependencies: { '@acme/core': 'workspace:*' },
        peerDependencies: { '@acme/styles': 'workspace:*' },
      })
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const reactPackage = readJson('react/package.json');
    expect(reactPackage.dependencies['@acme/core']).toBe('workspace:*');
    expect(reactPackage.peerDependencies['@acme/styles']).toBe('workspace:*');
  });

  it("fails when the styles package's sideEffects leaves out its stylesheets", async () => {
    const stylesPackage = readJson('styles/package.json');
    stylesPackage.sideEffects = false;
    writeFile('styles/package.json', JSON.stringify(stylesPackage));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(messages()).toContain(
      '../styles/package.json: error: "sideEffects" leaves out the stylesheets, so a bundler drops the linked components\' imports of them; list "**/*.css" in it, or remove it'
    );
  });

  it("fails on a component importing another target's package", async () => {
    writeFile(
      'core/src/drivers/react/Crossed.tsx',
      "import Chip from '@acme/vue/Chip.vue';\n\nexport function Crossed() { return Chip; }\n"
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(messages()).toContain(
      "../react/dist/Crossed.tsx: error: imports '@acme/vue', another target's package; a react component imports only the kit root's and the styles package's modules"
    );
  });

  it('adds no dependency for a type-only import', async () => {
    writeFile(
      'core/src/drivers/react/Typed.tsx',
      [
        "import type { Options } from 'types-only-lib';",
        "import { type Shape, type Size } from 'braced-types-lib';",
        "export type { Theme } from 'exported-types-lib';",
        "import { type Mixed, mixed } from 'mixed-lib';",
        '',
        'export function Typed(props: { options: Options; shape: Shape; size: Size }) { mixed(); return null; }',
        '',
      ].join('\n')
    );
    const kitPackage = readJson('core/package.json');
    kitPackage.devDependencies['types-only-lib'] = '^1.0.0';
    kitPackage.devDependencies['braced-types-lib'] = '^1.0.0';
    kitPackage.devDependencies['exported-types-lib'] = '^1.0.0';
    kitPackage.devDependencies['mixed-lib'] = '^1.0.0';
    writeFile('core/package.json', JSON.stringify(kitPackage));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const dependencies = readJson('react/package.json').dependencies;
    expect(dependencies['types-only-lib']).toBeUndefined();
    expect(dependencies['braced-types-lib']).toBeUndefined();
    expect(dependencies['exported-types-lib']).toBeUndefined();
    expect(dependencies['mixed-lib']).toBe('^1.0.0');
  });

  it('reads a binding named type, renamed, as a value import', async () => {
    writeFile(
      'core/src/drivers/react/Renamed.tsx',
      [
        "import { type as kind } from 'value-named-type-lib';",
        "import { type type as Kind } from 'type-named-type-lib';",
        '',
        'export function Renamed(props: { kind: Kind }) { kind(); return null; }',
        '',
      ].join('\n')
    );
    const kitPackage = readJson('core/package.json');
    kitPackage.devDependencies['value-named-type-lib'] = '^1.0.0';
    kitPackage.devDependencies['type-named-type-lib'] = '^1.0.0';
    writeFile('core/package.json', JSON.stringify(kitPackage));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    const dependencies = readJson('react/package.json').dependencies;
    expect(dependencies['value-named-type-lib']).toBe('^1.0.0');
    expect(dependencies['type-named-type-lib']).toBeUndefined();
  });

  it("warns that a dropped target's package keeps its files", async () => {
    await buildCommand(kitDirectory);
    expect(existsSync(at('vue/dist/Button.vue'))).toBe(true);
    vi.mocked(console.error).mockClear();
    writeConfiguration({
      targets: ['react'],
      packages: {
        react: configuration.packages.react,
        styles: configuration.packages.styles,
      },
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(at('vue/dist/Button.vue'))).toBe(true);
    expect(messages()).toContainEqual(
      expect.stringMatching(
        /^\.\.\/vue: warning: the build no longer writes into this directory, so the \d+ files the last build wrote there \(\.\.\/vue\/dist\/\S+ and \d+ more\) are left in place and no longer tracked$/
      )
    );
    // The styles package is still built into, so its vue output is removed.
    expect(existsSync(at('styles/dist/vue/_index.scss'))).toBe(false);
  });

  it("names a Svelte warning by the file's path in the target's package", async () => {
    mkdirSync(at('core/node_modules'), { recursive: true });
    symlinkSync(
      realpathSync(join(packageDirectory, 'node_modules')) + '/svelte',
      at('core/node_modules/svelte'),
      'dir'
    );
    writeFile(
      'core/src/components/Track.json',
      JSON.stringify({
        type: 'component',
        name: 'Track',
        props: { onPress: { type: '() => void' } },
        children: [
          {
            type: 'element',
            tag: 'div',
            events: [{ name: 'pointerdown', handler: 'onPress' }],
          },
        ],
      })
    );
    writeConfiguration({
      targets: ['react', 'vue', 'svelte'],
      packages: {
        ...configuration.packages,
        svelte: { name: '@acme/svelte', directory: '../svelte' },
      },
    });
    await buildCommand(kitDirectory);
    expect(messages()).toContainEqual(
      expect.stringMatching(
        /a11y_no_static_element_interactions: .*\(at \.\.\/svelte\/dist\/Track\.svelte:\d+:\d+\)$/
      )
    );
    const report = await diagnoseKit(kitDirectory);
    expect(report.warnings).toContainEqual(
      expect.stringMatching(/\(at \.\.\/svelte\/dist\/Track\.svelte:\d+:\d+\)$/)
    );
  });

  it('fails when a package.json names another package than the configuration', async () => {
    writeFile('vue/package.json', JSON.stringify({ name: '@acme/view' }));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(messages()).toContain(
      "../vue/package.json: error: names the package '@acme/view', but packages.vue names it '@acme/vue'; make them the same"
    );
  });
});

describe('the packages configuration', () => {
  const valid = {
    name: 'acme',
    targets: ['react'],
    styling: [],
    stylesheetPlacement: 'separate-file',
    stylesheetLink: 'both',
    packages: {
      react: { name: '@acme/react', directory: '../react' },
      styles: { name: '@acme/styles', directory: '../styles' },
    },
  };

  it('accepts a package per target and a styles package', () => {
    expect(validateConfiguration(valid)).toEqual([]);
  });

  it('needs an entry per target and a styles entry', () => {
    expect(
      validateConfiguration({
        ...valid,
        targets: ['react', 'vue'],
        packages: { react: valid.packages.react },
      })
    ).toEqual([
      "'packages' has no entry for the vue target; add 'vue': { name, directory }",
      "'packages' needs a 'styles' entry: the package the component stylesheets are written into",
    ]);
  });

  it('rejects the html target, a component stylesheet link and overlapping directories', () => {
    expect(
      validateConfiguration({
        ...valid,
        targets: ['react', 'html'],
        stylesheetLink: 'component',
        packages: {
          react: { name: '@acme/react', directory: '../ui' },
          styles: { name: '@acme/react', directory: '../ui/styles' },
        },
      })
    ).toEqual([
      "'packages' builds the scripted targets into packages of their own; the html target is built only into a single-package kit, so remove 'html' from 'targets' or 'packages'",
      "'packages.styles.name' is '@acme/react', as 'packages.react.name' is; each package needs a name of its own",
      "'packages.styles.directory' and 'packages.react.directory' overlap; each package needs a directory of its own, neither inside the other",
      "'packages' requires 'stylesheetLink' of 'both' or 'none': the stylesheets are written into the styles package, so a component cannot link its own beside it",
    ]);
  });

  it('tells directories apart by how far they climb', () => {
    expect(
      validateConfiguration({
        ...valid,
        packages: {
          react: { name: '@acme/react', directory: '../react' },
          styles: { name: '@acme/styles', directory: '../../react' },
        },
      })
    ).toEqual([]);
  });

  it('lets a shared module lie in another package', () => {
    expect(
      validateConfiguration({
        ...valid,
        add: { shared: [{ source: '../styles/src/styles' }] },
      })
    ).toEqual([]);
    expect(
      validateConfiguration({
        ...valid,
        packages: undefined,
        add: { shared: [{ source: '../styles/src/styles' }] },
      })
    ).toEqual([
      "'add.shared[0]'.source must be a relative path that stays inside its directory",
    ]);
  });
});

describe('packageOfPath', () => {
  it('finds the package holding a file most closely', () => {
    const packages = [
      { name: 'root', directory: '/repository' },
      { name: 'nested', directory: '/repository/packages/react' },
    ];
    expect(
      packageOfPath(packages, '/repository/packages/react/dist/Button.tsx')
    ).toEqual({ package: packages[1], path: 'dist/Button.tsx' });
    expect(packageOfPath(packages, '/repository/src/index.ts')).toEqual({
      package: packages[0],
      path: 'src/index.ts',
    });
    expect(packageOfPath(packages, '/elsewhere/index.ts')).toBeUndefined();
  });
});
