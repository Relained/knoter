import * as React from 'react';
import { cn } from './button';

// App-owned on/off control: a native button with the ARIA switch role, so it takes focus and
// toggles with Space or Enter like any button.
export function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'role' | 'onClick'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        'inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40',
        checked ? 'bg-primary' : 'bg-muted-foreground/45',
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span
        className={cn(
          'block size-3.5 rounded-full bg-background shadow-xs transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
