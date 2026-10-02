// Drag handle on the rail panel's map-facing edge. Drag to resize, arrow keys
// to nudge (Shift = bigger steps), Home/End for min/max, double-click or Enter
// to restore the default width. See .rail-resizer in shell.css.

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RAIL_WIDTH_MAX, RAIL_WIDTH_MIN } from '../app/useRailWidth';

interface RailResizerProps {
  side: 'left' | 'right';
  width: number;
  onResize: (w: number) => void;
  onReset: () => void;
}

const STEP = 16;
const BIG_STEP = 64;

export default function RailResizer({ side, width, onResize, onReset }: RailResizerProps) {
  const { t } = useTranslation();
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  // With the rail on the right the handle sits on the panel's left edge, so
  // moving the pointer left makes the panel wider.
  const dir = side === 'left' ? 1 : -1;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startW: width };
    document.body.classList.add('is-resizing-rail');
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(drag.current.startW + (e.clientX - drag.current.startX) * dir);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.classList.remove('is-resizing-rail');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === grow) onResize(width + step);
    else if (e.key === shrink) onResize(width - step);
    else if (e.key === 'Home') onResize(RAIL_WIDTH_MIN);
    else if (e.key === 'End') onResize(RAIL_WIDTH_MAX);
    else if (e.key === 'Enter') onReset();
    else return;
    e.preventDefault();
  };

  return (
    <div
      className="rail-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('rail.resizePanel')}
      aria-valuenow={width}
      aria-valuemin={RAIL_WIDTH_MIN}
      aria-valuemax={RAIL_WIDTH_MAX}
      title={t('rail.resizePanelHint')}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
