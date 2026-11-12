// The charcell shell's root. The terminal look is charcell (the standalone kit
// the look was extracted into); the shell's own surfaces (the editor panel,
// controls, layout) are styled on charcell's tokens. The behavior is the
// controller's: this component provides it and the shell's configuration to
// the tree, and the interface inside lays out the prompt bar, navigation, stage
// and status bar (Application). The stylesheets come in charcell's order:
// charcell's own, then the shell's layers and page (shell.css), then each
// component's, which it imports itself.
import 'charcell/css/full';
import './shell.css';
import type { PreviewController } from '../../../src/shell';
import { Application } from './components/Application';
import type { CharcellShellConfiguration } from './configuration';
import { PreviewControllerContext, ShellConfigurationContext } from './controller-context';

/** The shell as one React element: the controller and the configuration provided, the interface inside. */
export function CharcellApplication(props: { controller: PreviewController; configuration: CharcellShellConfiguration }) {
  return (
    <PreviewControllerContext.Provider value={props.controller}>
      <ShellConfigurationContext.Provider value={props.configuration}>
        <Application />
      </ShellConfigurationContext.Provider>
    </PreviewControllerContext.Provider>
  );
}
