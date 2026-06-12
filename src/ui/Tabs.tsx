import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Underline tabs with a sliding brass indicator. */
export default function Tabs({ items, value, onChange, className }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(value)}"]`);
      if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [value, items]);

  return (
    <div ref={listRef} role="tablist" className={['ui-tabs', className].filter(Boolean).join(' ')}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          data-tab-id={it.id}
          aria-selected={it.id === value}
          className="ui-tabs__tab"
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
      {bar && (
        <span
          className="ui-tabs__indicator"
          style={{ width: bar.w, transform: `translateX(${bar.x}px)`, left: 0 }}
        />
      )}
    </div>
  );
}
