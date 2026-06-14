import React, { useEffect, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { useTranslation } from 'react-i18next';
import type { DerivedQuestState } from "../quests/derive";
import { buildMapRows, questCountOpacity } from "./mapRows";

function CountBadge({ count }: { count: number }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <span className="map-picker__count" style={{ opacity: questCountOpacity(count) }}>
      {t('quests.questsWithCount', { count })}
    </span>
  );
}

interface MapPickerProps {
  availableObjectivesByMap: DerivedQuestState["availableObjectivesByMap"];
  availableTasksByMap: DerivedQuestState["availableTasksByMap"];
  selectedMapId: string | null;
  onSelect: (mapId: string) => void;
}

// Custom dropdown (a native <select> can't right-align a colored, count-scaled
// value per option). A trigger shows the current map; the menu lists every map
// with its quest count pushed to the right, brass-tinted by how many.
export default function MapPicker({
  availableObjectivesByMap,
  availableTasksByMap,
  selectedMapId,
  onSelect,
}: MapPickerProps): React.JSX.Element {
  const { t } = useTranslation();
  const rows = buildMapRows(availableObjectivesByMap, availableTasksByMap);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside pointer-down or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (rows.length === 0) {
    return <p className="muted">{t('mapPicker.noSupportedMaps')}</p>;
  }

  const selected = rows.find((r) => r.id === selectedMapId) ?? null;

  return (
    <div className="map-picker" ref={rootRef}>
      <button
        type="button"
        className="map-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="map-picker__name">{selected ? selected.name : t('mapPicker.selectMap')}</span>
        {selected && <CountBadge count={selected.count} />}
        <CaretDown className="map-picker__caret" weight="bold" />
      </button>

      {open && (
        <ul className="map-picker__menu" role="listbox">
          {rows.map((row) => (
            <li key={row.id} role="option" aria-selected={row.id === selectedMapId}>
              <button
                type="button"
                className={`map-picker__row${row.id === selectedMapId ? " selected" : ""}`}
                onClick={() => {
                  onSelect(row.id);
                  setOpen(false);
                }}
              >
                <span className="map-picker__name">{row.name}</span>
                <span className="map-picker__leader" />
                <CountBadge count={row.count} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
