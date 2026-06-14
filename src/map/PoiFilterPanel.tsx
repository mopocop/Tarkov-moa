import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Poi } from "../poi/types";
import type { PoiFilterState } from "../poi/filterState";
import { buildFacetGroups } from "../poi/facets";

interface PoiFilterPanelProps {
  // The current map's tarkov-dev POIs + custom markers, used only to build the
  // grouped facet tree with live counts (not for rendering markers).
  pois: Poi[];
  state: PoiFilterState;
  onToggleFacet: (key: string) => void;
  onSetAllFacets: (keys: string[], on: boolean) => void;
  /** Hide-all also clears any POI highlights (selection ≠ visibility). */
  onHideAll?: () => void;
  onToggleGrid: () => void;
  onSaveDefault: () => void;
}

export default function PoiFilterPanel({
  pois,
  state,
  onToggleFacet,
  onSetAllFacets,
  onHideAll,
  onToggleGrid,
  onSaveDefault,
}: PoiFilterPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const groups = useMemo(() => buildFacetGroups(pois), [pois]);
  const allKeys = useMemo(
    () => groups.flatMap((g) => g.facets.map((f) => f.key)),
    [groups],
  );
  // Collapsed groups by id (default: all expanded).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isOn = (key: string, defaultOn: boolean): boolean =>
    state.enabled[key] === undefined ? defaultOn : state.enabled[key];

  return (
    <div className="poi-panel">
      <div className="poi-bulk-actions">
        <button onClick={() => onSetAllFacets(allKeys, true)}>{t('common.showAll')}</button>
        <button
          onClick={() => {
            onSetAllFacets(allKeys, false);
            onHideAll?.();
          }}
        >
          {t('common.hideAll')}
        </button>
      </div>

      {groups.map((group) => {
        const isCollapsed = collapsed[group.id];
        const groupKeys = group.facets.map((f) => f.key);
        const total = group.facets.reduce((n, f) => n + f.count, 0);
        return (
          <div className="poi-facet-group" key={group.id}>
            <div
              className="poi-facet-group-header"
              onClick={() =>
                setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))
              }
            >
              <span className="poi-facet-caret">{isCollapsed ? "▸" : "▾"}</span>
              <span className="poi-facet-group-title">{group.label}</span>
              <button
                className="poi-group-bulk"
                onClick={(e) => {
                  e.stopPropagation();
                  const anyOn = group.facets.some((f) => isOn(f.key, f.defaultOn));
                  onSetAllFacets(groupKeys, !anyOn);
                }}
                title={t('map.toggleAllInGroup')}
              >
                {total}
              </button>
            </div>
            {!isCollapsed && (
              <div className="poi-facet-rows">
                {group.facets.map((f) => (
                  <label className="poi-facet-row" key={f.key}>
                    <input
                      type="checkbox"
                      checked={isOn(f.key, f.defaultOn)}
                      onChange={() => onToggleFacet(f.key)}
                    />
                    <span
                      className="poi-swatch"
                      style={{ color: f.color }}
                      // Raw Phosphor SVG from the registry (trusted, bundled asset)
                      dangerouslySetInnerHTML={{ __html: f.icon }}
                    />
                    <span className="poi-facet-label">{f.label}</span>
                    <span className="poi-filter-count">{f.count}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="poi-map-options">
        <button className="poi-save-default" onClick={onSaveDefault}>
          {t('map.saveAsDefault')}
        </button>
        <button
          className={`poi-toggle-btn${state.gridVisible ? " active" : ""}`}
          onClick={onToggleGrid}
        >
          {state.gridVisible ? t('map.referenceGridOn') : t('map.referenceGridOff')}
        </button>
        <p className="poi-hint">{t('map.clickToDropMarker')}</p>
      </div>
    </div>
  );
}
