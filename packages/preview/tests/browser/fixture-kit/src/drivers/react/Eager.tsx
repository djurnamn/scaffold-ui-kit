// The React side of the Eager fixture: the label, upper-cased, read as it
// renders. See the Svelte side for what the fixture is for.
export function Eager({ label }: { label: string }) {
  return <span className="FixtureEager">{label.toUpperCase()}</span>;
}
