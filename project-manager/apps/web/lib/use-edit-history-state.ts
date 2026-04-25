"use client";

import { useCallback, useMemo, useState } from "react";

type Updater<T> = T | ((prev: T) => T);

type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
};

type SetOptions = {
  record?: boolean;
};

type HistoryOptions<T> = {
  equals?: (a: T, b: T) => boolean;
  maxSize?: number;
};

function applyUpdater<T>(updater: Updater<T>, prev: T): T {
  if (typeof updater === "function") {
    return (updater as (value: T) => T)(prev);
  }
  return updater;
}

export function useEditHistoryState<T>(initialValue: T, options?: HistoryOptions<T>) {
  const equals = options?.equals ?? ((a: T, b: T) => Object.is(a, b));
  const maxSize = Math.max(1, options?.maxSize ?? 200);
  const [state, setState] = useState<HistoryState<T>>({
    past: [],
    present: initialValue,
    future: [],
  });

  const setPresent = useCallback(
    (updater: Updater<T>, setOptions?: SetOptions) => {
      const record = setOptions?.record ?? true;
      setState((prev) => {
        const next = applyUpdater(updater, prev.present);
        if (equals(prev.present, next)) {
          return prev;
        }
        if (!record) {
          return {
            ...prev,
            present: next,
          };
        }
        const nextPast = [...prev.past, prev.present];
        if (nextPast.length > maxSize) {
          nextPast.splice(0, nextPast.length - maxSize);
        }
        return {
          past: nextPast,
          present: next,
          future: [],
        };
      });
    },
    [equals, maxSize],
  );

  const reset = useCallback(
    (nextValue: T) => {
      setState((prev) => {
        if (equals(prev.present, nextValue) && prev.past.length === 0 && prev.future.length === 0) {
          return prev;
        }
        return {
          past: [],
          present: nextValue,
          future: [],
        };
      });
    },
    [equals],
  );

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) {
        return prev;
      }
      const nextPresent = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: nextPresent,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) {
        return prev;
      }
      const [nextPresent, ...rest] = prev.future;
      const nextPast = [...prev.past, prev.present];
      if (nextPast.length > maxSize) {
        nextPast.splice(0, nextPast.length - maxSize);
      }
      return {
        past: nextPast,
        present: nextPresent,
        future: rest,
      };
    });
  }, [maxSize]);

  return useMemo(
    () => ({
      present: state.present,
      setPresent,
      reset,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [redo, reset, setPresent, state.future.length, state.past.length, state.present, undo],
  );
}
