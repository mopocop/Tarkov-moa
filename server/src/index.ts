// Squad Mode relay — the wire layer. Accepts WebSocket connections, lets each
// socket JOIN a code-keyed room, and fans every "relayed" message out to the
// OTHER members of that room. The relay understands only control messages
// (join / heartbeat) + routing; gameplay payloads (position / quests / marker /
// draw) it forwards OPAQUELY.
//
// Security posture: a hard per-frame size cap, a per-socket token-bucket rate
// limit, strict join validation/sanitization, explicit protocol-version
// feedback, and never trusting a client-supplied `from` (origin is re-stamped).

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  SquadErrorCodes,
  encode,
  makeEnvelope,
  isRelayedKind,
  type AnyEnvelope,
  type SquadErrorCode,
  type JoinPayload,
} from "../../shared/squadProtocol.ts";
import {
  createRoom,
  getRoom,
  addMember,
  removeMember,
  touch,
  roomCount,
  memberCount,
  type Room,
} from "./rooms.ts";
import {
  logEvent,
  recordMessage,
  recordActiveMembers,
  getStats,
} from "./analytics.ts";
import { handleFeedback } from "./feedback.ts";

// A single inbound frame is hard-capped here; `ws` drops the socket before we
// ever parse anything larger. Positions/quests/markers are tiny; the largest
// message is a draw polyline, and 64 KB holds thousands of points.
const MAX_PAYLOAD = 64 * 1024;

// Per-socket token bucket. Screenshot-driven traffic is sparse; 15 msg/s
// sustained with a 40-burst comfortably covers marker/draw bursts while
// stopping a flooder.
const RATE_PER_SEC = 15;
const RATE_BURST = 40;
const NAME_MAX = 24;

interface AliveWs extends WebSocket {
  isAlive?: boolean;
}

// Drop C0 control chars (code < 32) and DEL (127), trim, cap length. Written as
// a char-code filter rather than a regex so the source stays plain ASCII.
function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) out += ch;
  }
  return out.trim().slice(0, NAME_MAX);
}

function makeRateLimiter(): () => boolean {
  let tokens = RATE_BURST;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(RATE_BURST, tokens + ((now - last) / 1000) * RATE_PER_SEC);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function sendError(ws: WebSocket, code: SquadErrorCode, message: string): void {
  ws.send(encode(makeEnvelope("error", "server", { code, message })));
}

function broadcast(room: Room, exceptId: string, frame: string): void {
  for (const [id, conn] of room.members) {
    if (id !== exceptId) conn.send(frame);
  }
}

function wireWss(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket) => {
    let roomCode: string | undefined;
    let memberId: string | undefined;
    let clientId = "anon";
    let joinTs = 0;
    const allow = makeRateLimiter();
    let lastRateErr = 0;

    const sock = ws as AliveWs;
    sock.isAlive = true;
    ws.on("pong", () => {
      sock.isAlive = true;
    });

    ws.on("message", (data) => {
      // 1) Rate limit — cheap, before any parsing.
      if (!allow()) {
        const now = Date.now();
        if (now - lastRateErr > 2000) {
          lastRateErr = now;
          sendError(ws, SquadErrorCodes.RATE_LIMITED, "Slow down");
        }
        return;
      }

      // 2) Parse + validate the envelope. Single parse (rather than the shared
      // decode()) so we can reply with an explicit version mismatch instead of
      // silently dropping a frame from an out-of-date client.
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const e = parsed as Record<string, unknown>;
      if (typeof e.v !== "number") return;
      if (e.v !== PROTOCOL_VERSION) {
        sendError(
          ws,
          SquadErrorCodes.PROTOCOL_MISMATCH,
          "Please update the app to the latest version",
        );
        return;
      }
      if (
        typeof e.kind !== "string" ||
        typeof e.from !== "string" ||
        typeof e.ts !== "number" ||
        !("payload" in e)
      ) {
        return;
      }
      const env = parsed as AnyEnvelope;

      // 3) JOIN — the only message a not-yet-joined socket may send.
      if (env.kind === "join") {
        const p = env.payload as Partial<JoinPayload>;
        const name = sanitizeName(p?.name);
        if (!name) {
          sendError(ws, SquadErrorCodes.NAME_REQUIRED, "A display name is required");
          return;
        }
        clientId = typeof p?.clientId === "string" ? p.clientId : "anon";
        const code =
          typeof p?.code === "string" && p.code.trim() ? p.code.trim() : null;
        const isCreate = !code;
        const room = code ? getRoom(code) : createRoom();
        if (!room) {
          sendError(ws, SquadErrorCodes.BAD_CODE, "No squad with that code");
          return;
        }
        const colorPref = typeof p?.colorPref === "string" ? p.colorPref : undefined;
        const res = addMember(room, name, colorPref, (raw) => ws.send(raw));
        if ("error" in res) {
          sendError(ws, SquadErrorCodes.SQUAD_FULL, "That squad is full");
          return;
        }
        roomCode = room.code;
        memberId = res.member.id;
        joinTs = Date.now();
        if (isCreate) logEvent({ ev: "squad_created", clientId, room: room.code });
        logEvent({
          ev: "member_joined",
          clientId,
          room: room.code,
          color: res.member.colorId,
          size: room.members.size,
        });
        recordActiveMembers(memberCount());
        const roster = [...room.members.values()].map((c) => c.member);
        ws.send(
          encode(
            makeEnvelope("joined", "server", {
              code: room.code,
              selfId: res.member.id,
              colorId: res.member.colorId,
              members: roster,
            }),
          ),
        );
        broadcast(
          room,
          memberId,
          encode(makeEnvelope("peer-join", "server", { member: res.member })),
        );
        console.log(
          `[join] room=${room.code} member=${res.member.name} size=${room.members.size}`,
        );
        return;
      }

      // Everything past here requires a joined socket in a live room.
      if (!roomCode || !memberId) return;
      const room = getRoom(roomCode);
      if (!room) return;
      touch(room, memberId);

      if (env.kind === "heartbeat") return; // touch() above is the whole job

      // 4) RELAY — opaque fan-out of gameplay messages with origin re-stamped to
      // the sender's member id (never trust a client-supplied `from`).
      if (!isRelayedKind(env.kind)) return;
      recordMessage(env.kind);
      const frame = encode({ ...env, from: memberId, ts: Date.now() } as AnyEnvelope);
      broadcast(room, memberId, frame);
    });

    const cleanup = (): void => {
      if (!roomCode || !memberId) return;
      const room = getRoom(roomCode);
      if (room) {
        removeMember(room, memberId);
        broadcast(
          room,
          memberId,
          encode(makeEnvelope("peer-leave", "server", { id: memberId })),
        );
        logEvent({
          ev: "member_left",
          clientId,
          room: roomCode,
          durationMs: joinTs ? Date.now() - joinTs : 0,
          size: room.members.size,
        });
        console.log(`[leave] room=${roomCode} member=${memberId}`);
      }
      roomCode = undefined;
      memberId = undefined;
    };
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });

  // Keepalive: ping every 30s; terminate sockets that missed the previous pong.
  const ping = setInterval(() => {
    for (const client of wss.clients) {
      const sock = client as AliveWs;
      if (sock.isAlive === false) {
        sock.terminate();
        continue;
      }
      sock.isAlive = false;
      if (sock.readyState === sock.OPEN) sock.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(ping));
}

export function startServer(
  port: number,
): Promise<{ close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const STATS_TOKEN = process.env.STATS_TOKEN ?? "";
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (url.pathname === "/feedback") {
        handleFeedback(req, res);
        return;
      }
      if (url.pathname === "/stats") {
        // Gated: disabled unless STATS_TOKEN is set AND the caller presents it.
        if (!STATS_TOKEN || url.searchParams.get("token") !== STATS_TOKEN) {
          res.writeHead(404);
          res.end();
          return;
        }
        const stats = getStats({
          activeSquads: roomCount(),
          activeMembers: memberCount(),
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(stats, null, 2));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });
    wireWss(wss);
    server.listen(port, () => {
      resolve({
        close: () =>
          new Promise<void>((done) => {
            wss.close();
            server.close(() => done());
          }),
      });
    });
  });
}

const PORT = Number(process.env.PORT ?? 8787);

// Auto-start only when executed directly (not when imported, e.g. by the smoke
// test or a future test harness).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startServer(PORT).then(() =>
    console.log(`squad-relay listening on :${PORT}`),
  );
}
