import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TarkovDevClient, type ApiLang } from '../api/tarkov-dev';
import { i18n } from '../i18n';
import { poisByMap } from '../poi/fromTarkovDev';
import {
  loadFilterState,
  saveFilterState,
  isPoiVisible,
  type PoiFilterState,
} from '../poi/filterState';
import { facetDefaultOn } from '../poi/facets';
import {
  loadCustomPois,
  saveCustomPois,
  addCustomPoi,
  removeCustomPoi,
  poiToWireMarker,
} from '../poi/customPoi';
import type { Poi } from '../poi/types';
import type { SquadApi } from '../squad/SquadContext';
import { useLatest } from '../hooks/useLatest';

interface Options {
  selectedMapId: string | null;
  squad: SquadApi;
  notify: (message: string) => void;
}

function fetchPois(onLoaded: (byMap: Record<string, Poi[]>) => void, label: string) {
  void new TarkovDevClient(i18n.language as ApiLang)
    .getMapPois()
    .then((maps) => onLoaded(poisByMap(maps)))
    .catch((e) => console.warn(`[POIs] ${label} failed (offline?):`, e));
}

// Map intel: tarkov.dev POIs, the user's own markers, the facet filters that
// decide what is drawn, and which POIs are highlighted.
export function usePois({ selectedMapId, squad, notify }: Options) {
  const { t } = useTranslation();
  const squadRef = useLatest(squad);
  // tarkov.dev POI data indexed by map id.
  const [poisByMapId, setPoisByMapId] = useState<Record<string, Poi[]>>({});
  const [filterState, setFilterState] = useState<PoiFilterState>(() => loadFilterState());
  // POIs highlight independently — several can be lit at once (like quest pins),
  // not a single radio selection. Cleared on map change and by "Hide all".
  const [selectedPoiIds, setSelectedPoiIds] = useState<Set<string>>(() => new Set());
  const [customPois, setCustomPois] = useState<Poi[]>(() => loadCustomPois());

  // Load tarkov.dev POI data once, in the background (non-blocking; 24h cached).
  // Swallow errors offline — quest data + map still work without POIs.
  useEffect(() => {
    fetchPois(setPoisByMapId, 'load');
  }, []);

  // POI names are localized, so a language switch re-fetches them.
  useEffect(() => {
    const onLangChange = (): void => fetchPois(setPoisByMapId, 'reload');
    i18n.on('languageChanged', onLangChange);
    return () => {
      i18n.off('languageChanged', onLangChange);
    };
  }, []);

  // POI filters are NOT auto-persisted — the user saves the current set as the
  // default explicitly (see saveDefault / the "Save as default" button), so
  // they can explore freely without clobbering their saved layout.

  // Persist custom markers whenever they change.
  useEffect(() => {
    saveCustomPois(customPois);
  }, [customPois]);

  // Highlights belong to the map they were made on.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPoiIds(new Set());
  }, [selectedMapId]);

  const currentPois = useMemo<Poi[]>(
    () => (selectedMapId ? poisByMapId[selectedMapId] ?? [] : []),
    [poisByMapId, selectedMapId],
  );

  const currentCustomPois = useMemo(
    () => customPois.filter((p) => p.mapId === selectedMapId),
    [customPois, selectedMapId],
  );

  // The panel builds its grouped facet tree from tarkov-dev POIs + custom
  // markers so the "My markers" count is accurate.
  const panelPois = useMemo(
    () => [...currentPois, ...currentCustomPois],
    [currentPois, currentCustomPois],
  );

  const poiVisible = useCallback(
    (poi: Poi) => isPoiVisible(poi, filterState),
    [filterState],
  );

  const customEnabled = filterState.enabled.custom ?? facetDefaultOn('custom');

  const toggleFacet = useCallback((key: string) => {
    setFilterState((s) => ({
      ...s,
      enabled: { ...s.enabled, [key]: !(s.enabled[key] ?? facetDefaultOn(key)) },
    }));
  }, []);

  const setAllFacets = useCallback((keys: string[], on: boolean) => {
    setFilterState((s) => {
      const enabled = { ...s.enabled };
      for (const k of keys) enabled[k] = on;
      return { ...s, enabled };
    });
  }, []);

  const toggleGrid = useCallback(
    () => setFilterState((s) => ({ ...s, gridVisible: !s.gridVisible })),
    [],
  );

  // Persist the current filter set as the saved default (explicit — see button).
  const saveDefault = useCallback(() => {
    saveFilterState(filterState);
    notify(t('common.filtersSavedAsDefault'));
  }, [filterState, notify, t]);

  const togglePoi = useCallback((poi: Poi) => {
    setSelectedPoiIds((cur) => {
      const next = new Set(cur);
      if (next.has(poi.id)) next.delete(poi.id);
      else next.add(poi.id);
      return next;
    });
  }, []);

  const clearPoiSelection = useCallback(() => setSelectedPoiIds(new Set()), []);

  // ---- Custom markers ----
  const addCustom = useCallback((poi: Poi) => {
    setCustomPois((cur) => addCustomPoi(cur, poi));
    // Ensure "My markers" is on so a just-placed marker is actually visible.
    setFilterState((s) =>
      s.enabled.custom ? s : { ...s, enabled: { ...s.enabled, custom: true } },
    );
    // Share with the squad if we're in one. Markers placed WHILE squadded are
    // shared; joining doesn't retroactively broadcast your back-catalog.
    if (squadRef.current.inSquad) squadRef.current.addMarker(poiToWireMarker(poi));
  }, [squadRef]);

  const removeCustom = useCallback((id: string) => {
    setCustomPois((cur) => removeCustomPoi(cur, id));
    if (squadRef.current.inSquad) squadRef.current.removeMarker(id);
  }, [squadRef]);

  return {
    filterState,
    selectedPoiIds,
    currentPois,
    currentCustomPois,
    panelPois,
    poiVisible,
    customEnabled,
    toggleFacet,
    setAllFacets,
    toggleGrid,
    saveDefault,
    togglePoi,
    clearPoiSelection,
    addCustom,
    removeCustom,
  };
}
