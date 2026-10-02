import { useEffect, useRef } from 'react';

// A ref that always holds the latest value. Lets a stable callback (one that
// Leaflet or a map handler binds once) read fresh state without being
// recreated. Only read it inside event handlers, never during render: it is
// synced in an effect after each commit.
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
