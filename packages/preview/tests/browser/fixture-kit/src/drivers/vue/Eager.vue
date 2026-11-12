<script setup lang="ts">
// The Vue side of the Eager fixture: the label, upper-cased, read as it
// renders. See the Svelte side for what the fixture is for.
import { computed } from 'vue';

const props = defineProps<{ label: string }>();
const shown = computed(() => props.label.toUpperCase());
</script>

<template>
  <span class="FixtureEager">{{ shown }}</span>
</template>
