import { checkSvelte } from '@scaffold-ui-kit/testing/typecheck';

const result = checkSvelte({
  tsconfig: 'tsconfig.consumer.svelte.json',
  known: [],
});
console.log(result.report);
if (!result.passed) process.exit(1);
