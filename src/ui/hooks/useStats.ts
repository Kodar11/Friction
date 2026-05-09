import { useEffect, useState } from 'react';

/** Polls main for the latest StatsBundle. The numbers update slowly so a
 *  generous interval is fine; we also re-fetch on `config-changed`. */
export function useStats(): StatsBundle | null {
  const [stats, setStats] = useState<StatsBundle | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const next = await window.blocker.getStats();
        if (!cancelled) setStats(next);
      } catch {
        // ignore
      }
    };
    void fetch();
    const t = setInterval(fetch, 30_000);
    const off = window.blocker.onConfigChanged(() => void fetch());
    return () => {
      cancelled = true;
      clearInterval(t);
      off();
    };
  }, []);

  return stats;
}
