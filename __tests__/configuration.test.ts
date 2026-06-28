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
