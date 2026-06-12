import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  uiSize?: 'sm' | 'md' | 'lg';
  /** Leading icon inside the field. */
  icon?: ReactNode;
  /** Red border + ring. Pair with Field's error text. */
  invalid?: boolean;
  /** Mono + tracked — join codes, coordinates. */
  mono?: boolean;
}

export function Input({ uiSize = 'md', icon, invalid, mono, className, ...rest }: InputProps) {
  const cls = [
    'ui-input',
    uiSize !== 'md' && `ui-input--${uiSize}`,
    icon && 'ui-input--with-icon',
    invalid && 'ui-input--invalid',
    mono && 'ui-input--mono',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  if (!icon) return <input className={cls} aria-invalid={invalid || undefined} {...rest} />;
  return (
    <span className="ui-input-wrap">
      <span className="ui-input-wrap__icon">{icon}</span>
      <input className={cls} aria-invalid={invalid || undefined} {...rest} />
    </span>
  );
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function TextArea({ invalid, className, ...rest }: TextAreaProps) {
  const cls = ['ui-textarea', invalid && 'ui-textarea--invalid', className]
    .filter(Boolean)
    .join(' ');
  return <textarea className={cls} aria-invalid={invalid || undefined} {...rest} />;
}

export default Input;
