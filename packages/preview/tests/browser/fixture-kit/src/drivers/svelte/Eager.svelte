<script lang="ts">
  // A hand-written component for the browser tests alone: it reads `label`
  // before the markup updates and again as it unmounts, as a component that
  // drives a headless machine reads its props. Mounted with a label, it
  // throws if the label goes away before it is unmounted.
  let { label }: { label: string } = $props();
  let shown = $state('');
  $effect.pre(() => {
    shown = label.toUpperCase();
  });
  $effect(() => {
    return () => {
      label.toUpperCase();
    };
  });
</script>

<span class="FixtureEager">{shown}</span>
