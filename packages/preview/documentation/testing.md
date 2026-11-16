# Testing a kit's components

Part of the [@scaffold-ui-kit/preview](../README.md) documentation.

`@scaffold-ui-kit/preview/testing` drives the preview from a browser test;
[`@scaffold-ui-kit/testing`](https://www.npmjs.com/package/@scaffold-ui-kit/testing)
is built on it and sweeps every story with axe and the keyboard. It
loads one target's preview page on its own, at the top level of the page,
and mounts a story in it with the props and options you give, so locators and
keyboard input reach the component directly:

<!-- example: preview-open-story -->
```ts
import { openStory } from '@scaffold-ui-kit/preview/testing';

const story = await openStory(page, { target: 'vue', id: 'components-button', props: { variant: 'solid' } });
await story.setProps({ variant: 'ghost' });
await story.setOptions({ mode: 'dark' });
await expect(story.page.getByRole('button')).toBeVisible();
```

A story's id is the one the catalog and the address use
(`PreviewComponent.id`, `?component=` in a link): its title in lower case,
each run of other characters a hyphen. A `Button` under the default
`Components` category is `components-button`, and one a story file places in
`Inputs` is `inputs-button`. An `unlisted` story opens this way too, so a
story that exists for the tests can stay out of the navigation.

The same steps are available as functions of the page, for a suite that loads
the page once per test and sets stories as it goes:

- `gotoPreview(page, target)` loads the target's preview page and waits
  until it listens. A page that never does, such as after an import fails to
  load, throws within seconds, naming the page and where to look.
- `setStory(page, id, props)` shows a story, and `mountStory(page, id, props)`
  shows it from a fresh mount, with no focus or component state carried over
  from the story before. An id the page has no story for throws, listing
  those it has, as `openStory` does.
- `waitForStory(page, id)` follows `mountStory` and waits until the story has
  finished mounting, whatever it rendered, including nothing, and throws after
  15 seconds, naming the story. After `setStory` it can return on the page's
  earlier report of the same story.
- `setProps(page, props)` replaces the story's props in place, keeping its
  component instance.
- `setOptions(page, options)` applies option values, such as a color mode.
  An id the kit does not define throws, listing those it does, as does a
  value the option does not list.
- `settle(page)` waits until the frame after the next paint, for a component
  whose event handling attaches just after it renders.
- `readStoryIds(page)` lists the ids of the stories the page can mount.
- `readRenderError(page)` is the message of what the mounted story threw as it
  rendered, as the pane reports it, or `undefined` while it renders.
- `PREVIEW_MOUNT_ELEMENT_ID` is the id of the element the story mounts in,
  for a test that scopes its queries to the story.
- `readPreviewManifest(kitRoot)` reads the components of
  `.preview-generated/manifest.json`, which the preview writes when it
  starts, typed `PreviewManifestComponent`.

`props` are the story's whole prop set: the story file's `defaultProps` and
scenarios are not applied, so pass every prop the story needs, such as a
required label.

`page` is a Playwright `Page`, or any object with `goto`, `waitForFunction`
and `evaluate` of the same shape; the package does not depend on Playwright.
Paths are relative, resolved against the test runner's base URL, or pass
`baseUrl` to name the server. Serve the preview with `dev` or the static
build.
