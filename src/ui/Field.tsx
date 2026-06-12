import type { ReactNode } from 'react';

export interface FieldProps {
  /** Etched uppercase label above the control. */
  label?: ReactNode;
  /** Faint helper text below. */
  hint?: ReactNode;
  /** Red error text below (overrides hint). */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error stack. Wrap any Input/Select/TextArea. */
export default function Field({ label, hint, error, children, className }: FieldProps) {
  return (
    <label className={['ui-field', className].filter(Boolean).join(' ')}>
      {label && <span className="ui-field__label">{label}</span>}
      {children}
      {error ? (
        <span className="ui-field__error">{error}</span>
      ) : (
        hint && <span className="ui-field__hint">{hint}</span>
      )}
    </label>
  );
}
