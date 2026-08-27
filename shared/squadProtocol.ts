// Squad Mode wire protocol — the single source of truth for messages exchanged
// between the client (src/squad/*) and the relay server (server/*).
//
// DESIGN RULES (do not break):
//  1. ZERO imports. This file must stay portable so the relay never depends on
//     client internals. Both sides import FROM here; it imports nothing.
//  2. Transport-agnostic. Every message is a self-describing JSON envelope. The
//     same envelope rides a WebSocket today or a WebRTC RTCDataChannel later —
//     only the send/receive plumbing differs, never this contract.
//  3. The relay only needs to UNDERSTAND control messages (join/joined/peer-*/
//     error) + the color palette. Data messages (position/quests/marker/draw)
//     it relays OPAQUELY to roommates — it never inspects their payloads.
//  4. No `enum`/`namespace` (the app tsconfig sets erasableSyntaxOnly). Use
//     `as const` objects + string-literal unions instead.

// Bumped to 2 in the json.tarkov.dev migration.
//
// Quest ids did NOT change — they are BSG's own MongoIds, which the game writes
// into its logs and both upstreams reuse verbatim — so QuestsPayload is wire
// compatible. Two MAP ids did change, because the app had them wrong: Reserve
// and Terminal. PositionPayload, WireMarker and DrawPayload all carry a mapId,
// and the receiver drops anything whose mapId does not match the map it is
// showing (SquadmateLayer). So a 0.8.x client and a 0.9 client sharing a squad
// would each see the other vanish on those two maps — no error, no log, just an
// absent dot, which reads as "the app is broken".
//
// Normalising the old ids on receipt would not save it: an 0.8.x client still
// cannot place a 0.9 client's Reserve position, and it is already shipped. So
// the honest move is to make the mismatch explicit. SquadErrorCodes.
// PROTOCOL_MISMATCH already exists and is already FATAL, which turns three
// silent failures into one message the user can act on.
export const PROTOCOL_VERSION = 2;

// ---------------------------------------------------------------------------
// Squad color palette — server assigns one per member (unique within a squad),
// client renders dots/markers/quest-pins in it. Intentionally DISTINCT from the
// semantic MARKER_COLORS (quest yellow / danger red / scav orange…) so a
// squadmate's identity never reads as "quest" or "danger". 8 slots → a squad is
// hard-capped at 8 members (Moacir's 2–5 sits well inside). Overridable: swap
// these hexes for brand colors later without touching any other code.
// ---------------------------------------------------------------------------
export interface SquadColor {
  id: string; // stable key sent on the wire (e.g. "cyan")
  name: string; // human label for the picker
  hex: string; // render color
}

export const SQUAD_COLORS: readonly SquadColor[] = [
  { id: "cyan", name: "Cyan", hex: "#4FC3DC" },
  { id: "orange", name: "Orange", hex: "#E09B4C" },
  { id: "violet", name: "Violet", hex: "#A08BE0" },
  { id: "pink", name: "Pink", hex: "#DC7FB0" },
  { id: "green", name: "Green", hex: "#7CC96B" },
  { id: "blue", name: "Blue", hex: "#6593DC" },
  { id: "red", name: "Red", hex: "#DC6660" },
  { id: "white", name: "White", hex: "#ECEEE8" },
] as const;

export const MAX_SQUAD_SIZE = SQUAD_COLORS.length;

/** Look up a color by id. Returns undefined for an unknown id. */
export function colorById(id: string): SquadColor | undefined {
  return SQUAD_COLORS.find((c) => c.id === id);
}

/** Hex for a color id, with a neutral fallback so render never breaks. */
export function hexForColorId(id: string): string {
  return colorById(id)?.hex ?? "#9CA3AF";
}

/**
 * First palette color not present in `taken`, honoring an optional preference.
 * Pure — both the server (seating a joiner) and the client (suggesting a pick)
 * can share it. Returns null when the squad is full.
 */
export function firstFreeColorId(taken: string[], prefer?: string): string | null {
  const used = new Set(taken);
  if (prefer && colorById(prefer) && !used.has(prefer)) return prefer;
  for (const c of SQUAD_COLORS) {
    if (!used.has(c.id)) return c.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------
export interface SquadMember {
  id: string; // server-assigned, ephemeral for this session
  name: string; // display name (client-chosen, persisted client-side)
  colorId: string; // one of SQUAD_COLORS[].id; unique within the squad
  lastSeenTs: number; // server clock (ms); refreshed on any message from them
}

// ---------------------------------------------------------------------------
// Data payloads — relayed OPAQUELY by the server. Typed here for the client's
// benefit only; the server treats these as pass-through blobs.
// ---------------------------------------------------------------------------
export interface PositionPayload {
  mapId: string; // tarkov.dev Map.id the sender is currently on
  x: number;
  y: number;
  z: number;
  rotation: number; // yaw degrees, same frame as PlayerMarker
}

export interface QuestsPayload {
  // Active quest ids (accepted − completed − failed). The receiver re-derives
  // the objective pins locally via deriveQuestState(), so no geometry is sent.
  activeQuestIds: string[];
}

// Structural marker shape — deliberately independent of the client's `Poi` so
// this module stays import-free. The client maps Poi <-> WireMarker at the edge.
export interface WireMarker {
  id: string;
  mapId: string;
  category: string; // "custom", etc.
  subtype?: string;
  position: { x: number; y: number; z: number };
  label: string;
  note?: string;
  color?: string;
  meta?: Record<string, unknown>;
}

export interface IdPayload {
  id: string;
}

export interface DrawPayload {
  id: string;
  mapId: string;
  color: string; // author color hex (resolved from their colorId)
  points: Array<{ x: number; z: number }>; // game coords; flat polyline (no y)
}

// ---------------------------------------------------------------------------
// Control payloads — the server DOES understand these.
// ---------------------------------------------------------------------------
export interface JoinPayload {
  code: string | null; // null/"" => create a new squad; else join that code
  name: string;
  colorPref?: string; // preferred SquadColor id; server seats next-free if taken
  clientId: string; // random, persisted client-side — the anonymous analytics key
}

export interface JoinedPayload {
  code: string; // the squad code (freshly minted on create, echoed on join)
  selfId: string; // your server-assigned member id for this session
  colorId: string; // the color the server actually seated you with
  members: SquadMember[]; // full current roster, including you
}

export interface PeerJoinPayload {
  member: SquadMember;
}

export interface PeerLeavePayload {
  id: string;
}

export const SquadErrorCodes = {
  BAD_CODE: "bad_code",
  SQUAD_FULL: "squad_full",
  RATE_LIMITED: "rate_limited",
  BAD_MESSAGE: "bad_message",
  NAME_REQUIRED: "name_required",
  PROTOCOL_MISMATCH: "protocol_mismatch",
} as const;
export type SquadErrorCode = (typeof SquadErrorCodes)[keyof typeof SquadErrorCodes];

export interface ErrorPayload {
  code: SquadErrorCode;
  message: string;
}

// ---------------------------------------------------------------------------
// Message kinds + envelope
// ---------------------------------------------------------------------------
export const MessageKinds = {
  Join: "join",
  Joined: "joined",
  PeerJoin: "peer-join",
  PeerLeave: "peer-leave",
  Position: "position",
  Quests: "quests",
  MarkerAdd: "marker-add",
  MarkerRemove: "marker-remove",
  DrawAdd: "draw-add",
  DrawRemove: "draw-remove",
  Heartbeat: "heartbeat",
  Error: "error",
} as const;
export type MessageKind = (typeof MessageKinds)[keyof typeof MessageKinds];

// `from` = the sender's member id for relayed data messages; "server" for
// server-originated control messages; "" for a client's own pre-join `join`.
export interface Envelope<K extends MessageKind, P> {
  v: typeof PROTOCOL_VERSION;
  kind: K;
  from: string;
  ts: number;
  payload: P;
}

export type ClientToServer =
  | Envelope<"join", JoinPayload>
  | Envelope<"heartbeat", Record<string, never>>
  | Envelope<"position", PositionPayload>
  | Envelope<"quests", QuestsPayload>
  | Envelope<"marker-add", WireMarker>
  | Envelope<"marker-remove", IdPayload>
  | Envelope<"draw-add", DrawPayload>
  | Envelope<"draw-remove", IdPayload>;

export type ServerToClient =
  | Envelope<"joined", JoinedPayload>
  | Envelope<"peer-join", PeerJoinPayload>
  | Envelope<"peer-leave", PeerLeavePayload>
  | Envelope<"position", PositionPayload>
  | Envelope<"quests", QuestsPayload>
  | Envelope<"marker-add", WireMarker>
  | Envelope<"marker-remove", IdPayload>
  | Envelope<"draw-add", DrawPayload>
  | Envelope<"draw-remove", IdPayload>
  | Envelope<"error", ErrorPayload>;

export type AnyEnvelope = ClientToServer | ServerToClient;

// Data messages a connected member may broadcast (server fans these out to the
// rest of the room verbatim, overwriting `from` with the sender's member id).
export const RELAYED_KINDS: readonly MessageKind[] = [
  "position",
  "quests",
  "marker-add",
  "marker-remove",
  "draw-add",
  "draw-remove",
] as const;

export function isRelayedKind(kind: string): boolean {
  return (RELAYED_KINDS as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------------------
// Encode / decode helpers — shared so both ends frame identically.
// ---------------------------------------------------------------------------
export function makeEnvelope<K extends MessageKind, P>(
  kind: K,
  from: string,
  payload: P,
): Envelope<K, P> {
  return { v: PROTOCOL_VERSION, kind, from, ts: Date.now(), payload };
}

export function encode(env: AnyEnvelope): string {
  return JSON.stringify(env);
}

/**
 * Parse + shallow-validate an inbound frame. Returns null on garbage / version
 * mismatch so either side can drop bad frames without throwing. Payload shape is
 * NOT deeply validated here (the server relays data payloads opaquely); callers
 * that consume a specific kind narrow via the discriminated union.
 */
export function decode(raw: string): AnyEnvelope | null {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof o !== "object" || o === null) return null;
  const e = o as Record<string, unknown>;
  if (e.v !== PROTOCOL_VERSION) return null;
  if (typeof e.kind !== "string") return null;
  if (typeof e.from !== "string") return null;
  if (typeof e.ts !== "number") return null;
  if (!("payload" in e)) return null;
  return o as AnyEnvelope;
}
