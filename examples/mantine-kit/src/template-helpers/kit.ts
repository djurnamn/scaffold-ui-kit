/**
 * What every template in the kit shares: the size and color scales, BEM modifiers per prop value,
 * the Styles API props and attributes, and a conditional shorthand.
 */
import type { TemplateNode } from '@js-template-engine/types';

/** The size scale `size` and `radius` take, read from the theme's `--mk-*-{size}` tokens. */
export const SIZE_TYPE = "'xs' | 'sm' | 'md' | 'lg' | 'xl'";
/** The theme colors a `color` prop takes. */
export const COLOR_TYPE = "'blue' | 'red' | 'green' | 'grape'";
export const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

/** One conditional BEM modifier per value of a union prop. */
export function modifiersFor(
  block: string,
  prop: string,
  values: readonly string[]
) {
  return values.map((value) => ({
    condition: `${prop} === '${value}'`,
    attributes: { class: [`${block}--${value}`] },
  }));
}

/** Expression styles that point component-scoped variables at theme color tokens. */
export function colorVariables(prefix: string) {
  return {
    [`--${prefix}-color`]: { $expression: '`var(--mk-color-${color}-filled)`' },
    [`--${prefix}-light`]: { $expression: '`var(--mk-color-${color}-light)`' },
  };
}

/**
 * Styles API props for a component with the given inner parts: `classNames` (a class per part)
 * and `styles` (a style object per part). The style object type is framework-neutral on purpose:
 * Svelte has no CSSProperties, and the engine serializes the object for Vue and Svelte.
 */
export function stylesApiProps(parts: readonly string[]) {
  const union = parts.map((part) => `'${part}'`).join(' | ');
  return {
    classNames: {
      type: `Partial<Record<${union}, string>>`,
      description: `A class per inner part (Styles API): ${parts.map((part) => '`' + part + '`').join(', ')}.`,
    },
    styles: {
      type: `Partial<Record<${union}, Record<string, string | number>>>`,
      description:
        'A style object per inner part (Styles API), camelCase or `--custom` keys.',
    },
  };
}

/**
 * The Styles API attributes for one part: its class and its style expression, merged with static styles.
 * The consumer's object is the base layer and per-property expressions follow it, so a top-level
 * `--custom` expression reads the consumer's value first: `styles.input['--input-radius']` wins.
 */
export function part(name: string, staticStyle: Record<string, unknown> = {}) {
  const style: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(staticStyle)) {
    const expression = (value as { $expression?: string } | null)?.$expression;
    style[key] =
      key.startsWith('--') && typeof expression === 'string'
        ? { $expression: `styles?.${name}?.['${key}'] ?? (${expression})` }
        : value;
  }
  return {
    class: [{ $expression: `classNames?.${name}` }],
    style: { ...style, $expression: `styles?.${name}` },
  };
}

/**
 * React and Svelte overrides that merge the consumer's class from `rest` into an element's class:
 * `rest` arrives unmerged there. An override's `class` replaces the node's whole class, the BEM
 * class included, so it is spelled out again. Vue merges `rest`'s class itself.
 */
export function restClassOverrides(bemClass: string, partName: string) {
  return {
    react: {
      attributes: {
        class: [
          bemClass,
          { $expression: `classNames?.${partName}` },
          { $expression: 'rest.className' },
        ],
      },
    },
    svelte: {
      attributes: {
        class: [
          bemClass,
          { $expression: `classNames?.${partName}` },
          { $expression: 'rest.class' },
        ],
      },
    },
  };
}

/**
 * restClassOverrides plus the consumer's style, merged after the part's own styles and Styles API
 * object. React's `rest.style` is an object and spreads; Svelte's is a CSS string, so the Svelte
 * form is the array the engine serializes entry by entry, the consumer's last. The part's
 * expression-valued custom properties stay per-property: the engine gives the consumer's style
 * precedence over them in every target.
 */
export function restOverrides(
  bemClass: string,
  partName: string,
  staticStyle: Record<string, unknown> = {}
) {
  const classes = restClassOverrides(bemClass, partName);
  const { style } = part(partName, staticStyle);
  return {
    react: {
      attributes: {
        ...classes.react.attributes,
        style: {
          ...style,
          $expression: `{ ...styles?.${partName}, ...rest.style }`,
        },
      },
    },
    svelte: {
      attributes: {
        ...classes.svelte.attributes,
        style: { ...style, $expression: `[styles?.${partName}, rest.style]` },
      },
    },
  };
}

/** A node rendered only while `condition` holds. */
export function when(condition: string, child: TemplateNode): TemplateNode {
  return {
    type: 'conditional',
    conditions: [{ statement: 'if', condition, children: [child] }],
  };
}
