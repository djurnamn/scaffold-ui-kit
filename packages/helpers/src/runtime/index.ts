/**
 * The runtime a kit's hand-written components call, on every target. Nothing
 * here imports a framework.
 *
 * @packageDocumentation
 */
export { consumerClass, mergeRootProps, withoutClass } from './root-props.js';
export {
  scriptFailureAttribute,
  scriptFailureBootstrapScript,
} from './script-failure.js';
export type { ScriptFailureBootstrapOptions } from './script-failure.js';
