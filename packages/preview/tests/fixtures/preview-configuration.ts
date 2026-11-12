// What `@preview-configuration` resolves to under test: an empty kit's data.
// Each globals scenario replaces it with its own through `vi.doMock`.
import type { PreviewBrowserConfiguration } from '../../src/lib/types';

export const options: PreviewBrowserConfiguration['options'] = [];
export const canvas: PreviewBrowserConfiguration['canvas'] = {
  namePrefix: 'test',
};
export const themes: PreviewBrowserConfiguration['themes'] = [];
export const mount: PreviewBrowserConfiguration['mount'] = undefined;
export const viewCanvas: PreviewBrowserConfiguration['viewCanvas'] = undefined;
