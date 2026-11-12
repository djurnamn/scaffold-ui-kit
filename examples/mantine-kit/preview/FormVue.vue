<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  Checkbox,
  NumberInput,
  Radio,
  RadioGroup,
  SegmentedControl,
  Switch,
  TextInput,
} from 'mantine-style-kit-example/vue';

// A bare v-model binds each component's two-way prop; Checkbox also takes v-model:checked.
const email = ref('');
const framework = ref('vue');
const plan = ref('team');
const seats = ref<number | ''>(2);
const newsletter = ref(false);
const agree = ref(false);
const blurs = ref(0);
// The component exposes the routed <input> as `element`, so focus() lands in the field.
const emailField = ref<{ element: HTMLInputElement | null } | null>(null);
const emailHandle = ref('');
onMounted(
  () => (emailHandle.value = emailField.value?.element?.tagName ?? 'none')
);
</script>

<template>
  <form
    style="display: grid; gap: 1rem; padding: 1rem; max-width: 24rem"
    @submit.prevent
  >
    <TextInput
      ref="emailField"
      v-model="email"
      label="Email"
      description="v-model on a plain ref"
    />
    <SegmentedControl
      v-model="framework"
      :data="[
        { label: 'React', value: 'react' },
        { label: 'Vue', value: 'vue' },
        { label: 'Svelte', value: 'svelte' },
      ]"
      color="grape"
      full-width
    />
    <RadioGroup v-model="plan" label="Plan">
      <Radio value="free" label="Free" />
      <Radio value="team" label="Team" />
    </RadioGroup>
    <NumberInput v-model="seats" label="Seats" :min="1" :max="5" name="seats" />
    <Switch
      v-model="newsletter"
      label="Newsletter"
      on-label="yes"
      off-label="no"
    />
    <Checkbox
      v-model:checked="agree"
      label="I agree to the terms"
      name="agree"
      required
      aria-describedby="agree-hint"
      @blur="blurs++"
    />
    <small id="agree-hint">Read the terms before you sign up.</small>
    <button type="button" @click="emailField?.element?.focus()">
      Focus email
    </button>
    <pre style="font-size: 0.75rem">{{
      JSON.stringify(
        {
          emailHandle,
          email,
          framework,
          plan,
          seats,
          newsletter,
          agree,
          checkboxBlurs: blurs,
        },
        null,
        2
      )
    }}</pre>
  </form>
</template>
