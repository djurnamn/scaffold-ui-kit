import { TemplateError } from '@js-template-engine/core';
import { describe, expect, it } from 'vitest';

import { createDiagnosticLog } from '../src/diagnostics';

describe('createDiagnosticLog', () => {
  it('prints a diagnostic every target reports once, without a target', () => {
    const log = createDiagnosticLog();
    for (const target of ['react', 'vue', 'svelte']) {
      log.record('Card.ts', 'warning', 'shared (at children[0])', target);
    }
    expect(log.lines(['react', 'vue', 'svelte'])).toEqual([
      'Card.ts: warning: shared (at children[0])',
    ]);
  });

  it('labels a diagnostic only some targets report with those targets', () => {
    const log = createDiagnosticLog();
    log.record('Card.ts', 'warning', 'vue only', 'vue');
    log.record('Card.ts', 'error', 'two of three', 'react');
    log.record('Card.ts', 'error', 'two of three', 'svelte');
    expect(log.lines(['react', 'vue', 'svelte'])).toEqual([
      'Card.ts (vue): warning: vue only',
      'Card.ts (react, svelte): error: two of three',
    ]);
  });

  it('groups by template in the order first reported', () => {
    const log = createDiagnosticLog();
    log.record('B.ts', 'warning', 'b', 'react');
    log.record('A.ts', 'warning', 'a', 'react');
    log.record('B.ts', 'warning', 'b2', 'react');
    expect(log.lines(['react'])).toEqual([
      'B.ts: warning: b',
      'B.ts: warning: b2',
      'A.ts: warning: a',
    ]);
  });

  it('records one line per error a TemplateError lists, and a template error without a target', () => {
    const log = createDiagnosticLog();
    log.recordError(
      'Tabs.ts',
      new TemplateError('2 validation errors:\n  ...', '', [
        {
          message: 'Unknown event modifier "home"',
          nodePath: 'children[0].events[0].modifiers[0]',
        },
        { message: 'Whole template', nodePath: '' },
      ])
    );
    log.recordError('Broken.json', new Error('cannot load'));
    log.recordError(
      'Single.ts',
      new TemplateError('one', 'children[1]'),
      'vue'
    );
    expect(log.lines(['react', 'vue'])).toEqual([
      'Tabs.ts: error: Unknown event modifier "home" (at children[0].events[0].modifiers[0])',
      'Tabs.ts: error: Whole template',
      'Broken.json: error: cannot load',
      'Single.ts (vue): error: one (at children[1])',
    ]);
  });
});
