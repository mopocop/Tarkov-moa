export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Accessible name for the switch. */
  label?: string;
}

/** On/off switch. Brass when on. */
export default function Toggle({ checked, onChange, size = 'md', disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`ui-toggle ui-toggle--${size}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-toggle__thumb" />
    </button>
  );
}
