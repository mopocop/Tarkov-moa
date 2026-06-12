import type { ReactNode } from 'react';

/** Keyboard key cap, mono. */
export default function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}
