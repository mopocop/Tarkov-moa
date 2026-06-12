// The "select deployment" board — what the map stage shows before a map is
// chosen. Replaces the old italic "Select a map" line with something useful:
// one card per supported map with its live quest count and (when squadded)
// how many squadmates are currently positioned there.

import { Crosshair, Scroll, UsersThree } from "@phosphor-icons/react";
import type { MapRow } from "./MapPicker";

interface MapEmptyStateProps {
  rows: MapRow[];
  /** Squadmates currently positioned per map id (self excluded). */
  squadCounts: Record<string, number>;
  onSelect: (mapId: string) => void;
}

export default function MapEmptyState({ rows, squadCounts, onSelect }: MapEmptyStateProps) {
  return (
    <div className="map-empty">
      <div className="map-empty__mark">
        <Crosshair weight="duotone" />
      </div>
      <h2 className="map-empty__title">Select deployment</h2>
      <p className="map-empty__sub">
        Pick a map below — or just take an in-game screenshot and Tarkov MoA
        jumps to where you are.
      </p>
      <div className="map-empty__grid">
        {rows.map((r) => {
          const squadHere = squadCounts[r.id] ?? 0;
          return (
            <button
              key={r.id}
              type="button"
              className="map-empty-card"
              onClick={() => onSelect(r.id)}
              title={`Open ${r.name}`}
            >
              <span className="map-empty-card__name">{r.name}</span>
              <span className="map-empty-card__meta">
                <span className={`map-empty-card__quests${r.count === 0 ? " zero" : ""}`}>
                  <Scroll weight="fill" />
                  {r.count} {r.count === 1 ? "quest" : "quests"}
                </span>
                {squadHere > 0 && (
                  <span className="map-empty-card__squad" title={`${squadHere} squadmate${squadHere > 1 ? "s" : ""} on this map`}>
                    <UsersThree weight="fill" />
                    {squadHere}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="map-empty__hint">
        Quest counts come from your live in-game progress.
      </p>
    </div>
  );
}
