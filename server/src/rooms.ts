import {
  type SquadMember,
  MAX_SQUAD_SIZE,
  firstFreeColorId,
} from "../../shared/squadProtocol.ts";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export type Conn = {
  member: SquadMember;
  send: (raw: string) => void;
};

export type Room = {
  code: string;
  members: Map<string, Conn>;
};

const rooms = new Map<string, Room>();

export function createRoom(): Room {
  let code: string;
  do {
    code = randomCode();
  } while (rooms.has(code));
  const room: Room = { code, members: new Map() };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function roomCount(): number {
  return rooms.size;
}

export function memberCount(): number {
  let n = 0;
  for (const room of rooms.values()) n += room.members.size;
  return n;
}

/** Test-only: drop all rooms so each test starts from a clean registry. */
export function __resetRooms(): void {
  rooms.clear();
}

export function addMember(
  room: Room,
  name: string,
  colorPref: string | undefined,
  send: (raw: string) => void,
): { error: "squad_full" } | { member: SquadMember } {
  if (room.members.size >= MAX_SQUAD_SIZE) {
    return { error: "squad_full" };
  }
  const taken = [...room.members.values()].map((c) => c.member.colorId);
  const colorId = firstFreeColorId(taken, colorPref);
  if (colorId === null) {
    return { error: "squad_full" };
  }
  const id = crypto.randomUUID();
  const member: SquadMember = {
    id,
    name,
    colorId,
    lastSeenTs: Date.now(),
  };
  room.members.set(id, { member, send });
  return { member };
}

export function removeMember(room: Room, memberId: string): void {
  room.members.delete(memberId);
  if (room.members.size === 0) {
    rooms.delete(room.code);
  }
}

export function touch(room: Room, memberId: string): void {
  const conn = room.members.get(memberId);
  if (conn) {
    conn.member.lastSeenTs = Date.now();
  }
}
