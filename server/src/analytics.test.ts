import { describe, it, expect, beforeEach } from "vitest";
import {
  logEvent,
  recordMessage,
  recordActiveMembers,
  getStats,
  __resetAnalytics,
} from "./analytics.ts";

beforeEach(() => __resetAnalytics());

describe("analytics", () => {
  it("counts squads created, total joins, and UNIQUE clients", () => {
    logEvent({ ev: "squad_created", clientId: "c1", room: "AAA" });
    logEvent({ ev: "member_joined", clientId: "c1", room: "AAA", color: "cyan", size: 1 });
    logEvent({ ev: "member_joined", clientId: "c2", room: "AAA", color: "orange", size: 2 });
    // Same client joins a second squad later — should NOT double-count uniques.
    logEvent({ ev: "member_joined", clientId: "c1", room: "BBB", color: "cyan", size: 1 });

    const s = getStats({ activeSquads: 2, activeMembers: 3 });
    expect(s.squadsCreated).toBe(1);
    expect(s.totalJoins).toBe(3);
    expect(s.uniqueClients).toBe(2);
    expect(s.activeSquads).toBe(2);
    expect(s.activeMembers).toBe(3);
  });

  it("tracks peak active members as a high-water mark", () => {
    recordActiveMembers(2);
    recordActiveMembers(5);
    recordActiveMembers(3);
    expect(getStats({ activeSquads: 0, activeMembers: 0 }).peakActiveMembers).toBe(5);
  });

  it("counts relayed messages by kind", () => {
    recordMessage("position");
    recordMessage("position");
    recordMessage("marker-add");
    const s = getStats({ activeSquads: 0, activeMembers: 0 });
    expect(s.messagesByKind.position).toBe(2);
    expect(s.messagesByKind["marker-add"]).toBe(1);
  });
});
