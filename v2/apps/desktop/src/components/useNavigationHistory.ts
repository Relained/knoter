import { useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';
import {
  readNavigationHistory,
  recordNavigation,
  saveNavigationHistory,
} from '../api/navigationHistory';

// React Router owns navigation. This journal only bounds the app's toolbar arrows.
export function useNavigationHistory() {
  const { key, pathname, search, hash } = useLocation();
  // Direct hash changes can share Router's fallback key; never alias different URLs.
  const entry = JSON.stringify([key, pathname, search, hash]);
  const action = useNavigationType();
  const navigate = useNavigate();
  const [journal, setJournal] = useState(() => readNavigationHistory(entry));

  useLayoutEffect(() => {
    setJournal((previous) => recordNavigation(previous, entry, action));
  }, [entry, action]);
  useLayoutEffect(() => saveNavigationHistory(journal), [journal]);

  return {
    canBack: journal.index > 0,
    canForward: journal.index < journal.keys.length - 1,
    back: () => {
      if (journal.index > 0) void navigate(-1);
    },
    forward: () => {
      if (journal.index < journal.keys.length - 1) void navigate(1);
    },
  };
}
