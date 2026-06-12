import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  children: ReactNode;
  /** Makes the chip a toggle; renders aria-pressed + brass tint when selected. */
  selected?: boolean;
  onClick?: () => void;
  /** Colored dot before the label (any CSS color). */
  dot?: string;
  /** Small mono count after the label. */
  count?: number;
  size?: 'sm' | 'md';
  icon?: ReactNode;
}

/** Pill chip — filters, categories, statuses. Clickable when onClick given. */
export default function Chip({
  children,
  selected,
  onClick,
  dot,
  count,
  size = 'md',
  icon,
  className,
  ...rest
}: ChipProps) {
  const cls = [
    'ui-chip',
    size === 'sm' && 'ui-chip--sm',
    onClick && 'ui-chip--clickable',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const inner = (
    <>
      {dot && <span className="ui-chip__dot" style={{ background: dot }} />}
      {icon && <span style={{ lineHeight: 0, fontSize: '1.1em' }}>{icon}</span>}
      {children}
      {count !== undefined && <span className="ui-chip__count">{count}</span>}
    </>
  );
  if (!onClick) {
    return (
      <span className={cls} {...(rest as React.HTMLAttributes<HTMLSpanElement>)}>
        {inner}
      </span>
    );
  }
  return (
    <button type="button" className={cls} aria-pressed={selected} onClick={onClick} {...rest}>
      {inner}
    </button>
  );
}
