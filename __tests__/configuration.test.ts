import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  configurationFileName,
  loadConfiguration,
  validateConfiguration,
} from '../src/configuration';

const validConfiguration = {
  name: 'my-ui-kit',
  targets: ['react', 'html'],
  styling: ['bem'],
};

describe('validateConfiguration', () => {
  it('accepts a minimal configuration', () => {
    expect(validateConfiguration(validConfiguration)).toEqual([]);
  });

  it('accepts an add block with shared layers and notes', () => {
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
      "'add' must be an object with optional 'shared' and 'notes'",
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

  it('accepts optional strategies and separators', () => {
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

  it('accepts stylesheetLink alongside the separate-file strategy', () => {
    expect(
      validateConfiguration({
        ...validConfiguration,
        stylingStrategy: 'separate-file',
        stylesheetLink: 'none',
      })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, stylesheetLink: 'component' })
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

  it('accepts both tailwindOutput values', () => {
    expect(
      validateConfiguration({ ...validConfiguration, tailwindOutput: 'classes' })
    ).toEqual([]);
    expect(
      validateConfiguration({ ...validConfiguration, tailwindOutput: 'styles' })
    ).toEqual([]);
  });

  it('accepts a boolean tailwindConvertStyles', () => {
    expect(
      validateConfiguration({ ...validConfiguration, tailwindConvertStyles: true })
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

  it('accepts both bemMode values and an importSource, rejecting others', () => {
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

  it('accepts both svelteMode values, rejecting others', () => {
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
    [null, 'JSON object'],
    [[], 'JSON object'],
    [{ targets: ['react'] }, "'name'"],
    [{ name: 'kit' }, "'targets' is required"],
    [{ name: 'kit', targets: [] }, 'at least one'],
    [{ name: 'kit', targets: ['angular'] }, "unknown 'angular'"],
    [{ ...validConfiguration, styling: ['scss'] }, "unknown 'scss'"],
    [{ ...validConfiguration, stylingStrategy: 'in-line' }, 'stylingStrategy'],
    [{ ...validConfiguration, tailwindOutput: 'css' }, 'tailwindOutput'],
    [{ ...validConfiguration, tailwindConvertStyles: 'yes' }, 'tailwindConvertStyles'],
    [{ ...validConfiguration, bemElementSeparator: 7 }, 'bemElementSeparator'],
    [{ ...validConfiguration, bemImportSource: 9 }, 'bemImportSource'],
    [{ ...validConfiguration, stylesheetLink: 'never' }, 'stylesheetLink'],
    [
      { ...validConfiguration, stylesheetLink: 'none' },
      "requires 'stylingStrategy' of 'separate-file'",
    ],
    [{ ...validConfiguration, stylingLayer: '' }, 'stylingLayer'],
    [{ ...validConfiguration, stylingLayer: { order: ['a'] } }, 'stylingLayer.name'],
    [
      { ...validConfiguration, stylingLayer: { name: 'kit', order: 'kit.base' } },
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

  it('reports a missing configuration file', () => {
    directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-configuration-'));
    expect(() => loadConfiguration(directory)).toThrow(configurationFileName);
  });

  it('reports malformed JSON', () => {
    directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-configuration-'));
    writeFileSync(join(directory, configurationFileName), '{not json');
    expect(() => loadConfiguration(directory)).toThrow('not valid JSON');
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
