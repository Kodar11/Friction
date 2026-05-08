import { useEffect, useState } from 'react';

/** Polls the Electron main process for { installed, running } of the
 *  Windows Service. Useful for driving the install-prompt banner. */
export function useServiceState(): ServiceState | null {
  const [state, setState] = useState<ServiceState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const next = await window.blocker.getServiceState();
        if (!cancelled) setState(next);
      } catch {
        // ignore — main process not ready yet
      }
    };
    void fetch();
    const t = setInterval(fetch, 4_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return state;
}
