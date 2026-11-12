import { TemplateError, templateErrorDetails } from '@js-template-engine/core';

/** How severe a reported diagnostic is. */
export type DiagnosticSeverity = 'error' | 'warning';

/** One diagnostic and the targets that reported it. */
interface Diagnostic {
  severity: DiagnosticSeverity;
  text: string;
  /** The reporting targets, in order; empty for one about the template itself. */
  targets: string[];
}

/**
 * The diagnostics of a build, gathered across its targets and printed once:
 * each template's diagnostics in the order first reported, one reported
 * identically by every target printed once with no target, and one only
 * some targets report labeled with them.
 */
export interface DiagnosticLog {
  /**
   * Records a diagnostic of a template.
   *
   * @param label - The template's label, its path relative to the kit.
   * @param severity - `error` or `warning`.
   * @param text - The message, with its node path when it has one.
   * @param target - The target reporting it; omitted for one about the
   *   template itself, such as a validation error.
   */
  record(
    label: string,
    severity: DiagnosticSeverity,
    text: string,
    target?: string
  ): void;
  /**
   * Records a thrown error of a template: one diagnostic per error it
   * reports, so a `TemplateError` listing several gives one line each.
   *
   * @param label - The template's label.
   * @param error - The thrown value.
   * @param target - The target that threw it, if any.
   */
  recordError(label: string, error: unknown, target?: string): void;
  /**
   * The lines to print, grouped by template.
   *
   * @param targets - Every target of the build; a diagnostic all of them
   *   reported carries no target label.
   * @returns One line per distinct diagnostic.
   */
  lines(targets: readonly string[]): string[];
  /**
   * The diagnostics as {@link lines} orders and labels them, each with its
   * severity apart from its text.
   *
   * @param targets - Every target of the build.
   * @returns One entry per distinct diagnostic.
   */
  entries(targets: readonly string[]): DiagnosticEntry[];
}

/** One diagnostic as printed: its severity, and its label and text. */
export interface DiagnosticEntry {
  severity: DiagnosticSeverity;
  /** The template's label, with the reporting targets when not all did,
   *  then the message: `src/components/card.ts (react): unused`. */
  line: string;
}

/**
 * Creates an empty {@link DiagnosticLog}.
 *
 * @example
 * const log = createDiagnosticLog();
 * log.record('src/components/Card.ts', 'warning', 'unused', 'react');
 * log.record('src/components/Card.ts', 'warning', 'unused', 'vue');
 * log.lines(['react', 'vue']); // ['src/components/Card.ts: warning: unused']
 */
export function createDiagnosticLog(): DiagnosticLog {
  const byTemplate = new Map<string, Map<string, Diagnostic>>();

  const record: DiagnosticLog['record'] = (label, severity, text, target) => {
    let diagnostics = byTemplate.get(label);
    if (diagnostics === undefined) {
      diagnostics = new Map();
      byTemplate.set(label, diagnostics);
    }
    const key = `${severity}\n${text}`;
    let diagnostic = diagnostics.get(key);
    if (diagnostic === undefined) {
      diagnostic = { severity, text, targets: [] };
      diagnostics.set(key, diagnostic);
    }
    if (target !== undefined && !diagnostic.targets.includes(target)) {
      diagnostic.targets.push(target);
    }
  };

  return {
    record,
    recordError(label, error, target) {
      for (const text of errorLines(error)) {
        record(label, 'error', text, target);
      }
    },
    lines(targets) {
      const lines: string[] = [];
      for (const { prefix, severity, text } of labeled(targets)) {
        lines.push(`${prefix}: ${severity}: ${text}`);
      }
      return lines;
    },
    entries(targets) {
      return labeled(targets).map(({ prefix, severity, text }) => ({
        severity,
        line: `${prefix}: ${text}`,
      }));
    },
  };

  function labeled(
    targets: readonly string[]
  ): Array<{ prefix: string; severity: DiagnosticSeverity; text: string }> {
    const labeledDiagnostics: Array<{
      prefix: string;
      severity: DiagnosticSeverity;
      text: string;
    }> = [];
    for (const [label, diagnostics] of byTemplate) {
      for (const {
        severity,
        text,
        targets: reporting,
      } of diagnostics.values()) {
        const everyTarget =
          reporting.length === 0 ||
          targets.every((target) => reporting.includes(target));
        const prefix = everyTarget
          ? label
          : `${label} (${reporting.join(', ')})`;
        labeledDiagnostics.push({ prefix, severity, text });
      }
    }
    return labeledDiagnostics;
  }
}

/**
 * The lines a thrown value reports: one per error a `TemplateError` reports,
 * each with its node path, otherwise its message.
 */
function errorLines(error: unknown): string[] {
  if (error instanceof TemplateError) {
    return templateErrorDetails(error).map(({ message, nodePath }) =>
      nodePath === '' ? message : `${message} (at ${nodePath})`
    );
  }
  return [error instanceof Error ? error.message : String(error)];
}
