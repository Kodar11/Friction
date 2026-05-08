import { useCallback, useEffect, useState } from 'react';

interface UseConfigState {
  config: BlockerConfig | null;
  loading: boolean;
  error: string | null;
}

/**
 * Reads the config from the main process and keeps it in sync via the
 * `config-changed` event. Provides an optimistic `save` that updates local
 * state immediately and rolls back on IPC failure.
 */
export function useConfig() {
  const [state, setState] = useState<UseConfigState>({ config: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const cfg = await window.blocker.getConfig();
      setState({ config: cfg, loading: false, error: null });
    } catch (err: any) {
      setState({ config: null, loading: false, error: err?.message ?? String(err) });
    }
  }, []);

  useEffect(() => {
    void load();
    const off = window.blocker.onConfigChanged((cfg) => {
      setState({ config: cfg, loading: false, error: null });
    });
    return off;
  }, [load]);

  const save = useCallback(async (next: BlockerConfig): Promise<{ ok: boolean; error?: string }> => {
    const prev = state.config;
    setState((s) => ({ ...s, config: next }));
    const result = await window.blocker.saveConfig(next);
    if (!result.ok) {
      setState((s) => ({ ...s, config: prev, error: result.error ?? 'Save failed' }));
    }
    return result;
  }, [state.config]);

  /** Convenience: edit current config via a producer fn. */
  const update = useCallback(async (
    producer: (draft: BlockerConfig) => BlockerConfig | void,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!state.config) return { ok: false, error: 'No config loaded' };
    const draft: BlockerConfig = JSON.parse(JSON.stringify(state.config));
    const replaced = producer(draft);
    return save(replaced ?? draft);
  }, [state.config, save]);

  return { ...state, reload: load, save, update };
}
