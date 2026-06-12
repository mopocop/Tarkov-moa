import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface SegmentedOption {
  id: string;
  label: ReactNode;
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (id: string) => void;
  /** Stretch options evenly to fill the container. */
  fullWidth?: boolean;
  className?: string;
}

/** Segmented control — a machined thumb slides behind the active option. */
export default function Segmented({ options, value, onChange, fullWidth, className }: SegmentedProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>(`[data-seg-id="${CSS.escape(value)}"]`);
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div
      ref={ref}
      className={['ui-seg', fullWidth && 'ui-seg--full', className].filter(Boolean).join(' ')}
    >
      {thumb && (
        <span
          className="ui-seg__thumb"
          style={{ width: thumb.w, transform: `translateX(${thumb.x - 3}px)`, left: 3 }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          data-seg-id={o.id}
          aria-pressed={o.id === value}
          className="ui-seg__opt"
          onClick={() => onChange(o.id)}
        >
          {o.icon && <span style={{ lineHeight: 0, fontSize: '1.15em' }}>{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}
