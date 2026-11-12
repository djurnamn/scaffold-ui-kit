// An axe scan of the page a story is mounted in.

import type { PreviewPage } from '@scaffold-ui-kit/preview/testing';

/** The rule tags a scan holds a page to by default: WCAG 2.1 A and AA. */
export const DEFAULT_AXE_TAGS: readonly string[] = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
];

/** A rule axe found broken, with the elements that break it. */
export interface AxeViolation {
  /** The rule's id, such as `button-name`. */
  id: string;
  /** How serious axe rates it. */
  impact?: string | null;
  /** What the rule asks for. */
  help: string;
  /** The elements that break it, each by its selector path. */
  nodes: { target: unknown[] }[];
}

/** Which rules a scan runs. */
export interface ScanOptions {
  /** Run these rules alone. */
  rules?: string[];
  /** Run the rules with these tags: {@link DEFAULT_AXE_TAGS} by default. */
  tags?: readonly string[];
}

/** A rule's result, whichever way it came out: the tags the rule carries. */
interface AxeRuleResult {
  tags: string[];
}

interface AxeBuilderLike {
  withRules(rules: string[]): AxeBuilderLike;
  withTags(tags: string[]): AxeBuilderLike;
  analyze(): Promise<{
    violations: (AxeViolation & AxeRuleResult)[];
    passes: AxeRuleResult[];
    incomplete: AxeRuleResult[];
    inapplicable: AxeRuleResult[];
  }>;
}

/**
 * Scan the whole page with axe, through `@axe-core/playwright`. The scan is
 * not limited to the mount: what a component portals to the body, a dialog
 * or a listbox, is scanned with it.
 *
 * @param page - A Playwright page.
 * @param options - The rules to run.
 * @returns The rules the page breaks.
 * @throws When a tag is one no axe rule carries, or the list of tags or rules
 *   is empty, each a scan that would check less than it says; the message
 *   names the tags.
 */
export async function scanAccessibility(
  page: PreviewPage,
  options: ScanOptions = {}
): Promise<AxeViolation[]> {
  const tags = options.tags ?? DEFAULT_AXE_TAGS;
  if ((options.rules ?? tags).length === 0) {
    throw new Error(
      `scanAccessibility: the list of ${options.rules ? 'rules' : 'tags'} is empty, so the scan would check nothing. Leave \`tags\` out for the default WCAG tags, or name what to run.`
    );
  }
  const { default: AxeBuilder } = (await import(
    '@axe-core/playwright'
  )) as unknown as {
    default: new (parameters: { page: never }) => AxeBuilderLike;
  };
  const builder = new AxeBuilder({ page: page as never });
  const results = await (
    options.rules
      ? builder.withRules(options.rules)
      : builder.withTags([...tags])
  ).analyze();
  const ran = [
    ...results.violations,
    ...results.passes,
    ...results.incomplete,
    ...results.inapplicable,
  ];
  if (options.rules) {
    if (ran.length === 0) {
      throw new Error(
        `scanAccessibility: no axe rule carries ${options.rules.join(', ')}, so the scan would check nothing.`
      );
    }
  } else {
    // Each rule that ran reports its tags, so a tag none of them carries is
    // one that matched no rule: axe drops it without a word.
    const carried = new Set(ran.flatMap((rule) => rule.tags));
    const unknown = tags.filter((tag) => !carried.has(tag));
    if (unknown.length > 0) {
      throw new Error(
        `scanAccessibility: no axe rule carries ${unknown.join(', ')}, so the scan would leave out what it names.`
      );
    }
  }
  return results.violations;
}

/**
 * A violation as one line: its rule, impact and help, and the first element
 * that breaks it.
 *
 * @param violation - The violation.
 * @returns The line.
 */
export function formatViolation(violation: AxeViolation): string {
  const target = violation.nodes[0]?.target?.join(' ') ?? '(no element)';
  return `${violation.id} (${violation.impact ?? 'unrated'}) - ${violation.help} → ${target}`;
}
