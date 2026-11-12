import { defineTemplate } from '@js-template-engine/types';

// WAI-ARIA APG: Tooltip. The root owns the open state, the two ids and one
// pending timer, and hands { open, triggerId, contentId, scheduleOpen,
// scheduleClose, openNow, closeNow } to TooltipTrigger and TooltipContent
// through each framework's context. Hover opens after `openDelay`, focus opens
// at once, leaving or blurring closes, Escape closes. The pointer may move onto
// the content without it closing (WCAG 1.4.13).
//
// The timer logic and the Escape listener are one shared script. The timer
// handle must live as long as the instance: a `useRef` in React, a plain holder
// in Vue and Svelte (whose scripts run once), each cleared on unmount. All
// three holders have the same `{ current }` shape, so the shared script reads
// them the same way. The document-level Escape listener is attached while the
// tooltip is open by each target's effect (`useEffect`, `watchPostEffect`,
// `$effect`), which also removes it on close and on unmount.
export default defineTemplate({
  type: 'component',
  name: 'Tooltip',
  parts: ['TooltipTrigger', 'TooltipContent'],
  description:
    'The root of a tooltip. Owns the open state and the delays; put a `TooltipTrigger` and a `TooltipContent` inside it. Hover opens after `openDelay`, keyboard focus opens at once, Escape closes, and the pointer may move onto the content without it closing.',
  props: {
    open: {
      type: 'boolean',
      description:
        'The open state. Leave it out to let the tooltip keep its own.',
      bindable: {
        current: 'isOpen',
        setter: 'setOpen',
        defaultProp: 'defaultOpen',
        changeProp: 'onOpenChange',
      },
    },
    defaultOpen: {
      type: 'boolean',
      default: false,
      description: 'The initial open state when uncontrolled.',
    },
    onOpenChange: {
      type: '(open: boolean) => void',
      description: 'Called with the next open state.',
    },
    openDelay: {
      type: 'number',
      default: 500,
      description:
        'Milliseconds the pointer rests on the trigger before the tooltip opens.',
    },
    closeDelay: {
      type: 'number',
      default: 150,
      description:
        'Milliseconds after the pointer leaves before the tooltip closes.',
    },
  },
  ids: { triggerId: 'tooltip-trigger', contentId: 'tooltip-content' },
  rest: { tag: 'div' },
  imports: [
    'export interface TooltipContextValue {\n  open: boolean;\n  triggerId: string;\n  contentId: string;\n  scheduleOpen: () => void;\n  scheduleClose: () => void;\n  openNow: () => void;\n  closeNow: () => void;\n}',
  ],
  script: [
    'function clearTimer() {',
    '  if (timer.current !== undefined) clearTimeout(timer.current);',
    '  timer.current = undefined;',
    '}',
    'function scheduleOpen() {',
    '  clearTimer();',
    '  timer.current = setTimeout(() => setOpen(true), openDelay);',
    '}',
    'function scheduleClose() {',
    '  clearTimer();',
    '  timer.current = setTimeout(() => setOpen(false), closeDelay);',
    '}',
    'function openNow() {',
    '  clearTimer();',
    '  setOpen(true);',
    '}',
    'function closeNow() {',
    '  clearTimer();',
    '  setOpen(false);',
    '}',
    '// Escape closes an open tooltip wherever focus is, so one opened by hover',
    '// alone can be dismissed without moving the pointer. Returns the cleanup.',
    'function listenForEscape() {',
    '  const handleKeyDown = (event: KeyboardEvent) => {',
    "    if (event.key === 'Escape') closeNow();",
    '  };',
    "  document.addEventListener('keydown', handleKeyDown);",
    "  return () => document.removeEventListener('keydown', handleKeyDown);",
    '}',
  ].join('\n'),
  extensions: {
    react: {
      imports: [
        "import { createContext, useContext, useEffect, useRef } from 'react';",
        'export const TooltipContext = createContext<TooltipContextValue | null>(null);',
        'export function useTooltipContext(part: string): TooltipContextValue {\n  const context = useContext(TooltipContext);\n  if (!context) throw new Error(`<${part}> must be used within <Tooltip>`);\n  return context;\n}',
      ],
      script: [
        'const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);',
        'useEffect(() => () => clearTimeout(timer.current), []);',
        'useEffect(() => (isOpen ? listenForEscape() : undefined), [isOpen]);',
        'const context = { open: isOpen, triggerId, contentId, scheduleOpen, scheduleClose, openNow, closeNow };',
      ].join('\n'),
    },
    vue: {
      imports: [
        "import { onBeforeUnmount, provide, reactive, watchPostEffect, type InjectionKey } from 'vue';",
        "export const tooltipKey: InjectionKey<TooltipContextValue> = Symbol('tooltip');",
      ],
      script: [
        'const timer: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined };',
        'onBeforeUnmount(() => clearTimeout(timer.current));',
        'watchPostEffect((onCleanup) => {\n  if (isOpen.value) onCleanup(listenForEscape());\n});',
        'provide(tooltipKey, reactive({ open: isOpen, triggerId, contentId, scheduleOpen, scheduleClose, openNow, closeNow }));',
      ].join('\n'),
    },
    svelte: {
      imports: [
        "import { onDestroy, setContext } from 'svelte';",
        "import { toStore, type Readable } from 'svelte/store';",
        "export const tooltipKey = Symbol('tooltip');",
        'export type TooltipContextStore = Readable<TooltipContextValue>;',
      ],
      script: [
        'const timer: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined };',
        'onDestroy(() => clearTimeout(timer.current));',
        '$effect(() => {\n  if (isOpen) return listenForEscape();\n});',
        'setContext(tooltipKey, toStore(() => ({ open: isOpen, triggerId, contentId, scheduleOpen, scheduleClose, openNow, closeNow })));',
      ].join('\n'),
    },
  },
  children: [
    {
      // React provides a context by rendering it; Vue and Svelte provide it from the script.
      type: 'fragment',
      extensions: {
        react: {
          tag: 'TooltipContext',
          attributes: { value: { $expression: 'context' } },
        },
      },
      children: [
        {
          type: 'element',
          tag: 'div',
          attributes: {
            $spread: { $expression: 'rest' },
            'data-state': { $expression: "isOpen ? 'open' : 'closed'" },
          },
          children: [{ type: 'slot' }],
        },
      ],
    },
  ],
});
