// The URL the preview is served under: the directory holding the host page,
// with the iframes' pages below it. It never comes from the page's location,
// which a shell may change for its own routing. The development server
// serves the preview from its root. The static build is served from wherever
// a file server puts it, so there the URL comes from this module's own: the
// build puts every script, this one bundled among them, in `assets/`
// (build.assetsDir in the Vite configuration), one directory below the
// preview's. The relative path is held in a variable so the build does not
// take `new URL(..., import.meta.url)` for an asset to bundle.
const SCRIPT_DIRECTORY_PARENT = '../';

/** The URL the preview is served under, ending in `/`. */
export const previewBaseUrl: string = import.meta.env.DEV
  ? import.meta.env.BASE_URL
  : new URL(SCRIPT_DIRECTORY_PARENT, import.meta.url).href;
