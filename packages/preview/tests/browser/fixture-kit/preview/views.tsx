// The fixture kit's custom views: a React gallery that deep-links into the
// Glyph story (its buttons appear once the catalog has arrived), a plain-DOM
// view that shows the current mode option, and the component tree between
// them, so the navigation interleaves views and components.
import { reactView, type PreviewView, type ViewContext } from '@scaffold-ui-kit/preview/views';

const GLYPH_NAMES = ['check', 'cross'];

function Gallery({ context }: { context: ViewContext }) {
  const glyphStory = context.components.find((component) => component.title.endsWith('Glyph'));
  if (!glyphStory) return <p>Waiting for the catalog</p>;
  return (
    <ul>
      {GLYPH_NAMES.map((name) => (
        <li key={name}>
          <button type="button" aria-label={name} onClick={() => context.selectComponent(glyphStory.id, { name })}>
            {name}
          </button>
        </li>
      ))}
    </ul>
  );
}

export const views: PreviewView[] = [
  { id: 'components', label: 'Components', order: 10, componentTree: true },
  {
    id: 'glyph-gallery',
    label: 'Gallery',
    order: 20,
    ...reactView((context) => <Gallery context={context} />),
  },
  {
    id: 'swatches',
    label: 'Swatches',
    order: 30,
    mount(element, context, updates) {
      const paint = (current: ViewContext) => {
        element.textContent = `mode: ${String(current.options.mode)}`;
      };
      paint(context);
      return updates.subscribe(paint);
    },
  },
];

export const viewById = (id: string): PreviewView | undefined => views.find((view) => view.id === id);
