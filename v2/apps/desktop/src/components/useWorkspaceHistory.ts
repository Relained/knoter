import { useEffect, useRef, useState } from 'react';
import {
  historyEntry,
  readHistoryEnd,
  readRoute,
  routeHref,
  writeEntry,
  writeHistoryEnd,
  type HistoryEntry,
  type WorkspaceRoute,
} from '../api/navigationHistory';

export function useWorkspaceHistory(
  guard: (action: () => void) => void,
  onArrival: () => void,
  blocked: boolean,
) {
  const [route, setRoute] = useState(readRoute);
  const [entry, setEntry] = useState<HistoryEntry>(
    () => historyEntry() ?? { session: crypto.randomUUID(), index: 0 },
  );
  const [end, setEnd] = useState(() => readHistoryEnd(entry));
  const cursor = useRef(entry);
  const currentRoute = useRef(route);
  const callbacks = useRef({ guard, onArrival, blocked });
  callbacks.current = { guard, onArrival, blocked };
  const restoring = useRef<{ delta: number } | null>(null);
  const allowed = useRef(false);
  const apply = (next: HistoryEntry, nextRoute: WorkspaceRoute) => {
    cursor.current = next;
    currentRoute.current = nextRoute;
    setEntry(next);
    setRoute(nextRoute);
    callbacks.current.onArrival();
  };
  useEffect(() => {
    writeEntry(cursor.current, currentRoute.current, true);
    const pop = () => {
      let next = historyEntry();
      if (!next || next.session !== cursor.current.session) {
        // A manually entered hash is a new route within this app.
        next = { ...cursor.current, index: cursor.current.index + 1 };
        writeEntry(next, readRoute(), true);
        writeHistoryEnd(next);
        setEnd(next.index);
      }
      if (restoring.current) {
        const pending = restoring.current;
        if (next.index !== cursor.current.index) {
          history.go(cursor.current.index - next.index);
          return;
        }
        restoring.current = null;
        callbacks.current.guard(() => {
          allowed.current = true;
          history.go(pending.delta);
        });
        return;
      }
      if (allowed.current) {
        allowed.current = false;
        apply(next, readRoute());
        return;
      }
      if (!callbacks.current.blocked) {
        apply(next, readRoute());
        return;
      }
      const delta = next.index - cursor.current.index;
      if (!delta) return;
      // Restore the current entry before the asynchronous discard dialog opens.
      // Cancelling then leaves both the URL and the forward stack intact.
      restoring.current = { delta };
      history.go(-delta);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const push = (nextRoute: WorkspaceRoute) => {
    if (routeHref(nextRoute) === routeHref(currentRoute.current)) return;
    const next = { ...cursor.current, index: cursor.current.index + 1 };
    writeEntry(next, nextRoute);
    writeHistoryEnd(next);
    setEnd(next.index);
    apply(next, nextRoute);
  };
  return {
    route,
    push,
    replace: (nextRoute: WorkspaceRoute) => {
      writeEntry(cursor.current, nextRoute, true);
      apply(cursor.current, nextRoute);
    },
    back: () => history.back(),
    forward: () => history.forward(),
    canBack: entry.index > 0,
    canForward: entry.index < end,
  };
}
