<script lang="ts">
  import { Checkbox, Radio, RadioGroup, SegmentedControl, Switch } from 'mantine-style-kit-example/svelte';

  const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
  const colors = ['blue', 'red', 'green', 'grape'] as const;

  // bind:value and bind:checked reach the kit's two-way props.
  let size = $state<(typeof sizes)[number]>('md');
  let color = $state<(typeof colors)[number]>('blue');
  let switches = $state<Record<string, boolean>>({ blue: true, red: false, green: true, grape: false });
  const onCount = $derived(Object.values(switches).filter(Boolean).length);
</script>

<div style="display: grid; gap: 1.25rem; padding: 1rem;">
  <section style="display: flex; gap: 1.5rem; align-items: start; flex-wrap: wrap;">
    <SegmentedControl data={sizes.map((value) => ({ label: value, value }))} bind:value={size} color="grape" />
    <RadioGroup label="Checkbox color" bind:value={color} styles={{ options: { flexDirection: 'row', gap: '1rem' } }}>
      {#each colors as option (option)}
        <Radio value={option} label={option} color={option} />
      {/each}
    </RadioGroup>
  </section>

  <code>size = {size}, color = {color}, switches on = {onCount}</code>

  <section style="display: flex; gap: 0.75rem 2rem; flex-wrap: wrap;">
    {#each colors as switchColor (switchColor)}
      <Switch label={switchColor} color={switchColor} {size} onLabel="on" offLabel="off" bind:checked={switches[switchColor]} />
    {/each}
  </section>

  <section style="display: flex; gap: 0.75rem 2rem; flex-wrap: wrap; align-items: center;">
    {#each sizes as checkboxSize (checkboxSize)}
      <Checkbox label={checkboxSize} {color} size={checkboxSize} defaultChecked />
    {/each}
  </section>
</div>
