"use client";

import { useEffect, useState } from "react";

/** Holds a value until it has been quiet for `delay` ms, so typing does not fire a request per key. */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
