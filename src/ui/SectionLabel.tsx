import type { ReactNode } from 'react';

export interface SectionLabelProps {
  children: ReactNode;
  /** Mono count at the end (e.g. number of quests). */
  count?: number;
  className?: string;
}

/** Etched section heading with a hairline rule — the FIELD GLASS "engraving". */
export default function SectionLabel({ children, count, className }: SectionLabelProps) {
  return (
    <h3 className={['ui-section-label', className].filter(Boolean).join(' ')}>
      {children}
      {count !== undefined && <span className="ui-section-label__count">{count}</span>}
    </h3>
  );
}
