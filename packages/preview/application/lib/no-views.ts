// The empty custom-view registry - aliased in as `@preview-views` when the kit
// registers no `viewsModule`.
import type { PreviewView } from '../../src/views';

export const views: PreviewView[] = [];
export const viewById = (_id: string): PreviewView | undefined => undefined;
