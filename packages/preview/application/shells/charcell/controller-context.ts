// The shell's own way of reaching its controller and its configuration: two
// React contexts the root provides, and hooks over them. The controller SDK
// holds no context of its own; these belong to this shell.
import { createContext, useContext } from 'react';
import type { PreviewController, PreviewState } from '../../../src/shell';
import { usePreview } from '../../../src/react';
import type { CharcellShellConfiguration } from './configuration';

export const PreviewControllerContext = createContext<PreviewController | null>(null);

export const ShellConfigurationContext = createContext<CharcellShellConfiguration>({});

export function usePreviewController(): PreviewController {
  const controller = useContext(PreviewControllerContext);
  if (!controller) throw new Error('The charcell shell is rendered outside its controller context.');
  return controller;
}

/** A slice of the controller's state, re-rendering when it changes. */
export function usePreviewState<Selected>(selector: (state: PreviewState) => Selected): Selected {
  return usePreview(usePreviewController(), selector);
}

/** The slot fills and group placement the shell was made with. */
export function useShellConfiguration(): CharcellShellConfiguration {
  return useContext(ShellConfigurationContext);
}
