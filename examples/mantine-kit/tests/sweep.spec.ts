import { expect, test } from '@playwright/test';
import type { PreviewScriptedTarget } from '@scaffold-ui-kit/preview/testing';
import {
  readPreviewManifest,
  sweepPreview,
  type KnownViolation,
} from '@scaffold-ui-kit/testing/browser';

const KNOWN: KnownViolation[] = [
  {
    rule: 'color-contrast',
    component: 'inputs-textinput',
    states: ['styles-api'],
    passes: ['dark'],
    reason: 'The story sets its own label color to show the Styles API.',
  },
];

// Every story of the form components, in light and dark, with axe and the Tab walk.
test('form components', async ({ page }, testInfo) => {
  const components = readPreviewManifest('.').filter((component) =>
    component.id.startsWith('inputs-')
  );
  const result = await sweepPreview(page, components, {
    target: testInfo.project.name as PreviewScriptedTarget,
    known: KNOWN,
    passes: [
      {
        label: 'dark',
        options: { colorScheme: 'dark' },
        rules: ['color-contrast'],
      },
    ],
  });
  expect(result.failures).toEqual([]);
  expect(result.stale).toEqual([]);
  expect(result.empty).toEqual([]);
});
