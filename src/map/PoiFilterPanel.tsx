import React, { useMemo, useState } from "react";
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
  onToggleGrid: () => void;
  onSaveDefault: () => void;
}

export default function PoiFilterPanel({
  pois,
  state,
  onToggleFacet,
  onSetAllFacets,
  onToggleGrid,
  onSaveDefault,
}: PoiFilterPanelProps): React.JSX.Element {
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
        <button onClick={() => onSetAllFacets(allKeys, true)}>Show all</button>
        <button onClick={() => onSetAllFacets(allKeys, false)}>Hide all</button>
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
                title="Toggle all in this group"
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
          Save as default
        </button>
        <button
          className={`poi-toggle-btn${state.gridVisible ? " active" : ""}`}
          onClick={onToggleGrid}
        >
          Reference grid: {state.gridVisible ? "On" : "Off"}
        </button>
        <p className="poi-hint">Click the map to drop a marker · click a marker to remove it.</p>
      </div>
    </div>
  );
}
