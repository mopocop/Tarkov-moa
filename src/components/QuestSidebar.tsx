import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import type { TarkovTask } from "../api/types";
import type { DerivedQuestState } from "../quests/derive";

interface QuestSidebarProps {
  selectedMapId: string | null;
  availableTasksByMap: DerivedQuestState["availableTasksByMap"];
  availableObjectivesByMap: DerivedQuestState["availableObjectivesByMap"];
  anyLocation: TarkovTask[];
  locked: TarkovTask[];
  hoveredTaskId: string | null;
  onHoverTask: (taskId: string | null) => void;
  hoveredObjectiveId: string | null;
  onHoverObjective: (objectiveId: string | null) => void;
  pinned: { kind: 'task' | 'objective'; id: string } | null;
  onTogglePin: (kind: 'task' | 'objective', id: string) => void;
}

export default function QuestSidebar({
  selectedMapId,
  availableTasksByMap,
  availableObjectivesByMap,
  anyLocation,
  locked,
  hoveredTaskId,
  onHoverTask,
  hoveredObjectiveId,
  onHoverObjective,
  pinned,
  onTogglePin,
}: QuestSidebarProps): React.JSX.Element {
  const { t } = useTranslation();
  const [lockedOpen, setLockedOpen] = useState(false);
  // "Any Location" quests are broadly useful (kill/collect tasks not tied to one
  // map), so the group opens expanded by default — locked stays collapsed.
  const [anyOpen, setAnyOpen] = useState(true);
  const objectiveRowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const taskRowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Scroll the highlighted row into view when an objective is hovered/pinned
  // from outside the sidebar (e.g., from a map marker). `block: 'nearest'`
  // avoids scrolling if already visible.
  useEffect(() => {
    if (hoveredObjectiveId) {
      objectiveRowRefs.current
        .get(hoveredObjectiveId)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [hoveredObjectiveId]);

  useEffect(() => {
    if (hoveredTaskId && !hoveredObjectiveId) {
      taskRowRefs.current
        .get(hoveredTaskId)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [hoveredTaskId, hoveredObjectiveId]);

  useEffect(() => {
    if (pinned?.kind === "objective") {
      objectiveRowRefs.current
        .get(pinned.id)
        ?.scrollIntoView({ block: "nearest" });
    } else if (pinned?.kind === "task") {
      taskRowRefs.current.get(pinned.id)?.scrollIntoView({ block: "nearest" });
    }
  }, [pinned]);

  const tasksWithPoiIds = useMemo(() => {
    if (!selectedMapId) return new Set<string>();
    const entries = availableObjectivesByMap[selectedMapId] ?? [];
    return new Set(entries.map((e) => e.task.id));
  }, [selectedMapId, availableObjectivesByMap]);

  const positionedObjectiveIds = useMemo(() => {
    if (!selectedMapId) return new Set<string>();
    const entries = availableObjectivesByMap[selectedMapId] ?? [];
    return new Set(entries.map((e) => e.objective.id));
  }, [selectedMapId, availableObjectivesByMap]);

  const tasks = useMemo(() => {
    const list = selectedMapId ? availableTasksByMap[selectedMapId] ?? [] : [];
    return [...list].sort((a, b) => {
      const aPoi = tasksWithPoiIds.has(a.id) ? 0 : 1;
      const bPoi = tasksWithPoiIds.has(b.id) ? 0 : 1;
      if (aPoi !== bPoi) return aPoi - bPoi;
      return a.name.localeCompare(b.name);
    });
  }, [selectedMapId, availableTasksByMap, tasksWithPoiIds]);

  const lockedForMap = selectedMapId
    ? locked.filter((t) => t.map?.id === selectedMapId)
    : [];

  // Shared full-objective renderer used by both "On this map" and "Any Location".
  // Tasks/objectives not tied to the selected map simply aren't in
  // tasksWithPoiIds/positionedObjectiveIds, so they render as non-positional
  // (no map-pin) automatically — exactly what we want for Any-Location quests.
  const renderTask = (task: TarkovTask) => {
    const hovered = hoveredTaskId === task.id;
    const taskPinned = pinned?.kind === 'task' && pinned.id === task.id;
    const noPoi = !tasksWithPoiIds.has(task.id);
    const canPinTask = !noPoi;
    return (
      <li
        key={task.id}
        ref={(el) => {
          if (el) taskRowRefs.current.set(task.id, el);
          else taskRowRefs.current.delete(task.id);
        }}
        className={`quest-row${hovered ? " hovered" : ""}${taskPinned ? " pinned" : ""}`}
        onMouseEnter={() => onHoverTask(task.id)}
        onMouseLeave={() => onHoverTask(null)}
      >
        <div
          className={`quest-head${canPinTask ? " clickable" : ""}`}
          onClick={() => canPinTask && onTogglePin('task', task.id)}
          title={canPinTask ? (taskPinned ? t('quests.clickToUnpin') : t('quests.clickToPin')) : undefined}
        >
          <strong>{task.name}</strong>
          {task.trader && <span className="trader"> — {task.trader.name}</span>}
          {noPoi && <span className="no-poi"> {t('quests.noSpecificPoi')}</span>}
          {taskPinned && <span className="pin-tag">{t('quests.pinned')}</span>}
        </div>
        {task.objectives && task.objectives.length > 0 && (
          <ul className="objectives">
            {task.objectives.map((obj) => {
              const hasPos = positionedObjectiveIds.has(obj.id);
              const objHovered = hoveredObjectiveId === obj.id;
              const objPinned = pinned?.kind === 'objective' && pinned.id === obj.id;
              return (
                <li
                  key={obj.id}
                  ref={(el) => {
                    if (el) objectiveRowRefs.current.set(obj.id, el);
                    else objectiveRowRefs.current.delete(obj.id);
                  }}
                  className={`objective-row${objHovered ? " hovered" : ""}${objPinned ? " pinned" : ""}${hasPos ? "" : " no-pos"}`}
                  onMouseEnter={() => hasPos && onHoverObjective(obj.id)}
                  onMouseLeave={() => hasPos && onHoverObjective(null)}
                  onClick={(e) => {
                    if (!hasPos) return;
                    e.stopPropagation();
                    onTogglePin('objective', obj.id);
                  }}
                  title={hasPos ? (objPinned ? t('quests.clickToUnpin') : t('quests.clickToPin')) : undefined}
                >
                  {obj.description ?? obj.type}
                  {objPinned && <span className="pin-tag">{t('quests.pinned')}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="quest-sidebar">
      {tasks.length === 0 ? (
        <p className="muted">{t('quests.noActiveQuestsOnMap')}</p>
      ) : (
        <ul className="quest-list">{tasks.map(renderTask)}</ul>
      )}

      {anyLocation.length > 0 && (
        <div className="locked-section">
          <button
            type="button"
            className="locked-toggle"
            onClick={() => setAnyOpen((v) => !v)}
          >
            {anyOpen ? t('common.hide') : t('common.show')} {t('quests.anyLocation')} ({anyLocation.length})
          </button>
          {anyOpen && (
            <ul className="quest-list">{anyLocation.map(renderTask)}</ul>
          )}
        </div>
      )}

      {lockedForMap.length > 0 && (
        <div className="locked-section">
          <button
            type="button"
            className="locked-toggle"
            onClick={() => setLockedOpen((v) => !v)}
          >
            {lockedOpen ? t('common.hide') : t('common.show')} {t('quests.locked')} ({lockedForMap.length})
          </button>
          {lockedOpen && (
            <ul className="locked-list">
              {lockedForMap.map((task) => (
                <li key={task.id} className="locked-row">
                  {task.name}
                  {task.trader && <span className="trader"> — {task.trader.name}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
