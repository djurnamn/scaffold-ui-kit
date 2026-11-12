// What `@preview-configuration` resolves to in the host characterization tests: two
// global options (a theme choice in the kit's group, a mode boolean in a canvas
// group) and two story options (box, padded), so a test can tell the global
// and story scopes apart in every `preview:globals` payload.
import type { PreviewBrowserConfiguration } from '../../../src/lib/types';

export const options: PreviewBrowserConfiguration['options'] = [
  {
    id: 'theme',
    label: 'theme',
    values: [
      { value: 'light', label: 'light' },
      { value: 'dark', label: 'dark' },
    ],
    default: 'light',
    group: 'kit',
    scope: 'global',
    apply: { type: 'stylesheet' },
  },
  {
    id: 'mode',
    label: 'mode',
    default: false,
    group: 'canvas',
    scope: 'global',
    apply: { type: 'root-attribute', attribute: 'data-mode' },
  },
  {
    id: 'box',
    label: 'box',
    default: true,
    scope: 'story',
    apply: { type: 'class', className: 'is-boxed' },
  },
  {
    id: 'padded',
    label: 'padded',
    default: false,
    scope: 'story',
    apply: { type: 'class', className: 'is-padded' },
  },
];
export const canvas: PreviewBrowserConfiguration['canvas'] = {
  namePrefix: 'acme',
};
export const themes: PreviewBrowserConfiguration['themes'] = [
  { id: 'light', label: 'Light', css: 'light.css' },
  { id: 'dark', label: 'Dark', css: 'dark.css' },
];
export const mount: PreviewBrowserConfiguration['mount'] = undefined;
export const viewCanvas: PreviewBrowserConfiguration['viewCanvas'] = undefined;
