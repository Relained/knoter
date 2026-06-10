import { useEffect } from "react";
import type { PointerEvent } from "react";

/**
 * Shared dialog dismissal: Escape closes, and a pointer-down landing on the
 * backdrop itself (not on dialog content) closes. Spread the returned
 * handler onto the backdrop element's onPointerDown.
 */
export function useDialogDismiss(onDismiss: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onDismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return {
    onBackdropPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.target === event.currentTarget) onDismiss();
    },
  };
}
