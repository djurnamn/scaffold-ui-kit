import { test, expect } from '@playwright/test';
import type { PreviewScriptedTarget } from '@scaffold-ui-kit/preview/testing';
import {
  readPreviewManifest,
  sweepPreview,
  type KnownViolation,
} from '@scaffold-ui-kit/testing/browser';

const KNOWN: KnownViolation[] = [
  {
    rule: 'keyboard',
    component: 'inputs-select',
    states: ['open'],
    reason:
      'While open the list holds focus and Tab closes it, as a select-only combobox does.',
  },
];

test('accessibility', async ({ page }, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const result = await sweepPreview(page, readPreviewManifest('.'), {
    target,
    known: KNOWN,
    // Not part of WCAG A or AA in axe, but a modal without a name is a bug here.
    passes: [
      { label: 'dialog names', options: {}, rules: ['aria-dialog-name'] },
    ],
  });
  expect(result.failures).toEqual([]);
  expect(result.stale).toEqual([]);
  expect(result.empty).toEqual([]);
});
