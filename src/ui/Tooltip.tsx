import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
  /** Tooltip body text. */
  content: ReactNode;
  /** Optional dimmed shortcut hint, mono (e.g. "Esc"). */
  hint?: string;
  children: ReactNode;
  /** Preferred side; flips if there's no room. Default 'top'. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Show delay in ms. Default 350. */
  delay?: number;
}

const GAP = 8;

/** Hover/focus tooltip. Wraps its child in an inline-flex span. */
export default function Tooltip({ content, hint, children, side = 'top', delay = 350 }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; side: string } | null>(null);

  const show = () => {
    timerRef.current = window.setTimeout(() => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      let s = side;
      if (s === 'top' && r.top < 60) s = 'bottom';
      if (s === 'bottom' && r.bottom > window.innerHeight - 60) s = 'top';
      if (s === 'left' && r.left < 220) s = 'right';
      if (s === 'right' && r.right > window.innerWidth - 220) s = 'left';
      const x = s === 'left' ? r.left - GAP : s === 'right' ? r.right + GAP : r.left + r.width / 2;
      const y = s === 'top' ? r.top - GAP : s === 'bottom' ? r.bottom + GAP : r.top + r.height / 2;
      setPos({ x, y, side: s });
    }, delay);
  };
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPos(null);
  };

  // A click (e.g. opening a modal) removes the element from under the cursor, so
  // the mouseleave that would normally hide the tip never fires and it sticks.
  // While a tip is up, dismiss it on any pointer-down, scroll, or window blur.
  useEffect(() => {
    if (!pos) return;
    const dismiss = () => hide();
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('mousedown', dismiss, true);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('blur', dismiss);
    return () => {
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('mousedown', dismiss, true);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('blur', dismiss);
    };
  }, [pos]);

  const transform =
    pos?.side === 'top' ? 'translate(-50%, -100%)'
    : pos?.side === 'bottom' ? 'translate(-50%, 0)'
    : pos?.side === 'left' ? 'translate(-100%, -50%)'
    : 'translate(0, -50%)';

  return (
    <span
      ref={anchorRef}
      style={{ display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      // Clicking the trigger cancels a still-pending tip too (click before the
      // open delay elapsed) — otherwise it pops up over the modal you just opened.
      onPointerDown={hide}
    >
      {children}
      {pos &&
        createPortal(
          <div className="ui-tip" style={{ left: pos.x, top: pos.y, transform }} role="tooltip">
            {content}
            {hint && <span className="ui-tip__hint">{hint}</span>}
          </div>,
          document.body,
        )}
    </span>
  );
}
