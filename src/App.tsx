import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import './App.css';
import './shell/shell.css';
import { TarkovDevClient, type ApiLang } from './api/tarkov-dev';
import { i18n } from './i18n';
import { deriveQuestState, type DerivedQuestState } from './quests/derive';
import type { TarkovTask } from './api/types';
import {
  loadProgress,
  saveProgress,
  toTrackerProgress,
  type LocalProgress,
} from './state/localProgress';
import MapView from './map/MapView';
import { getMapDef, SUPPORTED_MAP_NAMES } from './map/mapDefs';
import MarkerLayer from './map/MarkerLayer';
import PlayerMarker from './map/PlayerMarker';
import FloorSwitcher, { ALL_FLOORS } from './map/FloorSwitcher';
import { classifyMarker } from './map/floorClassify';
import MapPicker from './components/MapPicker';
import { buildMapRows } from './components/mapRows';
import MapEmptyState from './components/MapEmptyState';
import QuestSidebar from './components/QuestSidebar';
import { Toast, IconButton, Spinner } from './ui';
import Spine, { type RailSection } from './shell/Spine';
import { useRelativeTime } from './hooks/useRelativeTime';
import { resolveMapName } from './quests/mapNames';
import {
  subscribeRaidEnded,
  subscribeQuestEvent,
  subscribeRaidStarted,
  subscribePlayerPosition,
  replayPastLogs,
  type UnlistenFn,
} from './services/tauriEvents';
import { mapIdFromLogLocation } from './map/logLocationMap';
import { markQuestAccepted, markQuestComplete, markQuestFailed } from './state/localProgress';
import SettingsModal from './components/SettingsModal';
import Onboarding, { ONBOARDED_KEY } from './onboarding/Onboarding';
import PatchNotesModal from './components/PatchNotesModal';
import FeedbackModal from './feedback/FeedbackModal';
import SquadSection from './squad/SquadSection';
import SquadmateLayer from './map/SquadmateLayer';
import { useSquad } from './squad/useSquad';
import { checkForUpdate, applyUpdate, type AvailableUpdate } from './services/updater';
import { getVersion } from '@tauri-apps/api/app';
import PoiLayer from './map/PoiLayer';
import PoiFilterPanel from './map/PoiFilterPanel';
import GridOverlay from './map/GridOverlay';
import CustomMarkerLayer, { MapClickPlacer } from './map/CustomMarkerLayer';
import SquadMarkerLayer from './map/SquadMarkerLayer';
import DrawLayer, { type DrawTool } from './map/DrawLayer';
import { newDrawId } from './map/drawId';
import MapToolsDock from './map/MapToolsDock';
import FollowCamera from './map/FollowCamera';
import {
  loadCustomPois,
  saveCustomPois,
  addCustomPoi,
  removeCustomPoi,
  poiToWireMarker,
} from './poi/customPoi';
import { hexForColorId, type DrawPayload } from '../shared/squadProtocol';
import SquadQuestLayer from './map/SquadQuestLayer';
import SquadQuestSummary from './components/SquadQuestSummary';
import { deriveMemberQuestState } from './squad/squadQuests';
import { poisByMap } from './poi/fromTarkovDev';
import {
  loadFilterState,
  saveFilterState,
  isPoiVisible,
  type PoiFilterState,
} from './poi/filterState';
import { facetDefaultOn } from './poi/facets';
import type { Poi } from './poi/types';

const SELECTED_MAP_KEY = 'tc_selected_map';
// Which screen side the Operator Rail lives on. People run this app on a
// secondary monitor — left rail suits a monitor right of the primary, and
// vice versa. Chosen during onboarding, changeable in Settings.
const RAIL_SIDE_KEY = 'tc_rail_side';
export type RailSide = 'left' | 'right';

// Screenshot follow-cam: center the map on each fresh position (default ON)
// at this zoom. Offered in onboarding, changeable in Settings.
const FOLLOW_CENTER_KEY = 'tc_follow_center';
const FOLLOW_ZOOM_KEY = 'tc_follow_zoom';
export const FOLLOW_ZOOM_DEFAULT = 1;
// When '1', the floor switcher is hidden and floor tracking is locked to AUTO.
const FLOOR_LOCK_KEY = 'tc_floor_lock';

// Stable empty array for the `objectives` prop fallback. A fresh `[]` literal
// would change identity every render, invalidating MarkerLayer's classified/
// counts memos and re-firing its onCounts effect → setFloorCounts → re-render
// → infinite loop. A shared frozen constant keeps the prop reference stable
// when the selected map has no objectives entry.
const EMPTY_OBJECTIVES: never[] = [];

function App() {
  const [progress, setProgress] = useState<LocalProgress>(() => loadProgress());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questState, setQuestState] = useState<DerivedQuestState | null>(null);
  // Full task list retained so squadmates' pins can be re-derived from the quest
  // IDs they broadcast (every client already has the same list).
  const [tasks, setTasks] = useState<TarkovTask[]>([]);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  // Set when quest data came from an expired cache because tarkov.dev was
  // unreachable; holds the timestamp of that copy. null = data is current.
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_MAP_KEY),
  );
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [hoveredObjectiveId, setHoveredObjectiveId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<{ kind: 'task' | 'objective'; id: string } | null>(null);
  const [activeFloorId, setActiveFloorId] = useState<string>(ALL_FLOORS);
  // When true, the active floor tracks the player's live position. A manual
  // FloorSwitcher click turns it off; the "Auto" button turns it back on.
  const [autoFollowFloor, setAutoFollowFloor] = useState<boolean>(true);
  const [floorCounts, setFloorCounts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Onboarding wizard: auto-opens on first run only (tc_onboarded_v1); the
  // spine's Help button reopens it as the how-to guide.
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => !localStorage.getItem(ONBOARDED_KEY),
  );
  const [patchNotesOpen, setPatchNotesOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [replayingLogs, setReplayingLogs] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updating, setUpdating] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [playerPos, setPlayerPos] = useState<
    { x: number; y: number; z: number; rotation: number; ts: number } | null
  >(null);
  // Map of the raid currently being played, from the raid-started log event.
  // A ref because the position subscription (bound once) needs the live value.
  const liveRaidMapIdRef = useRef<string | null>(null);
  // Screenshot follow-cam settings.
  const [followCenter, setFollowCenter] = useState<boolean>(
    () => localStorage.getItem(FOLLOW_CENTER_KEY) !== '0',
  );
  const [followZoom, setFollowZoom] = useState<number>(() => {
    const raw = Number(localStorage.getItem(FOLLOW_ZOOM_KEY));
    return Number.isFinite(raw) && localStorage.getItem(FOLLOW_ZOOM_KEY) !== null
      ? raw
      : FOLLOW_ZOOM_DEFAULT;
  });
  const [floorLock, setFloorLock] = useState<boolean>(
    () => localStorage.getItem(FLOOR_LOCK_KEY) === '1',
  );
  // v0.5 POIs: tarkov.dev POI data indexed by map id, filter prefs, current
  // selection, and custom-marker placement mode.
  const [poisByMapId, setPoisByMapId] = useState<Record<string, Poi[]>>({});
  const [filterState, setFilterState] = useState<PoiFilterState>(() => loadFilterState());
  // POIs highlight independently — several can be lit at once (like quest pins),
  // not a single radio selection. Cleared on map change and by "Hide all".
  const [selectedPoiIds, setSelectedPoiIds] = useState<Set<string>>(() => new Set());
  const [railSide, setRailSide] = useState<RailSide>(() =>
    localStorage.getItem(RAIL_SIDE_KEY) === 'right' ? 'right' : 'left',
  );
  const [railSection, setRailSection] = useState<RailSection | null>('quests');
  const [customPois, setCustomPois] = useState<Poi[]>(() => loadCustomPois());
  const relativeSynced = useRelativeTime(lastSynced);
  const relativeStale = useRelativeTime(staleSince);
  const squad = useSquad();
  const {
    inSquad: squadInSquad,
    broadcastPosition: squadBroadcastPosition,
    broadcastQuests: squadBroadcastQuests,
  } = squad;

  // ---- Drawing (Phase D) ----
  const [drawTool, setDrawTool] = useState<DrawTool>(null);
  const [ownDraws, setOwnDraws] = useState<DrawPayload[]>([]); // in-memory, session-only
  // Local ink: your squad color if seated, else your saved pick, else brass.
  // Picking a color in the Squad tab persists it immediately, so this updates
  // your map ink live (no more grey-forever).
  const myColorId = squad.selfColorId ?? squad.identity.colorId;
  const myDrawHex = myColorId ? hexForColorId(myColorId) : '#c9a86a';
  // Refs let the stable marker/draw callbacks read fresh state without being
  // recreated — MapClickPlacer and DrawLayer bind their map handlers once.
  // These refs are read only inside those (async) event handlers, never during
  // render, so syncing them in an effect after each commit is safe.
  const squadRef = useRef(squad);
  const selectedMapIdRef = useRef<string | null>(selectedMapId);
  const myDrawHexRef = useRef(myDrawHex);
  useEffect(() => {
    squadRef.current = squad;
    selectedMapIdRef.current = selectedMapId;
    myDrawHexRef.current = myDrawHex;
  });

  const { t } = useTranslation();

  // Persist the rail side whenever it changes.
  useEffect(() => {
    localStorage.setItem(RAIL_SIDE_KEY, railSide);
  }, [railSide]);
  useEffect(() => {
    localStorage.setItem(FOLLOW_CENTER_KEY, followCenter ? '1' : '0');
  }, [followCenter]);
  useEffect(() => {
    localStorage.setItem(FOLLOW_ZOOM_KEY, String(followZoom));
  }, [followZoom]);
  useEffect(() => {
    localStorage.setItem(FLOOR_LOCK_KEY, floorLock ? '1' : '0');
  }, [floorLock]);

  // Toggling the floor lock also resumes AUTO when locking, so the derived
  // state change lives with the user action instead of cascading from an effect.
  const handleFloorLockChange = useCallback((locked: boolean) => {
    setFloorLock(locked);
    if (locked) setAutoFollowFloor(true);
  }, []);

  // Spine section clicks toggle the rail panel section (click the active
  // icon again to collapse the panel and give the map the full width).
  const handleToggleSection = useCallback((s: RailSection) => {
    setRailSection((cur) => (cur === s ? null : s));
  }, []);

  const togglePin = useCallback(
    (kind: 'task' | 'objective', id: string) => {
      setPinned((cur) => (cur && cur.kind === kind && cur.id === id ? null : { kind, id }));
    },
    [],
  );

  const pruneStaleSelections = useCallback((state: DerivedQuestState) => {
    const taskIds = new Set<string>();
    const objectiveIds = new Set<string>();
    for (const list of Object.values(state.availableObjectivesByMap)) {
      for (const { task, objective } of list) {
        taskIds.add(task.id);
        objectiveIds.add(objective.id);
      }
    }
    for (const list of Object.values(state.availableTasksByMap)) {
      for (const t of list) taskIds.add(t.id);
    }
    setPinned((cur) => {
      if (!cur) return cur;
      const present = cur.kind === 'task' ? taskIds.has(cur.id) : objectiveIds.has(cur.id);
      return present ? cur : null;
    });
    setHoveredTaskId((cur) => (cur && taskIds.has(cur) ? cur : null));
    setHoveredObjectiveId((cur) => (cur && objectiveIds.has(cur) ? cur : null));
  }, []);

  const loadQuestData = useCallback(
    async (current: LocalProgress) => {
      setLoading(true);
      setError(null);
      try {
        const devClient = new TarkovDevClient(i18n.language as ApiLang);
        const tasks = await devClient.getTasks();
        const next = deriveQuestState(toTrackerProgress(current), tasks);
        setQuestState(next);
        setTasks(tasks);
        pruneStaleSelections(next);
        // The client serves an expired cache rather than failing when
        // tarkov.dev is unreachable. Surface that instead of pretending we
        // just synced — the honest "last synced" is when that copy was written.
        const { stale, servedAt } = devClient.staleInfo;
        setStaleSince(stale ? servedAt : null);
        setLastSynced(stale ? servedAt : Date.now());
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.failedToLoadQuestData'));
      } finally {
        setLoading(false);
      }
    },
    [pruneStaleSelections],
  );

  // Initial load. This is the canonical "fetch from an external system on mount"
  // effect — loadQuestData drives loading/error/result state as the request
  // resolves, which is the intended use of an effect rather than a cascade.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQuestData(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist progress whenever it changes.
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  // Check for an app update once on launch. No-ops outside Tauri / when offline.
  useEffect(() => {
    void checkForUpdate().then((u) => {
      if (u) setAvailableUpdate(u);
    });
  }, []);

  // App version for the header badge. No-ops outside Tauri.
  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => {});
  }, []);

  // Load tarkov.dev POI data once, in the background (non-blocking; 24h cached).
  // Swallow errors offline — quest data + map still work without POIs.
  useEffect(() => {
    void new TarkovDevClient(i18n.language as ApiLang)
      .getMapPois()
      .then((maps) => setPoisByMapId(poisByMap(maps)))
      .catch((e) => console.warn('[POIs] load failed (offline?):', e));
  }, []);

  // Re-fetch localized data when the UI language changes. tarkov.dev serves
  // quest/POI/map names per-language, so a language switch must refresh both.
  useEffect(() => {
    const onLangChange = (): void => {
      void loadQuestData(progress);
      void new TarkovDevClient(i18n.language as ApiLang)
        .getMapPois()
        .then((maps) => setPoisByMapId(poisByMap(maps)))
        .catch((e) => console.warn('[POIs] reload failed (offline?):', e));
    };
    i18n.on('languageChanged', onLangChange);
    return () => {
      i18n.off('languageChanged', onLangChange);
    };
  }, [loadQuestData, progress]);

  // POI filters are NOT auto-persisted — the user saves the current set as the
  // default explicitly (see handleSaveDefault / the "Save as default" button), so
  // they can explore freely without clobbering their saved layout.

  // Persist custom markers whenever they change.
  useEffect(() => {
    saveCustomPois(customPois);
  }, [customPois]);

  // Subscribe to Tauri log-watcher events.
  useEffect(() => {
    const unlistens: UnlistenFn[] = [];
    let cancelled = false;

    void (async () => {
      try {
        const u1 = await subscribeQuestEvent((ev) => {
          setProgress((cur) => {
            switch (ev.status) {
              case 'Started':
                return markQuestAccepted(cur, ev.templateId);
              case 'Finished':
                return markQuestComplete(cur, ev.templateId);
              case 'Failed':
                return markQuestFailed(cur, ev.templateId);
              default:
                return cur;
            }
          });
        });
        const u2 = await subscribeRaidEnded((ev) => {
          const target = mapIdFromLogLocation(ev.location);
          if (target) setSelectedMapId(target);
        });
        const u3 = await subscribeRaidStarted((ev) => {
          setPlayerPos(null);
          liveRaidMapIdRef.current = ev.location
            ? mapIdFromLogLocation(ev.location) ?? null
            : null;
        });
        const u4 = await subscribePlayerPosition((ev) => {
          setPlayerPos({ ...ev, ts: Date.now() });
          // Screenshot → make sure we're LOOKING at the raid's map. The
          // follow-cam (FollowCamera) then centers if the user kept that on.
          const liveMap = liveRaidMapIdRef.current;
          if (liveMap) setSelectedMapId((cur) => (cur === liveMap ? cur : liveMap));
        });
        if (cancelled) {
          u1(); u2(); u3(); u4();
        } else {
          unlistens.push(u1, u2, u3, u4);
        }
      } catch (e) {
        // Running outside Tauri (e.g. plain `vite dev`) — listen() throws. Swallow.
        console.warn('[tauriEvents] subscribe failed (running outside Tauri?):', e);
      }
    })();

    return () => {
      cancelled = true;
      for (const u of unlistens) u();
    };
  }, []);

  // Re-derive quest state when progress changes (e.g. quest-event from log
  // watcher). Like the initial load, this re-fetches from tarkov.dev and lets
  // loadQuestData drive the resulting state — an external-system sync, not a
  // render cascade.
  useEffect(() => {
    if (!questState) return; // initial load handles first derive
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQuestData(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  // Resolve default selected map once questState arrives. This corrects the
  // selection in response to async quest data loading (an external system), so
  // the setSelectedMapId calls below are an intended sync, not a cascade.
  useEffect(() => {
    if (!questState) return;
    const objsByMap = questState.availableObjectivesByMap;
    const tasksByMap = questState.availableTasksByMap;
    const allMapIds = Array.from(
      new Set([...Object.keys(objsByMap), ...Object.keys(tasksByMap)]),
    );
    const stored = selectedMapId;
    // Keep the user's pick if it's any supported map (QA may select a map with
    // zero active quests) or a map that currently has quests.
    if (stored && (allMapIds.includes(stored) || stored in SUPPORTED_MAP_NAMES)) return;
    if (allMapIds.length === 0) {
      // No active-quest map and nothing valid selected — leave whatever the
      // user picked (a supported map), else clear.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!stored || !(stored in SUPPORTED_MAP_NAMES)) setSelectedMapId(null);
      return;
    }
    const best = allMapIds
      .map((id) => ({
        id,
        score: (objsByMap[id]?.length ?? 0) + (tasksByMap[id]?.length ?? 0),
      }))
      .sort((a, b) => b.score - a.score)[0];
    setSelectedMapId(best.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questState]);

  // When the selected map changes, reset the per-map view state (hover, floor,
  // POI selection) to that map's defaults. These resets are the point of the
  // effect — they intentionally re-sync dependent UI state to the new map.
  useEffect(() => {
    if (selectedMapId) localStorage.setItem(SELECTED_MAP_KEY, selectedMapId);
    /* eslint-disable react-hooks/set-state-in-effect */
    setHoveredTaskId(null);
    setHoveredObjectiveId(null);
    // Per-map opening floor (Interchange opens on Ground, not All).
    setActiveFloorId(
      (selectedMapId ? getMapDef(selectedMapId)?.defaultFloorId : undefined) ?? ALL_FLOORS,
    );
    setAutoFollowFloor(true);
    setSelectedPoiIds(new Set());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedMapId]);

  const selectedMapDef = useMemo(
    () => (selectedMapId ? getMapDef(selectedMapId) : undefined),
    [selectedMapId],
  );

  // Auto-follow: while enabled, drive the active floor from the player's live
  // position. Manual floor selection pauses this (see handleSelectFloor); the
  // "Auto" button resumes it. No-op on maps without floor data.
  useEffect(() => {
    if (!autoFollowFloor) return;
    const floors = selectedMapDef?.floors;
    if (!floors || floors.length === 0 || !playerPos) return;
    // Syncing the active floor to the live player position (external log feed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveFloorId(classifyMarker(playerPos.x, playerPos.y, playerPos.z, floors));
  }, [autoFollowFloor, selectedMapDef, playerPos]);

  const handleSelectFloor = useCallback((id: string) => {
    setAutoFollowFloor(false);
    setActiveFloorId(id);
  }, []);

  const handleEnableAutoFloor = useCallback(() => {
    setAutoFollowFloor(true);
  }, []);

  // Share our position with the squad on each screenshot-driven update.
  useEffect(() => {
    if (squadInSquad && playerPos && selectedMapId) {
      squadBroadcastPosition({
        mapId: selectedMapId,
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
        rotation: playerPos.rotation,
      });
    }
  }, [squadInSquad, squadBroadcastPosition, playerPos, selectedMapId]);

  // Share our active quest IDs with the squad — re-sent whenever they change or
  // we (re)join. Teammates re-derive the objective pins locally from the IDs.
  useEffect(() => {
    if (squadInSquad && questState) {
      squadBroadcastQuests(questState.available.map((t) => t.id));
    }
  }, [squadInSquad, squadBroadcastQuests, questState]);

  // Re-derive each squadmate's quest state from the IDs they broadcast (others
  // only; our own pins come from `questState`). Recomputes only when someone's
  // quests change or the task list reloads.
  const squadQuestStates = useMemo<Record<string, DerivedQuestState>>(() => {
    if (tasks.length === 0) return {};
    const out: Record<string, DerivedQuestState> = {};
    for (const [memberId, ids] of Object.entries(squad.quests)) {
      if (memberId === squad.selfId) continue;
      out[memberId] = deriveMemberQuestState(ids, tasks);
    }
    return out;
  }, [squad.quests, squad.selfId, tasks]);

  // The self eye-toggle (squad card) hides our own on-map shares: quest pins
  // (MarkerLayer) and custom markers (CustomMarkerLayer).
  const showOwnOnMap = !(squad.selfId && squad.hiddenQuests[squad.selfId]);

  // Shared objectives: quest ids that ≥2 squad members (you included) have
  // active right now. Pins for these get a strong "shared objective" ring on
  // the map and a callout in the squad panel — push the same door together.
  const sharedQuestIds = useMemo<Set<string>>(() => {
    if (!squad.inSquad) return new Set();
    const lists: string[][] = [];
    for (const ids of Object.values(squad.quests)) lists.push(ids);
    // Our own list may not be echoed back by the relay — count it locally.
    if (squad.selfId && !squad.quests[squad.selfId] && questState) {
      lists.push(questState.available.map((t) => t.id));
    }
    if (lists.length < 2) return new Set();
    const counts = new Map<string, number>();
    for (const ids of lists) {
      for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, n]) => n >= 2)
        .map(([id]) => id),
    );
  }, [squad.inSquad, squad.quests, squad.selfId, questState]);

  // Human-readable names for the shared quests (squad panel callout).
  const sharedQuestNames = useMemo(
    () => tasks.filter((t) => sharedQuestIds.has(t.id)).map((t) => t.name),
    [tasks, sharedQuestIds],
  );

  const selectedMapName = useMemo(() => {
    if (!questState || !selectedMapId) return '';
    return resolveMapName(
      selectedMapId,
      questState.availableTasksByMap,
      questState.availableObjectivesByMap,
    );
  }, [questState, selectedMapId]);

  // Rows for the pinned map picker + the deployment-board empty state.
  const mapRows = useMemo(
    () =>
      questState
        ? buildMapRows(questState.availableObjectivesByMap, questState.availableTasksByMap)
        : [],
    [questState],
  );

  // Squadmates currently positioned per map (self excluded) — surfacing where
  // the squad actually is on the deployment board.
  const squadMapCounts = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    if (!squad.inSquad) return out;
    for (const m of squad.members) {
      if (m.id === squad.selfId) continue;
      const pos = squad.positions[m.id];
      if (pos) out[pos.payload.mapId] = (out[pos.payload.mapId] ?? 0) + 1;
    }
    return out;
  }, [squad.inSquad, squad.members, squad.positions, squad.selfId]);

  // ---- POI derived state + filter handlers (v0.6 faceted) ----
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
  const handleSaveDefault = useCallback(() => {
    saveFilterState(filterState);
    setToast(t('common.filtersSavedAsDefault'));
  }, [filterState]);

  // ---- Custom markers ----
  const handleAddCustom = useCallback((poi: Poi) => {
    setCustomPois((cur) => addCustomPoi(cur, poi));
    // Ensure "My markers" is on so a just-placed marker is actually visible.
    setFilterState((s) =>
      s.enabled.custom ? s : { ...s, enabled: { ...s.enabled, custom: true } },
    );
    // Share with the squad if we're in one. Markers placed WHILE squadded are
    // shared; joining doesn't retroactively broadcast your back-catalog.
    if (squadRef.current.inSquad) squadRef.current.addMarker(poiToWireMarker(poi));
  }, []);
  const handleRemoveCustom = useCallback((id: string) => {
    setCustomPois((cur) => removeCustomPoi(cur, id));
    if (squadRef.current.inSquad) squadRef.current.removeMarker(id);
  }, []);

  // ---- Drawing actions (stable; read fresh map/color/squad via refs) ----
  const commitStroke = useCallback((points: { x: number; z: number }[]) => {
    const mid = selectedMapIdRef.current;
    if (!mid || points.length < 2) return;
    const payload: DrawPayload = {
      id: newDrawId(),
      mapId: mid,
      color: myDrawHexRef.current,
      points,
    };
    setOwnDraws((cur) => [...cur, payload]);
    if (squadRef.current.inSquad) squadRef.current.addDraw(payload);
  }, []);
  const clearOwnDraws = useCallback(() => {
    const mid = selectedMapIdRef.current;
    setOwnDraws((cur) => {
      if (squadRef.current.inSquad) {
        for (const d of cur) if (d.mapId === mid) squadRef.current.removeDraw(d.id);
      }
      return cur.filter((d) => d.mapId !== mid);
    });
    setToast(t('common.drawingsCleared'));
  }, []);

  const handleRefresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const devClient = new TarkovDevClient(i18n.language as ApiLang);
      const tasks = await devClient.getTasks();
      const next = deriveQuestState(toTrackerProgress(progress), tasks);
      setQuestState(next);
      setTasks(tasks);
      pruneStaleSelections(next);
      setLastSynced(Date.now());
    } catch (err) {
      setToast(err instanceof Error ? err.message : t('errors.refreshFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyUpdate = useCallback(async () => {
    if (!availableUpdate) return;
    setUpdating(true);
    setToast(t('settings.downloadingUpdate', { version: availableUpdate.version }));
    try {
      await applyUpdate(availableUpdate.update, ({ downloaded, total }) => {
        if (total) {
          const pct = Math.round((downloaded / total) * 100);
          setToast(t('settings.downloadingUpdateProgress', { version: availableUpdate.version, pct }));
        }
      });
      // relaunch() inside applyUpdate restarts the app; code below only runs on failure.
    } catch (err) {
      setToast(err instanceof Error ? err.message : t('errors.updateFailed'));
      setUpdating(false);
    }
  }, [availableUpdate]);

  const handleReplayPastLogs = async () => {
    setReplayingLogs(true);
    try {
      const count = await replayPastLogs();
      setToast(t('rail.replayedLogs', { count }));
    } catch (err) {
      setToast(err instanceof Error ? err.message : t('errors.replayFailed'));
    } finally {
      setReplayingLogs(false);
    }
  };

  return (
    <div className="app-container">
      <Toast message={toast} onDismiss={() => setToast(null)} />
      <div className={`shell shell--${railSide}`}>
        <Spine
          side={railSide}
          activeSection={railSection}
          onToggleSection={handleToggleSection}
          squadCount={squad.inSquad ? squad.members.length : undefined}
          questCount={
            questState && selectedMapId
              ? questState.availableTasksByMap[selectedMapId]?.length ?? 0
              : 0
          }
          updateVersion={availableUpdate?.version ?? null}
          updating={updating}
          onUpdate={handleApplyUpdate}
          onSyncLogs={handleReplayPastLogs}
          syncingLogs={replayingLogs}
          onFeedback={() => setFeedbackOpen(true)}
          onHowTo={() => setOnboardingOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />

        {railSection && (
          <aside className="rail-panel">
            {/* The map is the top-level selection — it's universal across every
                section, so it sits ABOVE the section title, divided from it. */}
            {questState && (
              <div className="rail-panel__map">
                <MapPicker
                  availableObjectivesByMap={questState.availableObjectivesByMap}
                  availableTasksByMap={questState.availableTasksByMap}
                  selectedMapId={selectedMapId}
                  onSelect={setSelectedMapId}
                />
              </div>
            )}
            <div className="rail-panel__header">
              <h2 className="rail-panel__title">
                {railSection === 'quests' ? t('rail.quests') : railSection === 'intel' ? t('rail.intel') : t('rail.squad')}
              </h2>
              {railSection === 'quests' && (
                <IconButton
                  icon={loading ? <Spinner size="sm" /> : <ArrowsClockwise weight="bold" />}
                  label={t('rail.refreshQuests')}
                  size="sm"
                  onClick={handleRefresh}
                  disabled={loading}
                />
              )}
            </div>
            <div className="rail-panel__body">
              {railSection === 'squad' ? (
                <>
                  <SquadSection sharedQuestNames={sharedQuestNames} />
                  <SquadQuestSummary
                    selfQuestState={questState}
                    questStates={squadQuestStates}
                    onSelect={setSelectedMapId}
                  />
                </>
              ) : !questState ? (
                <p className="muted">{loading ? t('common.loadingQuestData') : t('common.noQuestData')}</p>
              ) : railSection === 'quests' ? (
                <QuestSidebar
                  selectedMapId={selectedMapId}
                  availableTasksByMap={questState.availableTasksByMap}
                  availableObjectivesByMap={questState.availableObjectivesByMap}
                  anyLocation={questState.anyLocation}
                  locked={questState.locked}
                  hoveredTaskId={hoveredTaskId}
                  onHoverTask={setHoveredTaskId}
                  hoveredObjectiveId={hoveredObjectiveId}
                  onHoverObjective={setHoveredObjectiveId}
                  pinned={pinned}
                  onTogglePin={togglePin}
                />
              ) : (
                <PoiFilterPanel
                  pois={panelPois}
                  state={filterState}
                  onToggleFacet={toggleFacet}
                  onSetAllFacets={setAllFacets}
                  onHideAll={() => setSelectedPoiIds(new Set())}
                  onToggleGrid={toggleGrid}
                  onSaveDefault={handleSaveDefault}
                />
              )}
            </div>
            <div className="rail-panel__footer">
              <button
                className="rail-panel__version mono"
                onClick={() => setPatchNotesOpen(true)}
                title={t('rail.whatsNew')}
              >
                {appVersion ? `v${appVersion}` : 'dev'}
              </button>
              {relativeSynced && <span>· {t('common.synced', { time: relativeSynced })}</span>}
              {/* Attribution (tarkov.dev · Leaflet BSD-2 · Phosphor MIT) lives in
                  Settings → About, so the footer stays a single clean line. */}
            </div>
          </aside>
        )}

        <section className="map-stage map-area">
              {error && <div className="shell-error">{error}</div>}
              {!error && relativeStale && (
                <div className="shell-warn">{t('common.staleData', { time: relativeStale })}</div>
              )}
              {selectedMapId && questState ? (
                <>
                  <MapView mapId={selectedMapId} mapName={selectedMapName} activeFloorId={activeFloorId}>
                    {showOwnOnMap && (
                      <MarkerLayer
                        mapId={selectedMapId}
                        objectives={questState.availableObjectivesByMap[selectedMapId] ?? EMPTY_OBJECTIVES}
                        highlightedTaskId={hoveredTaskId ?? (pinned?.kind === 'task' ? pinned.id : null)}
                        highlightedObjectiveId={hoveredObjectiveId ?? (pinned?.kind === 'objective' ? pinned.id : null)}
                        floors={selectedMapDef?.floors}
                        activeFloorId={activeFloorId}
                        onCounts={setFloorCounts}
                        onHoverObjective={setHoveredObjectiveId}
                        onTogglePin={togglePin}
                        sharedQuestIds={sharedQuestIds}
                      />
                    )}
                    <SquadQuestLayer
                      mapId={selectedMapId}
                      questStates={squadQuestStates}
                      sharedQuestIds={sharedQuestIds}
                    />
                    <PlayerMarker position={playerPos} mapId={selectedMapId} />
                    <FollowCamera
                      mapId={selectedMapId}
                      pos={playerPos}
                      zoom={followZoom}
                      enabled={followCenter}
                    />
                    <SquadmateLayer mapId={selectedMapId} />
                    <PoiLayer
                      mapId={selectedMapId}
                      pois={currentPois}
                      isVisible={poiVisible}
                      selectedPoiIds={selectedPoiIds}
                      floors={selectedMapDef?.floors}
                      activeFloorId={activeFloorId}
                      onSelect={(poi) =>
                        setSelectedPoiIds((cur) => {
                          const next = new Set(cur);
                          if (next.has(poi.id)) next.delete(poi.id);
                          else next.add(poi.id);
                          return next;
                        })
                      }
                    />
                    <GridOverlay mapId={selectedMapId} visible={filterState.gridVisible} />
                    {drawTool === null && (
                      <MapClickPlacer mapId={selectedMapId} onAdd={handleAddCustom} />
                    )}
                    {customEnabled && showOwnOnMap && (
                      <CustomMarkerLayer
                        mapId={selectedMapId}
                        pois={currentCustomPois}
                        onRemove={handleRemoveCustom}
                      />
                    )}
                    <SquadMarkerLayer mapId={selectedMapId} />
                    <DrawLayer
                      mapId={selectedMapId}
                      tool={drawTool}
                      color={myDrawHex}
                      ownDraws={ownDraws}
                      onCommit={commitStroke}
                    />
                  </MapView>
                  {!floorLock && selectedMapDef?.floors && selectedMapDef.floors.length > 0 && (
                    <FloorSwitcher
                      floors={selectedMapDef.floors}
                      activeFloorId={activeFloorId}
                      counts={floorCounts}
                      autoFollow={autoFollowFloor}
                      onSelect={handleSelectFloor}
                      onAuto={handleEnableAutoFloor}
                    />
                  )}
                  <MapToolsDock
                    tool={drawTool}
                    onTool={setDrawTool}
                    color={myDrawHex}
                    canClear={ownDraws.some((d) => d.mapId === selectedMapId)}
                    onClear={clearOwnDraws}
                  />
                </>
              ) : !questState ? (
                <div className="map-placeholder">
                  {loading ? <Spinner size="lg" /> : t('common.noQuestDataCheckConnection')}
                </div>
              ) : (
                <MapEmptyState
                  rows={mapRows}
                  squadCounts={squadMapCounts}
                  onSelect={setSelectedMapId}
                />
              )}
        </section>
      </div>
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          railSide={railSide}
          onRailSideChange={setRailSide}
          followCenter={followCenter}
          onFollowCenterChange={setFollowCenter}
          followZoom={followZoom}
          onFollowZoomChange={setFollowZoom}
          floorLock={floorLock}
          onFloorLockChange={handleFloorLockChange}
        />
      )}
      {onboardingOpen && (
        <Onboarding
          onClose={() => setOnboardingOpen(false)}
          railSide={railSide}
          onRailSideChange={setRailSide}
          onSyncLogs={handleReplayPastLogs}
          syncingLogs={replayingLogs}
          followCenter={followCenter}
          onFollowCenterChange={setFollowCenter}
          followZoom={followZoom}
          onFollowZoomChange={setFollowZoom}
        />
      )}
      {patchNotesOpen && (
        <PatchNotesModal onClose={() => setPatchNotesOpen(false)} />
      )}
      {feedbackOpen && (
        <FeedbackModal
          onClose={() => setFeedbackOpen(false)}
          appVersion={appVersion}
          activeMapId={selectedMapId}
          squadActive={squad.inSquad}
        />
      )}
    </div>
  );
}

export default App;
