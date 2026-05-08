import { useEffect, useState } from 'react';

/** Whether the Electron process holds local-admin rights. Cached from the
 *  main process at startup; doesn't change over the app's lifetime. */
export function useAdminState(): AdminState | null {
  const [state, setState] = useState<AdminState | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await window.blocker.getAdminState();
        if (!cancelled) setState(next);
      } catch {
        if (!cancelled) setState({ isAdmin: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return state;
}
