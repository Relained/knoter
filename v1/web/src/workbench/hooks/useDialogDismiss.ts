import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Shared dialog behavior: Escape and a pointer-down landing on the backdrop
 * itself dismiss, Tab is trapped inside the dialog, and focus returns to
 * the element that opened it. Attach `containerRef` to the dialog box and
 * `onBackdropPointerDown` to the backdrop element.
 */
export function useDialogDismiss(onDismiss: () => void) {
  const containerRef = useRef<HTMLElement | null>(null);

  // Move focus into the dialog on open (unless an autoFocus element
  // already took it) and restore the opener on close.
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const container = containerRef.current;
    if (container && !container.contains(document.activeElement)) {
      focusables(container)[0]?.focus();
    }
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
        return;
      }
      if (event.key === "Tab") trapTab(event, containerRef.current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return {
    containerRef,
    onBackdropPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.target === event.currentTarget) onDismiss();
    },
  };
}

function trapTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const items = focusables(container);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && container.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((element) => element.offsetParent !== null);
}
