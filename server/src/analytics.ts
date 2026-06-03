// Squad Mode analytics — anonymous, squad-scoped usage telemetry.
//
// PRIVACY: the only identity ever recorded is the client's random, persisted
// `clientId` (a UUID generated on the user's machine — no name, no IP, no
// account). We never store positions, quest ids, marker/draw contents, or any
// gameplay payload. Lifecycle events go to an append-only JSON-Lines file so
// they can be queried later; high-volume per-message activity is kept only as
// in-memory counters (never one log line per message).
//
// Set ANALYTICS_FILE to enable file logging (e.g. ./data/events.jsonl). Unset
// (the default, and in tests) keeps everything in memory only.

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type AnalyticsEvent =
  | { ev: "squad_created"; clientId: string; room: string }
  | { ev: "member_joined"; clientId: string; room: string; color: string; size: number }
  | { ev: "member_left"; clientId: string; room: string; durationMs: number; size: number };

interface Aggregates {
  startedAt: number;
  squadsCreated: number;
  totalJoins: number;
  uniqueClients: Set<string>;
  peakActiveMembers: number;
  messagesByKind: Record<string, number>;
}

const agg: Aggregates = {
  startedAt: Date.now(),
  squadsCreated: 0,
  totalJoins: 0,
  uniqueClients: new Set<string>(),
  peakActiveMembers: 0,
  messagesByKind: {},
};

const FILE = process.env.ANALYTICS_FILE ?? "";
let ensuredDir = false;

async function appendLine(obj: unknown): Promise<void> {
  if (!FILE) return;
  try {
    if (!ensuredDir) {
      await mkdir(dirname(FILE), { recursive: true });
      ensuredDir = true;
    }
    await appendFile(FILE, JSON.stringify(obj) + "\n", "utf8");
  } catch {
    // Telemetry must NEVER break the relay — swallow all logging errors.
  }
}

export function logEvent(e: AnalyticsEvent): void {
  switch (e.ev) {
    case "squad_created":
      agg.squadsCreated += 1;
      break;
    case "member_joined":
      agg.totalJoins += 1;
      agg.uniqueClients.add(e.clientId);
      break;
    case "member_left":
      break; // active gauges are derived live from the room registry
  }
  void appendLine({ ts: Date.now(), ...e });
}

/** Count a relayed message by kind (in-memory only — never a log line each). */
export function recordMessage(kind: string): void {
  agg.messagesByKind[kind] = (agg.messagesByKind[kind] ?? 0) + 1;
}

/** Track the high-water mark of concurrent members. */
export function recordActiveMembers(n: number): void {
  if (n > agg.peakActiveMembers) agg.peakActiveMembers = n;
}

export interface StatsSnapshot {
  startedAt: number;
  uptimeMs: number;
  squadsCreated: number;
  totalJoins: number;
  uniqueClients: number;
  peakActiveMembers: number;
  activeSquads: number;
  activeMembers: number;
  messagesByKind: Record<string, number>;
}

export function getStats(live: { activeSquads: number; activeMembers: number }): StatsSnapshot {
  return {
    startedAt: agg.startedAt,
    uptimeMs: Date.now() - agg.startedAt,
    squadsCreated: agg.squadsCreated,
    totalJoins: agg.totalJoins,
    uniqueClients: agg.uniqueClients.size,
    peakActiveMembers: agg.peakActiveMembers,
    activeSquads: live.activeSquads,
    activeMembers: live.activeMembers,
    messagesByKind: { ...agg.messagesByKind },
  };
}

/** Test-only: reset all in-memory aggregates. */
export function __resetAnalytics(): void {
  agg.startedAt = Date.now();
  agg.squadsCreated = 0;
  agg.totalJoins = 0;
  agg.uniqueClients.clear();
  agg.peakActiveMembers = 0;
  agg.messagesByKind = {};
}
