// Local progress store — replaces TarkovTracker as the source of truth in v0.3.
// Populated by the EFT log watcher, not by user UI. v0.3 hardcodes faction to
// USEC; faction picker comes later.
//
// v0.3.5: the store now tracks THREE quest states, all sourced from EFT
// push-notification events (`quest-event` Tauri events):
//   - accepted   ← type 10 "description"        (player picked up the quest)
//   - completed  ← type 12 "successMessageText"  (player finished the quest)
//   - failed     ← type 11                       (player failed the quest)
//
// "Active" quests (sidebar + map markers) = accepted AND not completed/failed.
// Previously we only tracked completions and inferred "available" from quest
// prerequisites, which surfaced quests the player had never actually accepted.
import type { TarkovTrackerProgress, TaskProgress } from '../api/types';

const STORAGE_KEY = 'tc_local_progress_v1';

export type Faction = 'USEC' | 'BEAR';

export interface LocalProgress {
  acceptedQuestIds: string[];
  completedQuestIds: string[];
  failedQuestIds: string[];
  playerLevel: number;
  faction: Faction;
}

const EMPTY: LocalProgress = {
  acceptedQuestIds: [],
  completedQuestIds: [],
  failedQuestIds: [],
  playerLevel: 1,
  faction: 'USEC',
};

export function loadProgress(): LocalProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<LocalProgress>;
    return {
      acceptedQuestIds: Array.isArray(parsed.acceptedQuestIds) ? parsed.acceptedQuestIds : [],
      completedQuestIds: Array.isArray(parsed.completedQuestIds) ? parsed.completedQuestIds : [],
      failedQuestIds: Array.isArray(parsed.failedQuestIds) ? parsed.failedQuestIds : [],
      playerLevel: typeof parsed.playerLevel === 'number' ? parsed.playerLevel : 1,
      faction: parsed.faction === 'BEAR' ? 'BEAR' : 'USEC',
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveProgress(p: LocalProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function addId(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

function removeId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : list;
}

// The three quest-state sets are purely ADDITIVE. "Active" is derived as
// accepted AND NOT completed AND NOT failed (see derive.ts / toTrackerProgress).
// Making them grow-only keeps replay order-independent: EFT re-logs old
// "description" (type-10) notifications for already-finished quests in later
// sessions, so if accept could un-complete a quest, replay file order would
// decide whether a finished quest wrongly reappears. Completion/failure always
// win. (Trade-off: repeatable quests re-accepted after completion won't
// reappear — acceptable for now.)
export function markQuestAccepted(p: LocalProgress, id: string): LocalProgress {
  const acceptedQuestIds = addId(p.acceptedQuestIds, id);
  if (acceptedQuestIds === p.acceptedQuestIds) return p;
  return { ...p, acceptedQuestIds };
}

export function markQuestComplete(p: LocalProgress, id: string): LocalProgress {
  const completedQuestIds = addId(p.completedQuestIds, id);
  if (completedQuestIds === p.completedQuestIds) return p;
  return { ...p, completedQuestIds };
}

export function markQuestFailed(p: LocalProgress, id: string): LocalProgress {
  const failedQuestIds = addId(p.failedQuestIds, id);
  if (failedQuestIds === p.failedQuestIds) return p;
  return { ...p, failedQuestIds };
}

export function markQuestIncomplete(p: LocalProgress, id: string): LocalProgress {
  return { ...p, completedQuestIds: removeId(p.completedQuestIds, id) };
}

export function setPlayerLevel(p: LocalProgress, level: number): LocalProgress {
  if (p.playerLevel === level) return p;
  return { ...p, playerLevel: level };
}

// Bridge into the shape deriveQuestState consumes. Lets us drop the
// TarkovTracker dependency without touching the derive consumer contract.
// Entries are merged by id so a quest that was accepted *and* later completed
// becomes a single TaskProgress carrying both flags.
export function toTrackerProgress(p: LocalProgress): TarkovTrackerProgress {
  const byId = new Map<string, TaskProgress>();
  const entry = (id: string): TaskProgress => {
    let e = byId.get(id);
    if (!e) {
      e = { id, complete: false, failed: false, invalid: false, accepted: false };
      byId.set(id, e);
    }
    return e;
  };
  for (const id of p.acceptedQuestIds) entry(id).accepted = true;
  for (const id of p.completedQuestIds) entry(id).complete = true;
  for (const id of p.failedQuestIds) entry(id).failed = true;

  return {
    playerLevel: p.playerLevel,
    pmcFaction: p.faction,
    tasksProgress: Array.from(byId.values()),
  };
}
