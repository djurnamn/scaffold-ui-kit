// Builds the host's controller from what the build aliases in: the generated
// manifest (which also carries the kit's persistence setting), the kit's
// preview options and its registered views, plus the shell's own options,
// which may depend on the catalog, so the catalog is built first.
// The regeneration endpoint exists on the development server only, so the static
// build gets a controller without a regeneration transport. The html source
// is the development server's to print on request; the static build reads
// what generation printed for each scenario. The iframes load
// from the URL the preview is served under, so a static build works from a
// subpath as well as from a domain's root.
import manifest from '@preview-generated/manifest.json';
import { options as previewOptions } from '@preview-configuration';
import { views } from '@preview-views';
import {
  catalogFromManifest,
  createFetchHtmlSourceTransport,
  createFetchRegenerationTransport,
  createPreviewController,
  createStaticHtmlSourceLoader,
  type PreviewController,
} from '../../src/controller';
import type { PreviewShell } from '../../src/shell';
import { shellOptionsFor } from '../../src/shell-acceptance';
import { previewBaseUrl } from '../lib/base-url';

export function createHostController(
  shell: Pick<PreviewShell, 'options'> = {}
): PreviewController {
  const catalog = catalogFromManifest(manifest, views);
  return createPreviewController({
    catalog,
    options: previewOptions,
    shellOptions: shellOptionsFor(shell, catalog),
    regeneration: import.meta.env.DEV
      ? createFetchRegenerationTransport()
      : undefined,
    ...(import.meta.env.DEV
      ? { htmlSource: createFetchHtmlSourceTransport() }
      : { scenarioHtmlSources: createStaticHtmlSourceLoader(previewBaseUrl) }),
    persistence: manifest.persistence,
    baseUrl: previewBaseUrl,
  });
}
