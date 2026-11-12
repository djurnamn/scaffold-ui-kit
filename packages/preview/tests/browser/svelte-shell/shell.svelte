<!--
  The minimal Svelte shell's interface. Everything it shows comes from the
  controller: the catalog's navigation as a select, the options as radio
  groups and checkboxes by their kind, the scenario as radio buttons, a form
  of the story's props, the target panes (and the html pane, where the
  kit builds html) stacked one above the other,
  every scenario of the story in a detached pane of its own, each as tall as
  the story it shows and with its code under it, the story panes at a width
  picked from the catalog's pane widths (scrolling across when the shell is
  narrower) or fitted to the shell, a view's pane, the
  selection's source per target and as html, and an editor without drag
  and drop that reorders with up and down buttons.
-->
<script lang="ts">
  import { getContext } from 'svelte';
  import {
    childPath,
    defaultScenarioId,
    isContainer,
    nodeSlots,
    optionGroup,
    optionKind,
    previewStore,
    printStorySource,
    scenarioChoices,
    shellOptionId,
    storyFrameKey,
    type EditorNode,
    type PreviewController,
    type PreviewNavigationNode,
    type PreviewOptionDescriptor,
    type PreviewPropType,
    type PreviewSelection,
    type Step,
  } from '@scaffold-ui-kit/preview/shell';
  import { CONTROLLER_CONTEXT } from './context';

  // The controller lives as long as the shell, so it comes in through the
  // context: read once, with no prop to go stale.
  const controller = getContext<PreviewController>(CONTROLLER_CONTEXT);

  // The controller's state as a Svelte store, replaced on every change.
  const preview = previewStore(controller);

  const catalog = controller.catalog;
  const selected = $derived(
    $preview.selection.kind === 'component'
      ? catalog.components.find((component) => component.id === $preview.selection.id)
      : undefined,
  );
  const viewId = $derived($preview.selection.kind === 'view' ? $preview.selection.id : undefined);
  // The `focus` option shows one target's pane alone, while it is among the panes.
  const focus = $derived(String($preview.options[shellOptionId('focus')]));
  const panes = $derived(
    $preview.targets.panes.some((target) => target === focus)
      ? $preview.targets.panes.filter((target) => target === focus)
      : $preview.targets.panes,
  );
  const density = $derived(String($preview.options[shellOptionId('density')]));
  // The pane widths to pick from, each as `{label} {width}`, and a width a
  // link named that is not among them as its number.
  const widthChoices = $derived([
    ...catalog.paneWidths.map(({ label, width }) => ({ width, label: `${label} ${width}` })),
    ...($preview.paneWidth !== undefined && !catalog.paneWidths.some(({ width }) => width === $preview.paneWidth)
      ? [{ width: $preview.paneWidth, label: String($preview.paneWidth) }]
      : []),
  ]);
  const choices = $derived(scenarioChoices(selected, controller.capabilities));

  // The scenario gallery: every scenario the story can show apart from the
  // selection (Empty belongs to the selection), each in a detached pane of
  // the first target the story renders in.
  const galleryTarget = $derived(selected?.targets[0]);
  const gallery = $derived.by(() => {
    if (!selected) return [];
    const listed = scenarioChoices(selected, { regeneration: false });
    return listed.length > 0 ? listed : [{ value: defaultScenarioId(selected), label: '(default)' }];
  });

  // The props form: the story's props as the state holds them, set whole.
  const propControls = $derived(selected?.propTypes.filter((propType) => propType.include) ?? []);
  function setProp(name: string, value: unknown) {
    const props = { ...controller.getState().props };
    if (value === undefined || value === '') delete props[name];
    else props[name] = value;
    controller.actions.setProps(props);
  }

  // The navigation tree, flattened into option groups: a group's label is
  // its path, and entries outside any group stand alone. Each entry carries
  // its selection, and its value is its place in the flattened list.
  interface NavigationGroup {
    label?: string;
    entries: { value: string; label: string; selection: PreviewSelection }[];
  }
  let entryCount = 0;
  function flatten(nodes: PreviewNavigationNode[], path: string[], groups: NavigationGroup[]): NavigationGroup[] {
    for (const node of nodes) {
      if (node.kind === 'group') {
        flatten(node.children, [...path, node.label], groups);
        continue;
      }
      const label = path.length > 0 ? path.join(' / ') : undefined;
      let group = groups.at(-1);
      if (!group || group.label !== label) groups.push((group = { label, entries: [] }));
      const selection: PreviewSelection = { kind: node.kind, id: node.id };
      group.entries.push({ value: String(entryCount++), label: node.label, selection });
    }
    return groups;
  }
  const navigation = flatten(catalog.navigation, [], []);
  const entries = navigation.flatMap((group) => group.entries);
  const selectedEntry = $derived(
    entries.find((entry) => entry.selection.kind === $preview.selection.kind && entry.selection.id === $preview.selection.id),
  );

  function navigate(value: string) {
    const entry = entries.find((candidate) => candidate.value === value);
    if (entry) controller.actions.select(entry.selection);
  }

  // The options by section: the shell's own, the story's, and each global
  // group. The controller lists the options to hide, the story's own while a
  // view is shown among them.
  function sectionOf(option: PreviewOptionDescriptor): string {
    if (option.origin === 'shell') return 'shell';
    return option.scope === 'story' ? 'story options' : optionGroup(option);
  }
  const sections = [...new Set(controller.options.map(sectionOf))];
  function sectionOptions(section: string): PreviewOptionDescriptor[] {
    return controller.options.filter(
      (option) =>
        sectionOf(option) === section && !$preview.unavailableOptions.includes(option.id),
    );
  }

  function addText(parent: Step[], slot: string) {
    controller.editor.insert({ parent, slot }, controller.editor.createNode({ kind: 'text', value: 'New text' }));
  }
</script>

{#snippet optionControl(option: PreviewOptionDescriptor)}
  {#if optionKind(option) === 'choice'}
    <fieldset>
      <legend>{option.label}</legend>
      {#each option.values ?? [] as choice (choice.value)}
        <label>
          <input
            type="radio"
            name="option-{option.id}"
            checked={$preview.options[option.id] === choice.value}
            onchange={() => controller.actions.setOption(option.id, choice.value)}
          />
          {choice.label}
        </label>
      {/each}
    </fieldset>
  {:else}
    <label title={option.title}>
      <input
        type="checkbox"
        checked={$preview.options[option.id] === true}
        onchange={(event) => controller.actions.setOption(option.id, event.currentTarget.checked)}
      />
      {option.label}
    </label>
  {/if}
{/snippet}

{#snippet propControl(propType: PreviewPropType)}
  {@const value = $preview.props[propType.name]}
  {@const declared = `${propType.declaredType}${propType.required ? ', required' : ''}`}
  {#if propType.control === 'boolean'}
    <label>
      <input
        type="checkbox"
        checked={value === true}
        onchange={(event) => setProp(propType.name, event.currentTarget.checked)}
      />
      {propType.name} <small>{declared}</small>
    </label>
  {:else if propType.control === 'select' || propType.control === 'color-select'}
    {@const values = propType.control === 'select' ? (propType.options ?? []) : catalog.colorTokens}
    <label>
      {propType.name} <small>{declared}</small>
      <select value={value === undefined ? '' : String(value)} onchange={(event) => setProp(propType.name, values.find((choice) => choice != null && String(choice) === event.currentTarget.value) ?? event.currentTarget.value)}>
        {#each values as choice (String(choice ?? ''))}
          <option value={String(choice ?? '')}>{String(choice ?? '(unset)')}</option>
        {/each}
      </select>
    </label>
  {:else}
    <label>
      {propType.name} <small>{declared}</small>
      <input
        type={propType.control === 'number' ? 'number' : 'text'}
        value={value === undefined ? '' : String(value)}
        oninput={(event) =>
          setProp(
            propType.name,
            propType.control === 'number' && event.currentTarget.value !== ''
              ? Number(event.currentTarget.value)
              : event.currentTarget.value,
          )}
      />
    </label>
  {/if}
{/snippet}

{#snippet slotList(parent: Step[], slot: string, nodes: EditorNode[])}
  <div class="slot">
    <span class="slot-name">{slot}</span>
    <ol>
      {#each nodes as node, index (node.id)}
        {@const path = childPath(parent, slot, index)}
        <li>
          <div class="node">
            {#if node.kind === 'text'}
              <input
                aria-label="text"
                value={node.value}
                oninput={(event) => controller.editor.setText(path, event.currentTarget.value)}
              />
            {:else if node.kind === 'element'}
              <strong>{node.component}</strong>
            {:else if node.kind === 'html'}
              <code>&lt;{node.tag}&gt;</code>
            {:else}
              <em>fixed content</em>
            {/if}
            <button
              type="button"
              disabled={index === 0}
              onclick={() => controller.editor.moveBy(path, -1)}>up</button
            >
            <button
              type="button"
              disabled={index === nodes.length - 1}
              onclick={() => controller.editor.moveBy(path, 1)}>down</button
            >
            <button type="button" onclick={() => controller.editor.remove(path)}>remove</button>
          </div>
          {#if isContainer(node)}
            {#each nodeSlots(catalog, node) as name (name)}
              {@render slotList(path, name, node.slots[name] ?? [])}
            {/each}
          {/if}
        </li>
      {/each}
    </ol>
    <button type="button" onclick={() => addText(parent, slot)}>add text</button>
  </div>
{/snippet}

<div class="shell density-{density}" data-svelte-shell>
  <header>
    <h1>{catalog.kitName}</h1>
    <label>
      navigation
      <select
        value={selectedEntry?.value}
        onchange={(event) => navigate(event.currentTarget.value)}
      >
        {#each navigation as group, index (index)}
          {#if group.label === undefined}
            {#each group.entries as entry (entry.value)}
              <option value={entry.value}>{entry.label}</option>
            {/each}
          {:else}
            <optgroup label={group.label}>
              {#each group.entries as entry (entry.value)}
                <option value={entry.value}>{entry.label}</option>
              {/each}
            </optgroup>
          {/if}
        {/each}
      </select>
    </label>
  </header>

  <section class="controls" aria-label="controls">
    {#each sections as section (section)}
      {@const options = sectionOptions(section)}
      {#if options.length > 0}
        <div class="section" data-section={section}>
          <h2>{section}</h2>
          {#each options as option (option.id)}
            {@render optionControl(option)}
          {/each}
        </div>
      {/if}
    {/each}
    {#if selected}
      <div class="section">
        <h2>story</h2>
        {#if choices.length > 0}
          <fieldset>
            <legend>scenario</legend>
            {#each choices as choice (choice.value)}
              <label>
                <input
                  type="radio"
                  name="scenario"
                  checked={$preview.scenario === choice.value}
                  onchange={() => controller.actions.pickScenario(choice.value)}
                />
                {choice.label}
              </label>
            {/each}
          </fieldset>
        {/if}
        {#if propControls.length > 0}
          <fieldset class="props">
            <legend>props</legend>
            {#each propControls as propType (propType.name)}
              {@render propControl(propType)}
            {/each}
          </fieldset>
        {/if}
        <fieldset>
          <legend>width</legend>
          <label>
            <input
              type="radio"
              name="pane-width"
              checked={$preview.paneWidth === undefined}
              onchange={() => controller.actions.setPaneWidth(undefined)}
            />
            fit
          </label>
          {#each widthChoices as paneWidth (paneWidth.width)}
            <label>
              <input
                type="radio"
                name="pane-width"
                checked={$preview.paneWidth === paneWidth.width}
                onchange={() => controller.actions.setPaneWidth(paneWidth.width)}
              />
              {paneWidth.label}
            </label>
          {/each}
        </fieldset>
        <fieldset>
          <legend>targets</legend>
          {#each catalog.targets as target (target)}
            <label>
              <input
                type="checkbox"
                checked={$preview.targets.visible.includes(target)}
                disabled={!$preview.targets.supported.includes(target)}
                onchange={(event) => controller.actions.setTargetVisible(target, event.currentTarget.checked)}
              />
              {target}
            </label>
          {/each}
        </fieldset>
      </div>
    {/if}
  </section>

  <main>
    {#if viewId !== undefined}
      <div class="view" {@attach (element) => controller.frames.mountView(element, viewId!)}></div>
    {:else}
      <div class="panes">
        {#each panes as target (target)}
          <section
            class="pane"
            data-pane={target}
            data-readiness={$preview.frames[target] ?? 'loading'}
            data-width={$preview.paneWidth}
            style:--pane-width={$preview.paneWidth === undefined ? undefined : `${$preview.paneWidth}px`}
          >
            <h2>{target}</h2>
            <div class="mount" {@attach (element) => controller.frames.mount(element, target)}></div>
          </section>
        {/each}
        {#if selected && galleryTarget}
          {@const component = selected.id}
          {@const target = galleryTarget}
          <section class="gallery" aria-label="scenarios">
            {#each gallery as entry (`${component}:${entry.value}`)}
              {@const key = storyFrameKey(target, { component, scenario: entry.value })}
              {@const size = $preview.storyFrameSizes[key]}
              <!-- Each pane is as tall as the story it shows, as the pane reports it. -->
              <figure
                data-scenario={entry.value}
                data-readiness={$preview.storyFrames[key] ?? 'loading'}
                data-content-height={size?.height}
                style:--content-height={size ? `${size.height}px` : undefined}
              >
                <figcaption>{entry.label}</figcaption>
                <div
                  class="mount"
                  {@attach (element) => controller.frames.mountStory(element, target, { component, scenario: entry.value })}
                ></div>
                <!-- The pane's code, printed from the catalog for the same story. -->
                <pre class="code" aria-label="{entry.label} code">{printStorySource(catalog, { component, scenario: entry.value })[target]}</pre>
              </figure>
            {/each}
          </section>
        {/if}
        {#if $preview.code}
          {@const code = $preview.code}
          <section class="source" aria-label="source">
            {#each Object.entries(code.targets) as [target, printed] (target)}
              <figure data-source={target}>
                <figcaption>{target}</figcaption>
                <pre>{printed}</pre>
              </figure>
            {/each}
            <figure data-source="html" data-html-status={code.html.status}>
              <figcaption>html</figcaption>
              {#if code.html.status === 'ready'}
                <pre>{code.html.source}</pre>
              {:else if code.html.status === 'loading'}
                <p>printing</p>
              {:else}
                <p>{code.html.reason}</p>
              {/if}
            </figure>
          </section>
        {/if}
      </div>
      {#if selected && controller.capabilities.regeneration}
        <aside class="editor" aria-label="editor">
          <button type="button" onclick={() => ($preview.editor.open ? controller.editor.close() : controller.editor.open())}>
            {$preview.editor.open ? 'close editor' : 'open editor'}
          </button>
          <p role="status" data-regeneration={$preview.regeneration.status}>
            regeneration: {$preview.regeneration.status}{$preview.regeneration.message ? ` (${$preview.regeneration.message})` : ''}
          </p>
          {#if $preview.editor.open && $preview.editor.tree}
            {@const tree = $preview.editor.tree}
            <p><strong>{tree.root}</strong></p>
            {#each nodeSlots(catalog, tree) as name (name)}
              {@render slotList([], name, tree.slots[name] ?? [])}
            {/each}
          {/if}
        </aside>
      {/if}
    {/if}
  </main>
</div>

<style>
  .shell {
    --gap: 0.5rem;
    --pane-height: 140px;
    font: 14px/1.4 system-ui, sans-serif;
    color: #1d2330;
    background: #f4f1ea;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    padding: var(--gap);
    box-sizing: border-box;
  }
  .density-roomy {
    --gap: 1.5rem;
    --pane-height: 220px;
    font-size: 16px;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--gap);
    background: #2b4c7e;
    color: white;
    padding: var(--gap);
    border-radius: 6px;
  }
  h1 {
    margin: 0;
    font-size: 1.1em;
    flex: 1;
  }
  h2 {
    margin: 0 0 0.25rem;
    font-size: 0.8em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6a5d43;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gap);
  }
  .section {
    background: white;
    border: 1px solid #d8cfbd;
    border-radius: 6px;
    padding: var(--gap);
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 0.25rem;
  }
  legend {
    font-weight: 600;
  }
  main {
    display: flex;
    gap: var(--gap);
    align-items: flex-start;
  }
  .panes {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--gap);
  }
  .pane {
    background: white;
    border-left: 4px solid #2b4c7e;
    padding: var(--gap);
  }
  .pane[data-readiness='loading'] {
    border-left-color: #c9a227;
  }
  .mount :global(iframe),
  .view :global(iframe) {
    display: block;
    width: 100%;
    height: var(--pane-height);
    border: 1px dashed #d8cfbd;
  }
  .view {
    flex: 1;
  }
  /* At a picked width, a pane's iframe is that wide, the pane scrolling
     across it while narrower. */
  .pane .mount {
    overflow-x: auto;
  }
  .pane[data-width] .mount :global(iframe) {
    width: var(--pane-width);
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--gap);
  }
  .gallery figure {
    margin: 0;
    background: white;
    border-top: 4px solid #2b4c7e;
    padding: var(--gap);
  }
  .gallery figure[data-readiness='loading'] {
    border-top-color: #c9a227;
  }
  .gallery .mount :global(iframe) {
    height: var(--content-height, calc(var(--pane-height) / 2));
  }
  .props label {
    display: block;
  }
  pre {
    margin: 0;
    overflow: auto;
    font: 12px/1.4 ui-monospace, monospace;
  }
  .source {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: var(--gap);
  }
  .source figure {
    margin: 0;
    background: white;
    border-top: 4px solid #6a5d43;
    padding: var(--gap);
  }
  small {
    color: #6a5d43;
  }
  .view :global(iframe) {
    height: 60vh;
  }
  .editor {
    width: 22rem;
    background: white;
    border: 1px solid #d8cfbd;
    padding: var(--gap);
  }
  .editor ol {
    margin: 0;
    padding-left: 1.25rem;
  }
  .slot {
    margin: 0.25rem 0;
  }
  .slot-name {
    font-size: 0.8em;
    color: #6a5d43;
  }
  .node {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }
  [data-regeneration='pending'] {
    color: #8a6d00;
  }
  [data-regeneration='error'] {
    color: #a12a2a;
  }
</style>
