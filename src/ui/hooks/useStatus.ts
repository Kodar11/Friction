import { useEffect, useState } from 'react';

export function useStatus() {
  const [status, setStatus] = useState<BlockerStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const s = await window.blocker.getStatus();
        if (!cancelled) setStatus(s);
      } catch {
        // ignore — service might be starting
      }
    };
    void fetchOnce();
    const off = window.blocker.onStatusChanged((s) => setStatus(s));
    // Poll as a fallback in case the main-process push interval misses an event.
    const interval = setInterval(() => void fetchOnce(), 10_000);
    return () => {
      cancelled = true;
      off();
      clearInterval(interval);
    };
  }, []);

  return status;
}
