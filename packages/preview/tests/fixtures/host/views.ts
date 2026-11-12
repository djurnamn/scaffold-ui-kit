// What `@preview-views` resolves to in the host characterization tests: one
// rendered view (a gallery) ahead of the core source's component tree.
import type { PreviewView } from '../../../src/views';

export const views: PreviewView[] = [
  { id: 'gallery', label: 'Gallery', order: 0, mount: () => {} },
  { id: 'components', label: 'Components', order: 1, componentTree: true },
];

export const viewById = (id: string): PreviewView | undefined =>
  views.find((view) => view.id === id && !view.componentTree);
