<!--
  Renders a component on the server with fills a raw snippet cannot express:
  a scoped slot fill, which spreads the record its scope hands it onto a real
  element, and a host component around the part, whose children are the
  part. The renderer compiles this file with the project's own Svelte.

  A snippet takes its parameters from the component that renders it, so one
  snippet serves every scoped fill: each fill's function records which fill
  it is, then calls the snippet with the arguments it was given. A server
  render calls a snippet as it reaches it, so the snippet reads that record
  before any other fill can change it.

  The markers around each block let the renderer remove the anchors this
  file's own blocks add, so the markup is the component's alone.
-->
<script lang="ts">
  interface ScopedFill {
    attributes: (scope: unknown) => Record<string, unknown>;
    text: string;
    className: string;
  }

  interface Markers {
    outerStart: string;
    outerEnd: string;
    hostStart: string;
    hostEnd: string;
    partStart: string;
    partEnd: string;
  }

  interface Props {
    component: unknown;
    props: Record<string, unknown>;
    scopedFills: Record<string, ScopedFill>;
    host?: unknown;
    hostProps?: Record<string, unknown>;
    hostScopedFills?: Record<string, ScopedFill>;
    markers: Markers;
  }

  const {
    component,
    props,
    scopedFills,
    host,
    hostProps = {},
    hostScopedFills = {},
    markers,
  }: Props = $props();

  // Read by the snippet as it renders, never by an effect.
  // svelte-ignore non_reactive_update
  let current: ScopedFill | undefined;

  function fillFor(fill: ScopedFill) {
    return (...parameters: unknown[]) => {
      current = fill;
      return (scopedFill as (...parameters: unknown[]) => unknown)(
        ...parameters
      );
    };
  }

  function withFills(
    given: Record<string, unknown>,
    fills: Record<string, ScopedFill>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = { ...given };
    for (const [name, fill] of Object.entries(fills)) {
      resolved[name] = fillFor(fill);
    }
    return resolved;
  }

  // The part goes inside the spread, as `children` with `$$slots` merged: a
  // component written with children gets a `$$slots` of its own, which would
  // replace the one marking the host's fills and leave a legacy host's named
  // slots to their fallbacks.
  function hostSpread(): Record<string, unknown> {
    const resolved = withFills(hostProps, hostScopedFills);
    return {
      ...resolved,
      children: hostChildren,
      $$slots: {
        ...(resolved.$$slots as Record<string, true> | undefined),
        default: true,
      },
    };
  }

  const Component = $derived(component as never);
  const Host = $derived(host as never);
</script>

{#snippet scopedFill(scope: unknown)}
  {@const fill = current as ScopedFill}
  <button {...fill.attributes(scope)} class={fill.className}>{fill.text}</button
  >
{/snippet}

{#snippet hostChildren()}{@html markers.partStart}<Component
    {...withFills(props, scopedFills)}
  />{@html markers.partEnd}{/snippet}

{@html markers.outerStart}{#if host}{@html markers.hostStart}<Host
    {...hostSpread()}
  />{@html markers.hostEnd}{:else}{@html markers.partStart}<Component
    {...withFills(props, scopedFills)}
  />{@html markers.partEnd}{/if}{@html markers.outerEnd}
