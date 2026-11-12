#!/usr/bin/env node
// The kit's consumer command (`npx <kit-name> add`), run by @scaffold-ui-kit/add
// against this kit's root. Written by scaffold-ui-kit initialize and build.
import { fileURLToPath } from 'node:url';
import { runAdd } from '@scaffold-ui-kit/add';

await runAdd(fileURLToPath(new URL('..', import.meta.url)));
