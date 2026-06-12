import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The icon node (phosphor icon; sizes via 1em). */
  icon: ReactNode;
  /** Required — screen-reader name AND default tooltip via title. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'tertiary' | 'secondary' | 'danger';
  /** Toggled-on look (brass tint). Rendered as aria-pressed. */
  active?: boolean;
  /** Suppress the native title tooltip (when wrapped in <Tooltip>). */
  noTitle?: boolean;
}

/** Square icon-only button. `label` is mandatory for a11y. */
export default function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'tertiary',
  active,
  noTitle = false,
  className,
  ...rest
}: IconButtonProps) {
  const cls = [
    'ui-iconbtn',
    `ui-iconbtn--${size}`,
    variant !== 'tertiary' && `ui-iconbtn--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      className={cls}
      aria-label={label}
      title={noTitle ? undefined : label}
      aria-pressed={active}
      {...rest}
    >
      {icon}
    </button>
  );
}
