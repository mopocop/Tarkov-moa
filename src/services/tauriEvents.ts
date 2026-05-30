import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type { UnlistenFn };

export interface RaidStartedPayload {}
export interface RaidEndedPayload {
  location: string;
  shortId: string;
}
export interface QuestEventPayload {
  status: 'Started' | 'Failed' | 'Finished';
  templateId: string;
}

export interface PlayerPositionPayload {
  x: number;
  y: number;
  z: number;
  rotation: number;
}

export function subscribeRaidStarted(cb: (e: RaidStartedPayload) => void): Promise<UnlistenFn> {
  return listen<RaidStartedPayload>('raid-started', (ev) => cb(ev.payload));
}
export function subscribeRaidEnded(cb: (e: RaidEndedPayload) => void): Promise<UnlistenFn> {
  return listen<RaidEndedPayload>('raid-ended', (ev) => cb(ev.payload));
}
export function subscribeQuestEvent(cb: (e: QuestEventPayload) => void): Promise<UnlistenFn> {
  return listen<QuestEventPayload>('quest-event', (ev) => cb(ev.payload));
}
export function subscribePlayerPosition(cb: (e: PlayerPositionPayload) => void): Promise<UnlistenFn> {
  return listen<PlayerPositionPayload>('player-position', (ev) => cb(ev.payload));
}

import { invoke } from '@tauri-apps/api/core';

export async function replayPastLogs(): Promise<number> {
  return await invoke<number>('replay_past_logs_cmd');
}