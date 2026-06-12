import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Spinner from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon before the label (any node; phosphor icons size via 1em). */
  icon?: ReactNode;
  /** Icon after the label. */
  iconEnd?: ReactNode;
  /** Shows a spinner in the icon slot and blocks input. */
  loading?: boolean;
  /** Stretch to container width. */
  fullWidth?: boolean;
}

/** FIELD GLASS button. Brass primary is the signature — use it scarcely. */
export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    fullWidth && 'ui-btn--full',
    loading && 'ui-btn--loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? (
        <span className="ui-btn__icon"><Spinner size="sm" /></span>
      ) : (
        icon && <span className="ui-btn__icon">{icon}</span>
      )}
      {children}
      {!loading && iconEnd && <span className="ui-btn__icon">{iconEnd}</span>}
    </button>
  );
}
