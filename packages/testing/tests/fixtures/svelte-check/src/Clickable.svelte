<script lang="ts">
  let { onpick }: { onpick: () => void } = $props();
</script>

<div onclick={onpick}>Pick</div>
