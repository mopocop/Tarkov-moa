import type { ChangeEvent } from 'react';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Accessible name. */
  label: string;
  /** Optional readout rendered to the right (e.g. "+1.0"). */
  valueText?: string;
  className?: string;
}

/** Range input on the design system — graphite track, brass thumb. */
export default function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  label,
  valueText,
  className,
}: SliderProps) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value));
  return (
    <div className={['ui-slider-row', className].filter(Boolean).join(' ')}>
      <input
        type="range"
        className="ui-slider"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        onChange={handle}
      />
      {valueText !== undefined && <span className="ui-slider__value">{valueText}</span>}
    </div>
  );
}
