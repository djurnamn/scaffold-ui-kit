// The Vue iframe's registry as its unit test sees it (tests/vue-frame.test.ts):
// a story that renders its props, one whose component throws as it sets up,
// one whose template throws as it renders, and one whose template reads a
// component as a value (`:as="Badge"`) as well as a tag, with a part that
// does the same, and a controlled text field that puts its input back to its
// prop's value at the next tick, as a hand-written controlled component may.
import { nextTick } from 'vue';

const Badge = { props: ['label'], template: '<b class="Badge">{{ label }}</b>' };
const Holder = {
  props: ['as', 'label'],
  setup: (props: { as?: unknown; label?: string }) => props,
  template: '<component :is="as ?? \'i\'" :label="label" class="Holder" />',
};
const Field = {
  props: ['value', 'onValueChange'],
  setup(props: { value?: string; onValueChange?: (value: string) => void }) {
    function onInput(event: Event) {
      const element = event.currentTarget as HTMLInputElement;
      props.onValueChange?.(element.value);
      void nextTick(() => {
        if (props.value !== undefined && element.value !== props.value) element.value = props.value;
      });
    }
    return { onInput };
  },
  template: '<input class="Field" :value="value" @input="onInput" />',
};

export const registry = {
  'controlled-field': { components: { Field }, template: '<Field v-bind="props" />' },
  fine: { components: {}, template: '<p class="Fine">{{ props.label }}</p>' },
  'throws-in-setup': {
    components: {
      Faulty: {
        setup() {
          throw new Error('no setup for you');
        },
        template: '<p>unreachable</p>',
      },
    },
    template: '<Faulty />',
  },
  'throws-in-render': { components: {}, template: '<p>{{ props.missing.label }}</p>' },
  'component-as-value': {
    components: {
      Holder,
      Badge,
      Shelf: { name: 'Shelf', props: ['label'], components: { Holder, Badge }, setup: () => ({ Holder, Badge }), template: '<Holder :as="Badge" :label="label" />' },
    },
    template: '<div><Holder :as="Badge" label="direct" /><Shelf label="in a part" /></div>',
  },
};
