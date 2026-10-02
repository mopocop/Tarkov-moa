import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import './App.css';
import './shell/shell.css';
import { resolveMapName } from './quests/mapNames';
import MapView from './map/MapView';
import MarkerLayer from './map/MarkerLayer';
import PlayerMarker from './map/PlayerMarker';
import FloorSwitcher from './map/FloorSwitcher';
import MapPicker from './components/MapPicker';
import { buildMapRows } from './components/mapRows';
import MapEmptyState from './components/MapEmptyState';
import QuestSidebar from './components/QuestSidebar';
import { Toast, IconButton, Spinner } from './ui';
import Spine, { type RailSection } from './shell/Spine';
import { useRelativeTime } from './hooks/useRelativeTime';
import SettingsModal from './components/SettingsModal';
import Onboarding, { ONBOARDED_KEY } from './onboarding/Onboarding';
import PatchNotesModal from './components/PatchNotesModal';
import FeedbackModal from './feedback/FeedbackModal';
import SquadSection from './squad/SquadSection';
import SquadmateLayer from './map/SquadmateLayer';
import { useSquad } from './squad/useSquad';
import PoiLayer from './map/PoiLayer';
import PoiFilterPanel from './map/PoiFilterPanel';
import GridOverlay from './map/GridOverlay';
import CustomMarkerLayer, { MapClickPlacer } from './map/CustomMarkerLayer';
import SquadMarkerLayer from './map/SquadMarkerLayer';
import DrawLayer from './map/DrawLayer';
import MapToolsDock from './map/MapToolsDock';
import FollowCamera from './map/FollowCamera';
import SquadQuestLayer from './map/SquadQuestLayer';
import SquadQuestSummary from './components/SquadQuestSummary';
import { useSettings } from './app/useSettings';
import { useQuestSelection } from './app/useQuestSelection';
import { useQuestData } from './app/useQuestData';
import { useSelectedMap } from './app/useSelectedMap';
import { useGameEvents, useLogReplay } from './app/useGameEvents';
import { useFloors } from './app/useFloors';
import { usePois } from './app/usePois';
import { useDrawing } from './app/useDrawing';
import { useSquadSync } from './app/useSquadSync';
import { useAppUpdate } from './app/useAppUpdate';

// Stable empty array for the `objectives` prop fallback. A fresh `[]` literal
// would change identity every render, invalidating MarkerLayer's classified/
// counts memos and re-firing its onCounts effect → setFloorCounts → re-render
// → infinite loop. A shared frozen constant keeps the prop reference stable
// when the selected map has no objectives entry.
const EMPTY_OBJECTIVES: never[] = [];

// The shell: composes the app's state (src/app/use*.ts, one concern each) and
// lays out the rail, the map stage and the modals. Behavior lives in the hooks.
function App() {
  const { t } = useTranslation();
  const [toast, setToast] = useState<string | null>(null);
  const [railSection, setRailSection] = useState<RailSection | null>('quests');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Onboarding wizard: auto-opens on first run only (tc_onboarded_v1); the
  // spine's Help button reopens it as the how-to guide.
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => !localStorage.getItem(ONBOARDED_KEY),
  );
  const [patchNotesOpen, setPatchNotesOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const squad = useSquad();
  const settings = useSettings();
  const selection = useQuestSelection();
  const quests = useQuestData({
    onDerived: selection.pruneStaleSelections,
    onRefreshError: setToast,
  });
  const { questState, loading, error } = quests;
  const { selectedMapId, setSelectedMapId, selectedMapDef } = useSelectedMap(questState);
  const playerPos = useGameEvents({ setProgress: quests.setProgress, setSelectedMapId });
  const logReplay = useLogReplay(setToast);
  const floors = useFloors({
    selectedMapId,
    selectedMapDef,
    playerPos,
    setFloorLock: settings.setFloorLock,
  });
  const pois = usePois({ selectedMapId, squad, notify: setToast });
  const drawing = useDrawing({ selectedMapId, squad, notify: setToast });
  const squadSync = useSquadSync({
    squad,
    tasks: quests.tasks,
    questState,
    playerPos,
    selectedMapId,
  });
  const update = useAppUpdate(setToast);
  const relativeSynced = useRelativeTime(quests.lastSynced);
  const relativeStale = useRelativeTime(quests.staleSince);

  // Hover belongs to the map it happened on.
  const { clearHover } = selection;
  useEffect(() => {
    clearHover();
  }, [selectedMapId, clearHover]);

  // Spine section clicks toggle the rail panel section (click the active
  // icon again to collapse the panel and give the map the full width).
  const handleToggleSection = useCallback((s: RailSection) => {
    setRailSection((cur) => (cur === s ? null : s));
  }, []);

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

  return (
    <div className="app-container">
      <Toast message={toast} onDismiss={() => setToast(null)} />
      <div className={`shell shell--${settings.railSide}`}>
        <Spine
          side={settings.railSide}
          activeSection={railSection}
          onToggleSection={handleToggleSection}
          squadCount={squad.inSquad ? squad.members.length : undefined}
          questCount={
            questState && selectedMapId
              ? questState.availableTasksByMap[selectedMapId]?.length ?? 0
              : 0
          }
          updateVersion={update.availableUpdate?.version ?? null}
          updating={update.updating}
          onUpdate={update.apply}
          onSyncLogs={logReplay.replay}
          syncingLogs={logReplay.replaying}
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
                  onClick={quests.refresh}
                  disabled={loading}
                />
              )}
            </div>
            <div className="rail-panel__body">
              {railSection === 'squad' ? (
                <>
                  <SquadSection sharedQuestNames={squadSync.sharedQuestNames} />
                  <SquadQuestSummary
                    selfQuestState={questState}
                    questStates={squadSync.squadQuestStates}
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
                  hoveredTaskId={selection.hoveredTaskId}
                  onHoverTask={selection.setHoveredTaskId}
                  hoveredObjectiveId={selection.hoveredObjectiveId}
                  onHoverObjective={selection.setHoveredObjectiveId}
                  pinned={selection.pinned}
                  onTogglePin={selection.togglePin}
                />
              ) : (
                <PoiFilterPanel
                  pois={pois.panelPois}
                  state={pois.filterState}
                  onToggleFacet={pois.toggleFacet}
                  onSetAllFacets={pois.setAllFacets}
                  onHideAll={pois.clearPoiSelection}
                  onToggleGrid={pois.toggleGrid}
                  onSaveDefault={pois.saveDefault}
                />
              )}
            </div>
            <div className="rail-panel__footer">
              <button
                className="rail-panel__version mono"
                onClick={() => setPatchNotesOpen(true)}
                title={t('rail.whatsNew')}
              >
                {update.appVersion ? `v${update.appVersion}` : 'dev'}
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
                  <MapView mapId={selectedMapId} mapName={selectedMapName} activeFloorId={floors.activeFloorId}>
                    {squadSync.showOwnOnMap && (
                      <MarkerLayer
                        mapId={selectedMapId}
                        objectives={questState.availableObjectivesByMap[selectedMapId] ?? EMPTY_OBJECTIVES}
                        highlightedTaskId={selection.hoveredTaskId ?? (selection.pinned?.kind === 'task' ? selection.pinned.id : null)}
                        highlightedObjectiveId={selection.hoveredObjectiveId ?? (selection.pinned?.kind === 'objective' ? selection.pinned.id : null)}
                        floors={selectedMapDef?.floors}
                        activeFloorId={floors.activeFloorId}
                        onCounts={floors.setFloorCounts}
                        onHoverObjective={selection.setHoveredObjectiveId}
                        onTogglePin={selection.togglePin}
                        sharedQuestIds={squadSync.sharedQuestIds}
                      />
                    )}
                    <SquadQuestLayer
                      mapId={selectedMapId}
                      questStates={squadSync.squadQuestStates}
                      sharedQuestIds={squadSync.sharedQuestIds}
                    />
                    <PlayerMarker position={playerPos} mapId={selectedMapId} />
                    <FollowCamera
                      mapId={selectedMapId}
                      pos={playerPos}
                      zoom={settings.followZoom}
                      enabled={settings.followCenter}
                    />
                    <SquadmateLayer mapId={selectedMapId} />
                    <PoiLayer
                      mapId={selectedMapId}
                      pois={pois.currentPois}
                      isVisible={pois.poiVisible}
                      selectedPoiIds={pois.selectedPoiIds}
                      floors={selectedMapDef?.floors}
                      activeFloorId={floors.activeFloorId}
                      onSelect={pois.togglePoi}
                    />
                    <GridOverlay mapId={selectedMapId} visible={pois.filterState.gridVisible} />
                    {drawing.drawTool === null && (
                      <MapClickPlacer mapId={selectedMapId} onAdd={pois.addCustom} />
                    )}
                    {pois.customEnabled && squadSync.showOwnOnMap && (
                      <CustomMarkerLayer
                        mapId={selectedMapId}
                        pois={pois.currentCustomPois}
                        onRemove={pois.removeCustom}
                      />
                    )}
                    <SquadMarkerLayer mapId={selectedMapId} />
                    <DrawLayer
                      mapId={selectedMapId}
                      tool={drawing.drawTool}
                      color={drawing.myDrawHex}
                      ownDraws={drawing.ownDraws}
                      onCommit={drawing.commitStroke}
                    />
                  </MapView>
                  {!settings.floorLock && selectedMapDef?.floors && selectedMapDef.floors.length > 0 && (
                    <FloorSwitcher
                      floors={selectedMapDef.floors}
                      activeFloorId={floors.activeFloorId}
                      counts={floors.floorCounts}
                      autoFollow={floors.autoFollowFloor}
                      onSelect={floors.selectFloor}
                      onAuto={floors.enableAutoFloor}
                    />
                  )}
                  <MapToolsDock
                    tool={drawing.drawTool}
                    onTool={drawing.setDrawTool}
                    color={drawing.myDrawHex}
                    canClear={drawing.canClear}
                    onClear={drawing.clearOwnDraws}
                  />
                </>
              ) : !questState ? (
                <div className="map-placeholder">
                  {loading ? <Spinner size="lg" /> : t('common.noQuestDataCheckConnection')}
                </div>
              ) : (
                <MapEmptyState
                  rows={mapRows}
                  squadCounts={squadSync.squadMapCounts}
                  onSelect={setSelectedMapId}
                />
              )}
        </section>
      </div>
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          railSide={settings.railSide}
          onRailSideChange={settings.setRailSide}
          followCenter={settings.followCenter}
          onFollowCenterChange={settings.setFollowCenter}
          followZoom={settings.followZoom}
          onFollowZoomChange={settings.setFollowZoom}
          floorLock={settings.floorLock}
          onFloorLockChange={floors.changeFloorLock}
        />
      )}
      {onboardingOpen && (
        <Onboarding
          onClose={() => setOnboardingOpen(false)}
          railSide={settings.railSide}
          onRailSideChange={settings.setRailSide}
          onSyncLogs={logReplay.replay}
          syncingLogs={logReplay.replaying}
          followCenter={settings.followCenter}
          onFollowCenterChange={settings.setFollowCenter}
          followZoom={settings.followZoom}
          onFollowZoomChange={settings.setFollowZoom}
        />
      )}
      {patchNotesOpen && (
        <PatchNotesModal onClose={() => setPatchNotesOpen(false)} />
      )}
      {feedbackOpen && (
        <FeedbackModal
          onClose={() => setFeedbackOpen(false)}
          appVersion={update.appVersion}
          activeMapId={selectedMapId}
          squadActive={squad.inSquad}
        />
      )}
    </div>
  );
}

export default App;
