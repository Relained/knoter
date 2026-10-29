import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, cn } from './button';

/**
 * A window inside the app window: a modal panel with its own title bar that can be
 * moved by dragging the title bar and maximized to fill the workspace.
 */
export function PopupWindow({
  open,
  onOpenChange,
  title,
  icon,
  description,
  actions,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon?: ReactNode;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [maximized, setMaximized] = useState(false);
  const drag = useRef<{ x: number; y: number; start: { x: number; y: number } } | null>(null);
  useEffect(() => {
    if (!open) {
      setOffset({ x: 0, y: 0 });
      setMaximized(false);
    }
  }, [open]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay popup-overlay" />
        <DialogPrimitive.Content
          className={cn('popup-window', maximized && 'popup-maximized', className)}
          style={
            maximized
              ? undefined
              : { transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }
          }
          {...(!description ? { 'aria-describedby': undefined } : {})}
          // Focus the window itself rather than its first title-bar button.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          // A control that records keys, such as a shortcut field, keeps Escape for itself.
          onEscapeKeyDown={(e) => {
            if ((e.target as Element | null)?.closest?.('[data-captures-escape]'))
              e.preventDefault();
          }}
        >
          <header
            className="popup-titlebar"
            onPointerDown={(e) => {
              if (maximized || e.button !== 0 || (e.target as Element).closest('button')) return;
              drag.current = { x: e.clientX, y: e.clientY, start: offset };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              // Keep the title bar reachable inside the app window.
              const limitX = window.innerWidth / 2 - 80;
              const limitY = window.innerHeight / 2 - 40;
              setOffset({
                x: Math.max(-limitX, Math.min(limitX, d.start.x + e.clientX - d.x)),
                y: Math.max(-limitY, Math.min(limitY, d.start.y + e.clientY - d.y)),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onDoubleClick={(e) => {
              if (!(e.target as Element).closest('button')) setMaximized(!maximized);
            }}
          >
            <span className="popup-title">
              {icon}
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            </span>
            <span className="popup-title-actions">
              {actions}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={maximized ? 'Restore window size' : 'Maximize window'}
                title={maximized ? 'Restore' : 'Maximize'}
                onClick={() => {
                  setMaximized(!maximized);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                {maximized ? <Minimize2 /> : <Maximize2 />}
              </Button>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`Close ${title}`} title="Close">
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </span>
          </header>
          {description && (
            <DialogPrimitive.Description className="sr-only">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="popup-body">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
