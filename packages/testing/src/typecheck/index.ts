// The built targets type-checked as a strict consumer would: the Svelte
// target with svelte-check against a list of known diagnostics. The flags
// themselves ship as `@scaffold-ui-kit/testing/tsconfig.consumer.json`.

export {
  checkSvelte,
  compareDiagnostics,
  formatDiagnostic,
  parseSvelteCheckOutput,
  type CheckSvelteOptions,
  type CheckSvelteResult,
  type DiagnosticComparison,
  type DiagnosticType,
  type KnownDiagnostic,
  type SvelteCheckDiagnostic,
  type SvelteCheckOutput,
} from './svelte-check.js';
