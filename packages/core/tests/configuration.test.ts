import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  defineKit,
  findConfigurationFile,
  loadConfiguration,
  resolveKitConfiguration,
  validateConfiguration,
} from '../src/configuration';

const configurationFileName = 'scaffold-ui-kit.json';

const validConfiguration = {
  name: 'my-ui-kit',
  targets: ['react', 'html'],
  styling: ['bem'],
};

describe('validateConfiguration', () => {
  it('accepts a minimal configuration', () => {
    expect(validateConfiguration(validConfiguration)).toEqual([]);
  });

  it('accepts an add block with shared modules and notes', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        add: {
          shared: [
            { source: 'src/scripts', specifier: 'my-ui-kit/scripts' },
            {
              source: 'src/styles',
              destination: 'theme/styles',
              exclude: ['index.scss', 'generated/bundle.css'],
            },
            { source: 'src/kit-config.scss' },
          ],
          notes: ['Add the output directory to your sass loadPaths.'],
        },
      })
    ).toEqual([]);
    expect(validateConfiguration({ ...validConfiguration, add: {} })).toEqual(
      []
    );
  });

  it('rejects a malformed add block', () => {
    expect(validateConfiguration({ ...validConfiguration, add: [] })).toEqual([
      "'add' must be an object with optional 'shared', 'notes', 'consumerConfiguration' and 'ownership'",
    ]);
    expect(
      validateConfiguration({
        ...validConfiguration,
        add: { shared: 'src/scripts', notes: 'one' },
      })
    ).toEqual([
      "'add.shared' must be an array",
      "'add.notes' must be an array of strings",
    ]);
    expect(
      validateConfiguration({
        ...validConfiguration,
        add: {
          shared: [
            {},
            { source: '../outside' },
            { source: '/absolute' },
            { source: 'src/scripts', destination: '', specifier: 3 },
            { source: 'src/styles', exclude: ['../escape'] },
          ],
        },
      })
    ).toEqual([
      "'add.shared[0]'.source is required",
      "'add.shared[1]'.source must be a relative path that stays inside its directory",
      "'add.shared[2]'.source must be a relative path that stays inside its directory",
      "'add.shared[3]'.destination must be a non-empty string",
      "'add.shared[3]'.specifier must be a non-empty string",
      "'add.shared[4]'.exclude must be an array of relative paths inside the source",
    ]);
  });

  it('accepts the placement and the per-extension blocks', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        targets: ['react', 'svelte'],
        styling: ['bem', 'tailwind'],
        stylesheetPlacement: 'separate-file',
        bem: {
          elementSeparator: '-',
          modifierSeparator: '_',
          mode: 'runtime',
          importSource: '@scope/bem',
        },
        tailwind: {
          output: 'styles',
          darkSelector: '[data-mode="dark"]',
          convertStyles: true,
        },
        svelte: { mode: 'runes' },
      })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, bem: {}, tailwind: {} })
    ).toEqual([
      "'tailwind' is set, but 'styling' does not list tailwind; add the extension or remove the block",
    ]);
  });

  it('still accepts the deprecated flat keys and stylingStrategy', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        stylingStrategy: 'separate-file',
        scriptingStrategy: 'in-file',
        bemElementSeparator: '-',
        bemModifierSeparator: '_',
      })
    ).toEqual([]);
  });

  it('refuses an option set under both spellings, naming the one to keep', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        targets: ['svelte'],
        styling: ['bem', 'tailwind'],
        stylingStrategy: 'separate-file',
        stylesheetPlacement: 'separate-file',
        bemMode: 'runtime',
        bem: { mode: 'runtime' },
        tailwindOutput: 'styles',
        tailwind: { output: 'classes' },
        svelteMode: 'runes',
        svelte: { mode: 'runes' },
      })
    ).toEqual([
      "'bemMode' and 'bem.mode' are both set; keep bem.mode",
      "'tailwindOutput' and 'tailwind.output' are both set; keep tailwind.output",
      "'svelteMode' and 'svelte.mode' are both set; keep svelte.mode",
      "'stylingStrategy' and 'stylesheetPlacement' are both set; keep stylesheetPlacement",
    ]);
  });

  it('refuses a block for an extension the kit does not apply, and a svelte block without the target', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        styling: ['tailwind'],
        bem: { mode: 'runtime' },
        svelte: { mode: 'runes' },
      })
    ).toEqual([
      "'bem' is set, but 'styling' does not list bem; add the extension or remove the block",
      "'svelte' is set, but 'targets' does not list svelte; add the target or remove the block",
    ]);
    const { styling, ...withoutStyling } = validConfiguration;
    expect(
      validateConfiguration({
        ...withoutStyling,
        tailwind: { output: 'styles' },
      })
    ).toEqual([
      "'tailwind' is set, but 'styling' does not list tailwind; add the extension or remove the block",
    ]);
  });

  it('reports an unknown key in a block, a block that is not an object, and a bad value under either spelling', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        targets: ['svelte'],
        styling: ['bem', 'tailwind'],
        bem: { modes: 'runtime', mode: 'calls' },
        tailwind: 'styles',
        svelte: { mode: 'classic' },
      })
    ).toEqual([
      "unknown key 'bem.modes'; the 'bem' block takes elementSeparator, modifierSeparator, mode, importSource",
      "'tailwind' must be an object of the tailwind extension's options: output, darkSelector, convertStyles",
      "'bem.mode' must be one of literal, runtime",
      "'svelte.mode' must be one of legacy, runes",
    ]);
    expect(
      validateConfiguration({
        ...validConfiguration,
        styling: ['tailwind'],
        tailwind: { darkSelector: '', convertStyles: 'yes' },
        bemImportSource: 9,
      })
    ).toEqual([
      "'bemImportSource' must be a string",
      "'tailwind.darkSelector' must be a selector, such as '[data-mode=\"dark\"]', with & in every member of a list or in none",
      "'tailwind.convertStyles' must be a boolean",
    ]);
  });

  it('accepts stylesheetLink alongside the separate-file placement', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        stylesheetPlacement: 'separate-file',
        stylesheetLink: 'none',
      })
    ).toEqual([]);
    expect(
      validateConfiguration({
        ...validConfiguration,
        stylingStrategy: 'separate-file',
        stylingLanguage: 'scss',
        stylesheetLink: 'both',
        compiledStylesheetDirectory: 'dist/components',
      })
    ).toEqual([]);
    expect(
      validateConfiguration({
        ...validConfiguration,
        stylesheetLink: 'component',
      })
    ).toEqual([]);
  });

  it('refuses an extensions key, pointing to the preview block', () => {
    for (const extensions of [{ other: 1 }, { preview: { shell: 'x' } }]) {
      expect(
        validateConfiguration({ ...validConfiguration, extensions })
      ).toEqual([
        "unknown key 'extensions'; the preview's settings go in a top-level 'preview' block",
      ]);
    }
  });

  it('takes $schema, which an editor reads', () => {
    expect(
      validateConfiguration({ ...validConfiguration, $schema: './schema.json' })
    ).toEqual([]);
  });

  it('leaves unknown top-level keys to the reader under unknownTopLevelKeys: warning, but not unknown keys inside a block', () => {
    expect(
      validateConfiguration(
        { ...validConfiguration, svelteModes: [], add: { notess: [] } },
        { unknownTopLevelKeys: 'warning' }
      )
    ).toEqual([expect.stringMatching(/^unknown key 'add.notess'/)]);
  });

  it('accepts a preview block and leaves its keys to the preview', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        preview: { anything: true },
      })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, preview: 'yes' })
    ).toEqual(["'preview' must be an object of the preview's settings"]);
  });

  it('accepts parts as component names to lists of part names', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        parts: { DashboardShell: ['DashboardShellHeader'], Empty: [] },
      })
    ).toEqual([]);
  });

  it('refuses parts that are not component names to lists of part names', () => {
    const problem =
      "'parts' must be an object of component names to lists of part names";
    for (const parts of [
      ['DashboardShellHeader'],
      'DashboardShell',
      null,
      { DashboardShell: 'DashboardShellHeader' },
      { DashboardShell: [''] },
      { DashboardShell: [3] },
      { DashboardShell: [' '] },
    ]) {
      expect(validateConfiguration({ ...validConfiguration, parts })).toEqual([
        problem,
      ]);
    }
  });

  it('refuses a root listed as its own part and a part listed twice', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        parts: { Shell: ['Shell'], Panel: ['PanelHeader', 'PanelHeader'] },
      })
    ).toEqual([
      "'parts.Shell' lists 'Shell' as its own part",
      "'parts.Panel' lists 'PanelHeader' twice",
    ]);
  });

  it('reports each unknown top-level key with the keys the configuration takes', () => {
    const problems = validateConfiguration({
      ...validConfiguration,
      svelteModes: ['legacy', 'runes'],
      extensionsX: { preview: {} },
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(
      /^unknown key 'svelteModes'; the configuration takes name, targets, packages, styling, bem, tailwind, svelte, stylesheetPlacement, .*loadPaths, add, parts, preview$/
    );
    expect(problems[1]).toMatch(/^unknown key 'extensionsX'; /);
    expect(problems[0].split('takes ')[1]).not.toMatch(
      /scripting|svelteMode|bemMode|tailwindOutput|stylingStrategy/
    );
  });

  it('reports unknown keys in the add block, a shared module and a stylingLayer object', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        add: {
          shared: [{ source: 'src/scripts', specifer: 'my-ui-kit/scripts' }],
          note: ['Import the theme once.'],
        },
        stylingLayer: { name: 'kit', orders: ['kit'] },
      })
    ).toEqual([
      "unknown key 'stylingLayer.orders'; the object form of 'stylingLayer' takes name, order, owned",
      "unknown key 'add.note'; the 'add' block takes shared, notes, consumerConfiguration, ownership",
      "unknown key 'add.shared[0].specifer'; a shared module takes name, source, copy, exclude",
    ]);
  });

  it('accepts the add block with named modules, ownership and a consumer configuration name', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        add: {
          shared: [
            { name: 'scripts', source: 'src/scripts', copy: 'reached' },
            { source: 'src/styles', copy: 'all', exclude: ['index.scss'] },
          ],
          notes: ['Import the theme once.'],
          consumerConfiguration: 'my-kit.json',
          ownership: 'full',
        },
      })
    ).toEqual([]);
  });

  it('accepts two shared modules whose default names collide, which the build names apart', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        add: { shared: [{ source: 'src/lib' }, { source: 'other/lib' }] },
      })
    ).toEqual([]);
  });

  it('still accepts the deprecated destination and specifier of a shared module', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        add: {
          shared: [
            {
              source: 'src/scripts',
              destination: 'scripts',
              specifier: 'my-ui-kit/scripts',
            },
          ],
        },
      })
    ).toEqual([]);
  });

  it('accepts an owned layer after the components layer', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        stylingLayer: {
          name: 'kit.components',
          order: ['kit.reset', 'kit.components', 'kit.owned'],
          owned: 'kit.owned',
        },
      })
    ).toEqual([]);
  });

  it('accepts a stylingLayer name or object', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        stylingLayer: 'kit.components',
      })
    ).toEqual([]);
    expect(
      validateConfiguration({
        ...validConfiguration,
        stylingLayer: {
          name: 'kit.components',
          order: ['kit.reset', 'kit.components'],
        },
      })
    ).toEqual([]);
  });

  it('accepts both tailwindOutput values under the deprecated key', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        tailwindOutput: 'classes',
      })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, tailwindOutput: 'styles' })
    ).toEqual([]);
  });

  it('accepts a selector for tailwindDarkSelector', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        tailwindDarkSelector: '[data-mode="dark"]',
      })
    ).toEqual([]);
  });

  it('accepts a boolean tailwindConvertStyles', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        tailwindConvertStyles: true,
      })
    ).toEqual([]);
  });

  it('accepts both stylingLanguage values and rejects others', () => {
    expect(
      validateConfiguration({ ...validConfiguration, stylingLanguage: 'css' })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, stylingLanguage: 'scss' })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, stylingLanguage: 'less' })
    ).toEqual(["'stylingLanguage' must be one of css, scss"]);
  });

  it('accepts both scriptingLanguage values and rejects others', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        scriptingLanguage: 'javascript',
      })
    ).toEqual([]);
    expect(
      validateConfiguration({
        ...validConfiguration,
        scriptingLanguage: 'typescript',
      })
    ).toEqual([]);
    expect(
      validateConfiguration({
        ...validConfiguration,
        scriptingLanguage: 'coffeescript',
      })
    ).toEqual(["'scriptingLanguage' must be one of javascript, typescript"]);
  });

  it('accepts both bemMode values and an importSource under the deprecated keys, rejecting others', () => {
    expect(
      validateConfiguration({ ...validConfiguration, bemMode: 'literal' })
    ).toEqual([]);
    expect(
      validateConfiguration({
        ...validConfiguration,
        bemMode: 'runtime',
        bemImportSource: '@scope/bem',
      })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, bemMode: 'calls' })
    ).toEqual(["'bemMode' must be one of literal, runtime"]);
  });

  it('accepts both svelteMode values under the deprecated key, rejecting others', () => {
    expect(
      validateConfiguration({ ...validConfiguration, svelteMode: 'legacy' })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, svelteMode: 'runes' })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, svelteMode: 'classic' })
    ).toEqual(["'svelteMode' must be one of legacy, runes"]);
  });

  it('accepts an empty styling list and a missing one', () => {
    expect(
      validateConfiguration({ ...validConfiguration, styling: [] })
    ).toEqual([]);
    const { styling, ...withoutStyling } = validConfiguration;
    expect(validateConfiguration(withoutStyling)).toEqual([]);
  });

  it.each([
    [null, 'must be an object'],
    [[], 'must be an object'],
    [{ targets: ['react'] }, "'name'"],
    [{ name: 'kit' }, "'targets' is required"],
    [{ name: 'kit', targets: [] }, 'at least one'],
    [{ name: 'kit', targets: ['angular'] }, "unknown 'angular'"],
    [{ ...validConfiguration, styling: ['scss'] }, "unknown 'scss'"],
    [{ ...validConfiguration, stylingStrategy: 'in-line' }, 'stylingStrategy'],
    [
      { ...validConfiguration, stylesheetPlacement: 'in-line' },
      "'stylesheetPlacement' must be one of inline, in-file, separate-file",
    ],
    [{ ...validConfiguration, tailwindOutput: 'css' }, 'tailwindOutput'],
    [
      { ...validConfiguration, tailwindConvertStyles: 'yes' },
      'tailwindConvertStyles',
    ],
    [
      { ...validConfiguration, tailwindDarkSelector: '' },
      'tailwindDarkSelector',
    ],
    [
      { ...validConfiguration, tailwindDarkSelector: '@media print' },
      'tailwindDarkSelector',
    ],
    [
      {
        ...validConfiguration,
        tailwindDarkSelector: '.dark &, [data-mode="dark"]',
      },
      'with & in every member of a list or in none',
    ],
    [{ ...validConfiguration, bemElementSeparator: 7 }, 'bemElementSeparator'],
    [{ ...validConfiguration, bemImportSource: 9 }, 'bemImportSource'],
    [{ ...validConfiguration, stylesheetLink: 'never' }, 'stylesheetLink'],
    [
      { ...validConfiguration, stylesheetLink: 'none' },
      "requires 'stylesheetPlacement' of 'separate-file'",
    ],
    [
      { ...validConfiguration, stylesheetLink: 'both' },
      "'stylesheetLink' of 'both' requires 'stylesheetPlacement' of 'separate-file'",
    ],
    [
      {
        ...validConfiguration,
        stylingLanguage: 'scss',
        compiledStylesheetDirectory: 'dist/components',
      },
      "'compiledStylesheetDirectory' requires 'stylesheetPlacement' of 'separate-file'",
    ],
    [
      {
        ...validConfiguration,
        stylingLayer: { name: 'kit', order: ['kit'], owned: 'kit' },
      },
      "'stylingLayer.owned' must name a layer of its own",
    ],
    [
      {
        ...validConfiguration,
        stylingLayer: { name: 'kit', owned: 'kit.owned' },
      },
      "'stylingLayer.owned' requires 'stylingLayer.order', listing 'kit.owned' after 'kit'",
    ],
    [
      {
        ...validConfiguration,
        stylingLayer: {
          name: 'kit',
          order: ['kit.owned', 'kit'],
          owned: 'kit.owned',
        },
      },
      "'stylingLayer.order' must list 'kit.owned' after 'kit'",
    ],
    [
      {
        ...validConfiguration,
        stylingLayer: { name: 'kit', order: ['kit'], owned: 'kit.owned' },
      },
      "'stylingLayer.order' must list 'kit.owned' after 'kit'",
    ],
    [
      {
        ...validConfiguration,
        add: { shared: [{ source: 'src/lib', copy: 'some' }] },
      },
      "'add.shared[0]'.copy must be one of all, reached",
    ],
    [
      {
        ...validConfiguration,
        add: { shared: [{ source: 'src/lib', name: 'my/lib' }] },
      },
      "'add.shared[0]'.name must be letters, digits",
    ],
    [
      {
        ...validConfiguration,
        add: {
          shared: [
            { name: 'lib', source: 'src/lib' },
            { name: 'lib', source: 'other/lib' },
          ],
        },
      },
      "'add.shared[1]' is named 'lib', as 'add.shared[0]' is",
    ],
    [
      {
        ...validConfiguration,
        add: { consumerConfiguration: 'settings/kit.json' },
      },
      "'add.consumerConfiguration' must be a file name ending in .json",
    ],
    [
      { ...validConfiguration, add: { ownership: 'some' } },
      "'add.ownership' must be one of partial, full",
    ],
    [
      {
        ...validConfiguration,
        stylesheetPlacement: 'separate-file',
        stylesheetLink: 'both',
        compiledStylesheetDirectory: '../elsewhere',
      },
      "'compiledStylesheetDirectory' must be a directory inside the kit",
    ],
    [
      {
        ...validConfiguration,
        stylesheetPlacement: 'separate-file',
        stylesheetLink: 'both',
        compiledStylesheetDirectory: 'dist/stylesheets',
      },
      "'compiledStylesheetDirectory' has no effect unless 'stylingLanguage' is 'scss'",
    ],
    [
      {
        ...validConfiguration,
        stylingStrategy: 'separate-file',
        stylingLanguage: 'css',
        stylesheetLink: 'both',
        compiledStylesheetDirectory: 'dist/stylesheets',
      },
      "'compiledStylesheetDirectory' has no effect unless 'stylingLanguage' is 'scss'",
    ],
    [{ ...validConfiguration, stylingLayer: '' }, 'stylingLayer'],
    [
      { ...validConfiguration, stylingLayer: { order: ['a'] } },
      'stylingLayer.name',
    ],
    [
      {
        ...validConfiguration,
        stylingLayer: { name: 'kit', order: 'kit.base' },
      },
      'stylingLayer.order',
    ],
  ])('rejects %j', (value, messagePart) => {
    const problems = validateConfiguration(value);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(messagePart);
  });
});

describe('loadConfiguration', () => {
  let directory: string;

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('loads a valid configuration file', () => {
    directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-configuration-'));
    writeFileSync(
      join(directory, configurationFileName),
      JSON.stringify(validConfiguration)
    );
    expect(loadConfiguration(directory)).toEqual(validConfiguration);
  });

  it('reads a configuration without styling as applying none', () => {
    directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-configuration-'));
    const { styling: _styling, ...withoutStyling } = validConfiguration;
    writeFileSync(
      join(directory, configurationFileName),
      JSON.stringify(withoutStyling)
    );
    expect(loadConfiguration(directory)).toEqual({
      ...withoutStyling,
      styling: [],
    });
  });

  it('reports a missing configuration file', () => {
    directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-configuration-'));
    expect(() => loadConfiguration(directory)).toThrow(configurationFileName);
  });

  it('reports malformed JSON', () => {
    directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-configuration-'));
    writeFileSync(join(directory, configurationFileName), '{not json');
    expect(() => loadConfiguration(directory)).toThrow('not valid JSON');
  });

  it('refuses a configuration with an unknown key', () => {
    directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-configuration-'));
    writeFileSync(
      join(directory, configurationFileName),
      JSON.stringify({ ...validConfiguration, svelteModes: ['runes'] })
    );
    expect(() => loadConfiguration(directory)).toThrow(
      /is invalid:\n {2}- unknown key 'svelteModes'; the configuration takes name, /
    );
  });

  it('reports every validation problem', () => {
    directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-configuration-'));
    writeFileSync(
      join(directory, configurationFileName),
      JSON.stringify({ targets: ['angular'] })
    );
    expect(() => loadConfiguration(directory)).toThrow(/name.*\n.*angular/s);
  });
});

describe('resolveKitConfiguration', () => {
  let directory: string;

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  /** A kit root holding each file, by its path relative to the root. */
  function kitWith(files: Record<string, string>): string {
    directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-resolve-'));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(directory, path, '..'), { recursive: true });
      writeFileSync(join(directory, path), content);
    }
    return directory;
  }

  const configurationModule = join(__dirname, '../src/configuration.ts');

  it('loads scaffold-ui-kit.ts, whose default export is defineKit', () => {
    const kit = kitWith({
      'scaffold-ui-kit.ts': `import { defineKit } from ${JSON.stringify(configurationModule)};\nexport default defineKit(${JSON.stringify(validConfiguration)});\n`,
    });
    const resolved = resolveKitConfiguration(kit);
    expect(resolved.configuration).toEqual(validConfiguration);
    expect(resolved.file).toEqual({
      path: join(kit, 'scaffold-ui-kit.ts'),
      name: 'scaffold-ui-kit.ts',
      legacy: false,
    });
    expect(resolved.warnings).toEqual([]);
  });

  it('keeps a function in a scaffold-ui-kit.ts configuration, for the tool that reads it', () => {
    const kit = kitWith({
      'scaffold-ui-kit.ts': `export default { ...${JSON.stringify(validConfiguration)}, preview: { labels: { generatedScenario: (prop: string) => prop.toUpperCase() } } };\n`,
    });
    const preview = resolveKitConfiguration(kit).configuration.preview as {
      labels: { generatedScenario: (prop: string) => string };
    };
    expect(preview.labels.generatedScenario('tone')).toBe('TONE');
  });

  it('reads an edited scaffold-ui-kit.ts afresh', () => {
    const kit = kitWith({
      'scaffold-ui-kit.ts': `export default ${JSON.stringify(validConfiguration)};\n`,
    });
    expect(loadConfiguration(kit).name).toBe('my-ui-kit');
    writeFileSync(
      join(kit, 'scaffold-ui-kit.ts'),
      `export default ${JSON.stringify({ ...validConfiguration, name: 'renamed' })};\n`
    );
    expect(loadConfiguration(kit).name).toBe('renamed');
  });

  it('reports a module with no configuration as its default export', () => {
    const kit = kitWith({ 'scaffold-ui-kit.ts': 'export const name = 1;\n' });
    expect(() => loadConfiguration(kit)).toThrow(
      /scaffold-ui-kit\.ts is invalid|must default-export the kit configuration/
    );
  });

  it('refuses two configuration files in the kit root', () => {
    const kit = kitWith({
      'scaffold-ui-kit.ts': 'export default {};\n',
      'scaffold-ui-kit.json': '{}',
    });
    expect(() => findConfigurationFile(kit)).toThrow(
      'has scaffold-ui-kit.ts and scaffold-ui-kit.json; keep one kit configuration'
    );
  });

  it('follows the package.json pointer before the root', () => {
    const kit = kitWith({
      'package.json': JSON.stringify({
        name: 'my-ui-kit',
        'scaffold-ui-kit': { configuration: 'configuration/kit.json' },
      }),
      'configuration/kit.json': JSON.stringify({
        ...validConfiguration,
        name: 'pointed-at',
      }),
      'scaffold-ui-kit.json': JSON.stringify(validConfiguration),
    });
    const resolved = resolveKitConfiguration(kit);
    expect(resolved.configuration.name).toBe('pointed-at');
    expect(resolved.file.name).toBe('configuration/kit.json');
  });

  it('ignores a package.json scaffold-ui-kit section without configuration', () => {
    const kit = kitWith({
      'package.json': JSON.stringify({ 'scaffold-ui-kit': { future: true } }),
      'scaffold-ui-kit.json': JSON.stringify(validConfiguration),
    });
    expect(findConfigurationFile(kit).name).toBe('scaffold-ui-kit.json');
  });

  it('reports a package.json pointer to nothing, or of the wrong shape', () => {
    const kit = kitWith({
      'package.json': JSON.stringify({
        'scaffold-ui-kit': { configuration: 'missing.ts' },
      }),
    });
    expect(() => findConfigurationFile(kit)).toThrow(
      /package\.json "scaffold-ui-kit\.configuration" names .*missing\.ts, which does not exist/
    );
    writeFileSync(
      join(kit, 'package.json'),
      JSON.stringify({ 'scaffold-ui-kit': { configuration: 3 } })
    );
    expect(() => findConfigurationFile(kit)).toThrow(
      'package.json "scaffold-ui-kit.configuration" must be a path'
    );
  });

  it('takes --configuration, relative to the working directory, over the pointer and the root', () => {
    const kit = kitWith({
      'package.json': JSON.stringify({
        'scaffold-ui-kit': { configuration: 'scaffold-ui-kit.json' },
      }),
      'scaffold-ui-kit.json': JSON.stringify(validConfiguration),
      'other/kit.json': JSON.stringify({
        ...validConfiguration,
        name: 'given',
      }),
    });
    expect(
      loadConfiguration(kit, {
        configuration: 'kit.json',
        workingDirectory: join(kit, 'other'),
      }).name
    ).toBe('given');
    expect(() =>
      findConfigurationFile(kit, { configuration: join(kit, 'other/kit.yaml') })
    ).toThrow(/--configuration names .*kit\.yaml, which does not exist/);
  });

  it('reads scaffold-ui-kit.config.json under its old name with one warning', () => {
    const kit = kitWith({
      'scaffold-ui-kit.config.json': JSON.stringify(validConfiguration),
    });
    const resolved = resolveKitConfiguration(kit);
    expect(resolved.configuration).toEqual(validConfiguration);
    expect(resolved.file.legacy).toBe(true);
    expect(resolved.warnings).toEqual([
      'scaffold-ui-kit.config.json: warning: the kit configuration is read under its old name, which stops being read in 3.0.0; rename it to scaffold-ui-kit.json, or write it as scaffold-ui-kit.ts with defineKit',
    ]);
  });

  it('warns of an unknown top-level key under the old name, as 2.2.1 let it pass, and fails on it under a new name', () => {
    const configuration = JSON.stringify({
      ...validConfiguration,
      comment: 'kept by 2.2.1',
      $schema: 's.json',
    });
    const old = resolveKitConfiguration(
      kitWith({ 'scaffold-ui-kit.config.json': configuration })
    );
    expect(old.warnings).toEqual([
      expect.stringContaining('read under its old name'),
      "scaffold-ui-kit.config.json: warning: unknown key 'comment'; the configuration takes name, targets, packages, styling, bem, tailwind, svelte, stylesheetPlacement, stylesheetLink, compiledStylesheetDirectory, stylingLayer, stylingLanguage, loadPaths, add, parts, preview; it is ignored here, and an error under scaffold-ui-kit.ts or scaffold-ui-kit.json",
    ]);
    rmSync(directory, { recursive: true, force: true });
    expect(() =>
      resolveKitConfiguration(
        kitWith({ 'scaffold-ui-kit.json': configuration })
      )
    ).toThrow("unknown key 'comment'");
  });

  it('reads a configuration in a sibling directory afresh, recording it and what it imports there', () => {
    const kit = kitWith({
      'kit/package.json': JSON.stringify({ name: 'kit' }),
      'shared/targets.ts': "export const targets = ['react'];\n",
      'shared/kit.ts': `import { targets } from './targets';\nexport default { name: 'kit', targets, styling: [] };\n`,
    });
    const root = join(kit, 'kit');
    const options = { configuration: join(kit, 'shared/kit.ts') };
    const first = resolveKitConfiguration(root, options);
    expect(first.configuration.targets).toEqual(['react']);
    expect(first.modules.map((module) => realpathSync(module)).sort()).toEqual(
      [join(kit, 'shared/kit.ts'), join(kit, 'shared/targets.ts')]
        .map((module) => realpathSync(module))
        .sort()
    );
    writeFileSync(
      join(kit, 'shared/targets.ts'),
      "export const targets = ['vue'];\n"
    );
    expect(
      resolveKitConfiguration(root, options).configuration.targets
    ).toEqual(['vue']);
  });

  it('reads a module outside the kit root that the configuration imports afresh, through a link as in a workspace', () => {
    const kit = kitWith({
      'tokens/index.ts': "export const name = 'first';\n",
      'kit/scaffold-ui-kit.ts': `import { name } from 'tokens';\nexport default { name, targets: ['react'] };\n`,
    });
    const root = join(kit, 'kit');
    mkdirSync(join(root, 'node_modules'));
    // A workspace package, linked into the kit as pnpm links one.
    symlinkSync(join(kit, 'tokens'), join(root, 'node_modules/tokens'));
    writeFileSync(
      join(kit, 'tokens/package.json'),
      JSON.stringify({ name: 'tokens', main: 'index.ts' })
    );
    const first = resolveKitConfiguration(root);
    expect(first.configuration.name).toBe('first');
    expect(first.modules.map((module) => realpathSync(module))).toContain(
      realpathSync(join(kit, 'tokens/index.ts'))
    );
    writeFileSync(
      join(kit, 'tokens/index.ts'),
      "export const name = 'second';\n"
    );
    expect(resolveKitConfiguration(root).configuration.name).toBe('second');
  });

  it("records the kit's modules a scaffold-ui-kit.ts loads, and reloads them when they change", () => {
    const kit = kitWith({
      'helpers/name.ts': "export const name = 'first';\n",
      'scaffold-ui-kit.ts': `import { name } from './helpers/name';\nexport default { name, targets: ['react'] };\n`,
    });
    const first = resolveKitConfiguration(kit);
    expect(first.configuration.name).toBe('first');
    // Each as it resolves, which a watcher reports a change by.
    expect(first.modules.map((module) => realpathSync(module)).sort()).toEqual(
      [join(kit, 'helpers/name.ts'), join(kit, 'scaffold-ui-kit.ts')]
        .map((module) => realpathSync(module))
        .sort()
    );
    writeFileSync(
      join(kit, 'helpers/name.ts'),
      "export const name = 'second';\n"
    );
    expect(resolveKitConfiguration(kit).configuration.name).toBe('second');
  });

  it('reads each deprecated key into its current form, warning once per key, and leaves the old key out', () => {
    const kit = kitWith({
      'scaffold-ui-kit.json': JSON.stringify({
        ...validConfiguration,
        targets: ['react', 'svelte'],
        styling: ['bem', 'tailwind'],
        stylingStrategy: 'separate-file',
        bemMode: 'runtime',
        bemImportSource: '@scope/bem',
        bem: { elementSeparator: '-' },
        tailwindOutput: 'styles',
        tailwindDarkSelector: '.dark',
        tailwindConvertStyles: true,
        svelteMode: 'runes',
      }),
    });
    const resolved = resolveKitConfiguration(kit);
    expect(resolved.configuration).toEqual({
      ...validConfiguration,
      targets: ['react', 'svelte'],
      styling: ['bem', 'tailwind'],
      stylesheetPlacement: 'separate-file',
      bem: {
        elementSeparator: '-',
        mode: 'runtime',
        importSource: '@scope/bem',
      },
      tailwind: {
        output: 'styles',
        darkSelector: '.dark',
        convertStyles: true,
      },
      svelte: { mode: 'runes' },
    });
    expect(resolved.warnings).toEqual([
      "scaffold-ui-kit.json: warning: 'stylingStrategy' is deprecated, is read as 'stylesheetPlacement' and will be removed in 3.0.0; rename the key",
      "scaffold-ui-kit.json: warning: 'bemMode' is deprecated, is read as 'bem.mode' and will be removed in 3.0.0; move it into the 'bem' block",
      "scaffold-ui-kit.json: warning: 'bemImportSource' is deprecated, is read as 'bem.importSource' and will be removed in 3.0.0; move it into the 'bem' block",
      "scaffold-ui-kit.json: warning: 'tailwindOutput' is deprecated, is read as 'tailwind.output' and will be removed in 3.0.0; move it into the 'tailwind' block",
      "scaffold-ui-kit.json: warning: 'tailwindDarkSelector' is deprecated, is read as 'tailwind.darkSelector' and will be removed in 3.0.0; move it into the 'tailwind' block",
      "scaffold-ui-kit.json: warning: 'tailwindConvertStyles' is deprecated, is read as 'tailwind.convertStyles' and will be removed in 3.0.0; move it into the 'tailwind' block",
      "scaffold-ui-kit.json: warning: 'svelteMode' is deprecated, is read as 'svelte.mode' and will be removed in 3.0.0; move it into the 'svelte' block",
    ]);
  });

  it('reads a configuration in its current form with no warning', () => {
    const kit = kitWith({
      'scaffold-ui-kit.json': JSON.stringify({
        ...validConfiguration,
        stylesheetPlacement: 'separate-file',
        bem: { mode: 'runtime' },
      }),
    });
    const resolved = resolveKitConfiguration(kit);
    expect(resolved.warnings).toEqual([]);
    expect(resolved.configuration.bem).toEqual({ mode: 'runtime' });
    expect(resolved.configuration.stylesheetPlacement).toBe('separate-file');
  });

  it('records no modules for JSON', () => {
    const kit = kitWith({
      'scaffold-ui-kit.json': JSON.stringify(validConfiguration),
    });
    expect(resolveKitConfiguration(kit).modules).toEqual([]);
  });

  it('refuses the old name beside a new one', () => {
    const kit = kitWith({
      'scaffold-ui-kit.config.json': JSON.stringify(validConfiguration),
      'scaffold-ui-kit.json': JSON.stringify(validConfiguration),
    });
    expect(() => findConfigurationFile(kit)).toThrow(
      'has scaffold-ui-kit.json and scaffold-ui-kit.config.json; keep one kit configuration'
    );
  });

  it('names the files it looked for when there is none', () => {
    const kit = kitWith({});
    expect(() => findConfigurationFile(kit)).toThrow(
      /No scaffold-ui-kit\.ts or scaffold-ui-kit\.json found/
    );
  });

  it('gives defineKit its configuration back unchanged', () => {
    const configuration = {
      name: 'kit',
      targets: ['react' as const],
      styling: [],
    };
    expect(defineKit(configuration)).toBe(configuration);
  });
});
