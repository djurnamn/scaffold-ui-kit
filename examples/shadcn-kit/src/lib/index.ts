import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class values (strings, arrays, `{ class: condition }` objects) and lets later Tailwind utilities override earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const badgeBase =
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow] overflow-hidden';

const badgeVariantClasses: Record<BadgeVariant, string> = {
  default:
    'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
  secondary:
    'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
  destructive:
    'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 dark:bg-destructive/60',
  outline:
    'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
};

/** cva-style class builder, reusable outside the component: `<a className={badgeVariants({ variant: 'outline' })}>`. */
export function badgeVariants({
  variant = 'default',
}: { variant?: BadgeVariant } = {}): string {
  return cn(badgeBase, badgeVariantClasses[variant]);
}

export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const buttonBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const buttonVariantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
  destructive:
    'bg-destructive text-white shadow-xs hover:bg-destructive/90 dark:bg-destructive/60',
  outline:
    'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input',
  secondary:
    'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
  link: 'text-primary underline-offset-4 hover:underline',
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2 has-[>svg]:px-3',
  sm: 'h-8 rounded-md gap-1.5 px-3',
  lg: 'h-10 rounded-md px-6',
  icon: 'size-9',
};

/** cva-style class builder, reusable outside the component: `<a className={buttonVariants({ variant: 'outline' })}>`. */
export function buttonVariants({
  variant = 'default',
  size = 'default',
}: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  return cn(buttonBase, buttonVariantClasses[variant], buttonSizeClasses[size]);
}

/**
 * Keeps a native `<dialog>` in step with an `open` value: `showModal()` when it should show, `close()` when not.
 * Framework-agnostic; each target calls it whenever `open` changes, once the element exists.
 */
export function syncModal(
  dialog: HTMLDialogElement | null | undefined,
  open: boolean
): void {
  if (!dialog) return;
  if (open && !dialog.open) dialog.showModal();
  else if (!open && dialog.open) dialog.close();
}

/**
 * The keyboard pattern of a tab list: ArrowLeft and ArrowRight move to the previous or next enabled tab, wrapping
 * at the ends, and Home and End move to the first or last. The tab that gets focus is also clicked, so selection
 * follows focus. Framework-agnostic; call it from the tab list's `keydown` handler.
 */
export function moveTabsFocus(event: {
  key: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  preventDefault(): void;
}): void {
  const list = event.currentTarget as HTMLElement | null;
  const current = (event.target as HTMLElement | null)?.closest<HTMLElement>(
    '[role="tab"]'
  );
  if (!list || !current) return;
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].filter(
    (tab) =>
      tab.closest('[role="tablist"]') === list &&
      !tab.hasAttribute('disabled') &&
      tab.getAttribute('aria-disabled') !== 'true'
  );
  const index = tabs.indexOf(current);
  if (index === -1) return;
  const last = tabs.length - 1;
  const nextIndex =
    event.key === 'ArrowRight'
      ? index === last
        ? 0
        : index + 1
      : event.key === 'ArrowLeft'
        ? index === 0
          ? last
          : index - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : undefined;
  if (nextIndex === undefined) return;
  event.preventDefault();
  const next = tabs[nextIndex];
  if (!next) return;
  next.focus();
  next.click();
}
