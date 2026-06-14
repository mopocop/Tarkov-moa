// The "select deployment" board — what the map stage shows before a map is
// chosen. Replaces the old italic "Select a map" line with something useful:
// one card per supported map with its live quest count and (when squadded)
// how many squadmates are currently positioned there.

import { Crosshair, Scroll, UsersThree } from "@phosphor-icons/react";
import { useTranslation } from 'react-i18next';
import type { MapRow } from "./mapRows";

interface MapEmptyStateProps {
  rows: MapRow[];
  /** Squadmates currently positioned per map id (self excluded). */
  squadCounts: Record<string, number>;
  onSelect: (mapId: string) => void;
}

export default function MapEmptyState({ rows, squadCounts, onSelect }: MapEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="map-empty">
      <div className="map-empty__mark">
        <Crosshair weight="duotone" />
      </div>
      <h2 className="map-empty__title">{t('mapEmpty.selectDeployment')}</h2>
      <p className="map-empty__sub">
        {t('mapEmpty.pickMapSub')}
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
              title={t('mapEmpty.openMap', { name: r.name })}
            >
              <span className="map-empty-card__name">{r.name}</span>
              <span className="map-empty-card__meta">
                <span className={`map-empty-card__quests${r.count === 0 ? " zero" : ""}`}>
                  <Scroll weight="fill" />
                  {t('quests.questsWithCount', { count: r.count })}
                </span>
                {squadHere > 0 && (
                  <span className="map-empty-card__squad" title={t('mapEmpty.squadmateOnMap', { n: squadHere })}>
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
        {t('mapEmpty.questCountLive')}
      </p>
    </div>
  );
}
