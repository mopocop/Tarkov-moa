import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  getRoom,
  addMember,
  removeMember,
  memberCount,
  roomCount,
  __resetRooms,
} from "./rooms.ts";
import { MAX_SQUAD_SIZE, SQUAD_COLORS } from "../../shared/squadProtocol.ts";

const noop = (): void => {};

beforeEach(() => __resetRooms());

describe("rooms", () => {
  it("createRoom makes an 8-char code and registers an empty room", () => {
    const room = createRoom();
    expect(room.code).toHaveLength(8);
    expect(room.members.size).toBe(0);
    expect(roomCount()).toBe(1);
    expect(getRoom(room.code)).toBe(room);
  });

  it("getRoom is case-insensitive", () => {
    const room = createRoom();
    expect(getRoom(room.code.toLowerCase())).toBe(room);
  });

  it("getRoom returns undefined for an unknown code", () => {
    expect(getRoom("NOPENOPE")).toBeUndefined();
  });

  it("addMember assigns the preferred color when free, else the next free one", () => {
    const room = createRoom();
    const a = addMember(room, "A", "violet", noop);
    const b = addMember(room, "B", "violet", noop); // preference taken
    expect("member" in a).toBe(true);
    expect("member" in b).toBe(true);
    if ("member" in a && "member" in b) {
      expect(a.member.colorId).toBe("violet");
      expect(b.member.colorId).not.toBe("violet");
      expect(a.member.id).not.toBe(b.member.id);
    }
  });

  it("enforces MAX_SQUAD_SIZE (= palette size) and rejects overflow", () => {
    expect(MAX_SQUAD_SIZE).toBe(SQUAD_COLORS.length);
    const room = createRoom();
    for (let i = 0; i < MAX_SQUAD_SIZE; i++) {
      expect("member" in addMember(room, `M${i}`, undefined, noop)).toBe(true);
    }
    const overflow = addMember(room, "X", undefined, noop);
    expect("error" in overflow).toBe(true);
    expect(room.members.size).toBe(MAX_SQUAD_SIZE);
    // Every seated member has a distinct color.
    const colors = new Set([...room.members.values()].map((c) => c.member.colorId));
    expect(colors.size).toBe(MAX_SQUAD_SIZE);
  });

  it("removeMember deletes the room once it empties", () => {
    const room = createRoom();
    const a = addMember(room, "A", undefined, noop);
    expect(roomCount()).toBe(1);
    if ("member" in a) removeMember(room, a.member.id);
    expect(roomCount()).toBe(0);
    expect(getRoom(room.code)).toBeUndefined();
  });

  it("memberCount sums members across all rooms", () => {
    const r1 = createRoom();
    const r2 = createRoom();
    addMember(r1, "A", undefined, noop);
    addMember(r1, "B", undefined, noop);
    addMember(r2, "C", undefined, noop);
    expect(memberCount()).toBe(3);
  });
});
