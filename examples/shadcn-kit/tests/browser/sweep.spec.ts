import { expect, test } from '@playwright/test';
import type { PreviewScriptedTarget } from '@scaffold-ui-kit/preview/testing';
import {
  readPreviewManifest,
  sweepPreview,
  type KnownViolation,
} from '@scaffold-ui-kit/testing/browser';

// What the sweep accepts, each with its reason. An entry that stops occurring
// fails the sweep as well, so the list only shrinks.
const KNOWN: KnownViolation[] = [
  {
    rule: 'color-contrast',
    component: 'feedback-alert',
    states: ['variant-destructive'],
    reason:
      "The destructive description is shadcn's text-destructive/90 on the card background.",
  },
];

test('every story renders, passes axe and walks with the keyboard', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const result = await sweepPreview(page, readPreviewManifest('.'), {
    target,
    known: KNOWN,
    passes: [
      { label: 'dark', options: { mode: true }, rules: ['color-contrast'] },
    ],
  });
  expect(result.failures).toEqual([]);
  expect(result.stale).toEqual([]);
  expect(result.empty).toEqual([]);
});
