import { useCallback, useEffect, useRef, useState } from 'react';

interface UseStatsState {
  stats: StatsBundle | null;
  loading: boolean;
  error: string | null;
}

/** Polls main for the latest StatsBundle. The numbers update slowly so a
 *  generous interval is fine; we also re-fetch on `config-changed`. */
export function useStats(): UseStatsState & { refresh: () => void } {
  const [state, setState] = useState<UseStatsState>({
    stats: null,
    loading: true,
    error: null,
  });
  const cancelledRef = useRef(false);

  const safeSetState = useCallback((updater: (s: UseStatsState) => UseStatsState) => {
    if (!cancelledRef.current) setState(updater);
  }, []);

  const fetch = useCallback(async () => {
    safeSetState((s) => ({ ...s, loading: s.stats === null, error: null }));
    try {
      const next = await window.blocker.getStats();
      safeSetState(() => ({ stats: next, loading: false, error: null }));
    } catch (err: any) {
      safeSetState((s) => ({
        ...s,
        loading: false,
        error: err?.message ?? 'Failed to load stats.',
      }));
    }
  }, [safeSetState]);

  useEffect(() => {
    cancelledRef.current = false;
    const run = async () => {
      await fetch();
    };
    void run();
    const t = setInterval(run, 30_000);
    const off = window.blocker.onConfigChanged(() => void run());
    return () => {
      cancelledRef.current = true;
      clearInterval(t);
      off();
    };
  }, [fetch]);

  return { ...state, refresh: () => void fetch() };
}
