<script setup lang="ts">
import Field from './Field.vue';

const state = 'open';
const node = 'icon-1';
</script>

<template>
  <div data-static="yes" :data-state="state">
    <svg viewBox="0 0 8 8" :data-jte-node="node">
      <path d="M0 0" data-part="line" :data-state="state" />
    </svg>
    <span :data-state="state"></span>
    <Field label="Name" />
  </div>
</template>
