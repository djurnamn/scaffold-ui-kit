/**
 * Merges the attributes a consumer puts on a component onto the root element
 * whose props a behavior also supplies: an overlay's panel filled from a
 * state machine's prop getter, a select's trigger, a split's frame.
 *
 * The behavior keeps every key it supplies: an `id` it finds the element by,
 * the ARIA it keeps up, its data attributes. What the consumer adds goes
 * beside them:
 *
 * - `class` (`className` in React) joins the behavior's.
 * - `style` merges, the behavior's declarations winning where both set one.
 * - A handler both give runs both, the consumer's first. When the consumer's
 *   handler calls `preventDefault()`, the behavior's is skipped, which is how
 *   a consumer opts out of what the component does by default.
 * - Vue's several listeners for one event, an array on the key, run in order
 *   as Vue runs them, the behavior's after the last.
 * - Every key the behavior leaves undefined is the consumer's.
 *
 * Each target's spelling is read as it comes (React's `onClick` and
 * `className`, Vue's `onClick` and `class`, Svelte's `onclick` and `class`).
 * A handler key matches exactly, since both records come from one target. A
 * style given as text, as Vue and Svelte allow, merges as text.
 *
 * The consumer's `class`, `className` and `style` are read even when absent,
 * so a reactive attribute record (Vue's `useAttrs()`, Svelte's rest props)
 * registers the read while it is still empty.
 *
 * @param behaviorProps - The props the behavior supplies for the element.
 * @param consumerProps - The attributes the consumer passed, if any.
 * @returns One record to spread onto the element.
 *
 * @example
 * ```tsx
 * <div {...mergeRootProps(api.getRootProps(), rest)} />
 * ```
 */
export function mergeRootProps<Props extends object>(
  behaviorProps: Props,
  consumerProps: object | undefined
): Props {
  if (!consumerProps) return behaviorProps;
  const behavior = behaviorProps as Record<string, unknown>;
  const consumer = consumerProps as Record<string, unknown>;
  const consumerClass = consumer.class;
  const consumerClassName = consumer.className;
  const consumerStyle = consumer.style;
  const merged: Record<string, unknown> = { ...consumer };
  if (consumerClass !== undefined) merged.class = consumerClass;
  if (consumerClassName !== undefined) merged.className = consumerClassName;
  if (consumerStyle !== undefined) merged.style = consumerStyle;
  for (const key of Object.keys(behavior)) {
    const behaviorValue = behavior[key];
    if (behaviorValue === undefined) continue;
    const consumerValue = consumer[key];
    if (isHandlerKey(key) && typeof behaviorValue === 'function') {
      merged[key] = isListener(consumerValue)
        ? composeHandlers(consumerValue, behaviorValue as Handler)
        : behaviorValue;
    } else if (consumerValue === undefined || consumerValue === null) {
      merged[key] = behaviorValue;
    } else if (key === 'class' || key === 'className') {
      merged[key] = joinClasses(behaviorValue, consumerValue);
    } else if (key === 'style') {
      merged[key] = mergeStyles(behaviorValue, consumerValue);
    } else {
      merged[key] = behaviorValue;
    }
  }
  return merged as Props;
}

/**
 * The class a consumer passed, in either spelling, as one string.
 *
 * For a root that is an element of the component's own markup: its class
 * list is written beside the attributes it spreads and would replace the
 * consumer's, so the consumer's class goes into that list and the spread
 * goes without it ({@link withoutClass}).
 *
 * @param consumerProps - The attributes the consumer passed, if any.
 * @returns The consumer's `className` and `class`, joined, or `undefined`
 *   when there is neither.
 *
 * @example
 * ```svelte
 * <div class="menu {consumerClass(rest) ?? ''}" {...withoutClass(rest)}></div>
 * ```
 */
export function consumerClass(
  consumerProps: object | undefined
): string | undefined {
  if (!consumerProps) return undefined;
  const consumer = consumerProps as Record<string, unknown>;
  const joined = joinClasses(consumer.className, consumer.class);
  return joined === '' ? undefined : joined;
}

/**
 * A consumer's attributes without the class {@link consumerClass} carries.
 * Both class keys are read, so a reactive attribute record registers both.
 *
 * @param consumerProps - The attributes the consumer passed, if any.
 * @returns The attributes without `class` and `className`, or `undefined`
 *   when none were passed.
 */
export function withoutClass(
  consumerProps: object | undefined
): Record<string, unknown> | undefined {
  if (!consumerProps) return undefined;
  const {
    class: _class,
    className: _className,
    ...rest
  } = consumerProps as Record<string, unknown>;
  return rest;
}

type Handler = (...parameters: unknown[]) => unknown;

const isHandlerKey = (key: string) => /^on[A-Za-z]/.test(key);

/** A callable listener, or a list holding at least one, however nested. */
const isListener = (value: unknown): boolean =>
  typeof value === 'function' ||
  (Array.isArray(value) && value.some(isListener));

/**
 * Runs a list of listeners as Vue runs one on an element: in order, until one
 * calls `stopImmediatePropagation()`.
 */
function callListeners(listeners: unknown[], parameters: unknown[]) {
  const event = parameters[0] as {
    stopImmediatePropagation?: () => void;
  } | null;
  let stopped = false;
  if (typeof event?.stopImmediatePropagation === 'function') {
    const stopImmediatePropagation = event.stopImmediatePropagation;
    event.stopImmediatePropagation = () => {
      stopImmediatePropagation.call(event);
      stopped = true;
    };
  }
  for (const listener of listeners.flat(Infinity) as unknown[]) {
    if (stopped) break;
    if (typeof listener === 'function') listener(...parameters);
  }
}

function composeHandlers(consumerListener: unknown, behaviorHandler: Handler) {
  return (...parameters: unknown[]) => {
    if (Array.isArray(consumerListener)) {
      callListeners(consumerListener, parameters);
    } else if (typeof consumerListener === 'function') {
      consumerListener(...parameters);
    }
    const event = parameters[0];
    if (
      event !== null &&
      typeof event === 'object' &&
      (event as { defaultPrevented?: unknown }).defaultPrevented === true
    )
      return;
    behaviorHandler(...parameters);
  };
}

/** A class value (a string, a list, or a record of switched names) as one string. */
function classText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value.map(classText).filter(Boolean).join(' ');
  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .filter((name) => (value as Record<string, unknown>)[name])
      .join(' ');
  }
  return '';
}

const joinClasses = (first: unknown, second: unknown) =>
  [classText(first), classText(second)].filter(Boolean).join(' ');

const isStyleRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A style as declaration text, a record's camel-case keys spelled as CSS spells them. */
function styleText(value: unknown): string {
  if (typeof value === 'string') return value.trim().replace(/;$/, '');
  if (Array.isArray(value))
    return value.map(styleText).filter(Boolean).join('; ');
  if (!isStyleRecord(value)) return '';
  return Object.entries(value)
    .filter(
      ([, declaration]) =>
        declaration !== undefined && declaration !== null && declaration !== ''
    )
    .map(([property, declaration]) => {
      const name = property.startsWith('--')
        ? property
        : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      return `${name}: ${String(declaration)}`;
    })
    .join('; ');
}

function mergeStyles(behaviorValue: unknown, consumerValue: unknown): unknown {
  // Two records, as React passes them: the behavior's land last and win.
  if (isStyleRecord(behaviorValue) && isStyleRecord(consumerValue)) {
    return { ...consumerValue, ...behaviorValue };
  }
  // Text on either side, as Svelte passes it and Vue may: the later wins.
  return [styleText(consumerValue), styleText(behaviorValue)]
    .filter(Boolean)
    .join('; ');
}
