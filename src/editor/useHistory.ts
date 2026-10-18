import { useCallback, useRef, useState } from 'react';

const LIMIT = 100;
const COALESCE_MS = 1200;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * Undo/redo state. Updates sharing a coalesce key within a short window
 * (slider drags, typing, timeline drags) collapse into one undo step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [] });
  const last = useRef<{ key: string; time: number } | null>(null);

  const update = useCallback((updater: (prev: T) => T, coalesceKey?: string) => {
    const now = performance.now();
    const merge =
      !!coalesceKey && last.current?.key === coalesceKey && now - last.current.time < COALESCE_MS;
    last.current = coalesceKey ? { key: coalesceKey, time: now } : null;
    setState((s) => {
      const next = updater(s.present);
      if (next === s.present) return s;
      if (merge) return { ...s, present: next };
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = null;
    setState((s) =>
      s.past.length
        ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] }
        : s
    );
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    setState((s) =>
      s.future.length
        ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) }
        : s
    );
  }, []);

  return {
    state: state.present,
    update,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
