import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Default 'md'. */
  pad?: 'none' | 'sm' | 'md' | 'lg';
  /** Sunken well look (recessed, no edge highlight). */
  sunken?: boolean;
  /** Hover/press affordance for clickable cards. */
  interactive?: boolean;
  /** Brass-tinted selected state. */
  selected?: boolean;
}

export default function Card({
  pad = 'md',
  sunken,
  interactive,
  selected,
  className,
  children,
  ...rest
}: CardProps) {
  const cls = [
    'ui-card',
    pad !== 'none' && `ui-card--pad-${pad}`,
    sunken && 'ui-card--sunken',
    interactive && 'ui-card--interactive',
    selected && 'ui-card--selected',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
