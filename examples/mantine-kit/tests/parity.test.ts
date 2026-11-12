import { beforeAll, describe, expect, it } from 'vitest';
import { slot } from '@scaffold-ui-kit/testing/render';
import { canonicalNodes, rootAttributes } from '@scaffold-ui-kit/testing/parity';
import { renderer } from './renderer';

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const COLORS = ['blue', 'red', 'green', 'grape'] as const;
const VARIANTS = ['filled', 'light', 'outline', 'subtle'] as const;

beforeAll(
  () => renderer.load('Button', 'Badge', 'TextInput', 'Checkbox', 'Switch'),
  60_000
);

// Vue's server renderer writes the DOM property `indeterminate` as an attribute;
// it means nothing in HTML and the client render sets the property.
const withoutVueIndeterminate = (markup: string) =>
  markup.replace(/ indeterminate="(true|false)"/, '');

async function expectParity(name: string, props: Record<string, unknown>) {
  const { react, vue, svelte } = await renderer.renderAll(name, props);
  expect(canonicalNodes(withoutVueIndeterminate(vue!))).toEqual(
    canonicalNodes(react!)
  );
  expect(canonicalNodes(svelte!)).toEqual(canonicalNodes(react!));
  return { react: react!, vue: vue!, svelte: svelte! };
}

describe('Button', () => {
  for (const size of SIZES) {
    for (const color of COLORS) {
      for (const variant of VARIANTS) {
        it(`${variant} ${color} ${size}`, async () => {
          const { react } = await expectParity('Button', {
            size,
            color,
            variant,
            radius: size,
            children: slot('Save'),
          });
          const root = rootAttributes(react, { variablePrefix: '--button-' });
          expect([...root.classes]).toEqual(
            expect.arrayContaining([
              'mk-button',
              `mk-button--${size}`,
              `mk-button--${variant}`,
            ])
          );
        });
      }
    }
  }

  it('is busy and still renders its label while loading', async () => {
    const { react } = await expectParity('Button', {
      loading: true,
      children: slot('Save'),
    });
    expect(react).toMatch(/aria-busy="true"/);
    expect(react).toContain('Save');
  });
});

describe('form fields', () => {
  it('wires label, description and error', async () => {
    const { react } = await expectParity('TextInput', {
      label: 'Email',
      description: 'Work address',
      error: 'Required',
      required: true,
    });
    expect(react).toMatch(/aria-invalid="true"/);
    expect(react).toMatch(/aria-describedby="[^"]+"/);
  });

  it('is not marked invalid without an error', async () => {
    const { react } = await expectParity('TextInput', { label: 'Email' });
    expect(react).not.toContain('aria-invalid');
  });

  for (const size of SIZES) {
    it(`renders the same at size ${size}`, async () => {
      await expectParity('TextInput', { label: 'Email', size });
      await expectParity('Checkbox', { label: 'Agree', size });
      await expectParity('Switch', { label: 'Wi-Fi', size });
    });
  }

  it('reaches inner parts through the Styles API', async () => {
    const results = await expectParity('TextInput', {
      label: 'Email',
      classNames: { input: 'custom-input', label: 'custom-label' },
      styles: { input: { '--input-radius': '0px' } },
    });
    for (const markup of Object.values(results)) {
      expect(markup).toContain('custom-input');
      expect(markup).toContain('custom-label');
      expect(markup).toMatch(/--input-radius:\s*0px/);
    }
  });
});
