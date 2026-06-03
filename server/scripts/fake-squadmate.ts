// Headless fake squadmate — connects to a relay, joins a squad, and emits a
// slowly circling position every few seconds. Lets you exercise the REAL app
// against a "teammate" without a second PC (used by the end-to-end verification
// in the plan's Step 19, and handy for manual testing).
//
//   npx tsx scripts/fake-squadmate.ts [wsUrl] [code] [name] [colorId] [mapId]
//
// Args (use "-" to skip and take the default):
//   wsUrl   default ws://localhost:8787
//   code    default "-" => create a NEW squad (its code is printed on join)
//   name    default "Bot"
//   colorId default auto (server picks the next free color)
//   mapId   default Customs — OVERRIDE to the tarkov.dev map id you're viewing
//           in the app, or the bot's dot won't be on your current map.

import { WebSocket } from "ws";
import {
  makeEnvelope,
  decode,
  hexForColorId,
  type AnyEnvelope,
} from "../../shared/squadProtocol.ts";

const arg = (i: number, def: string): string => {
  const v = process.argv[i];
  return v && v !== "-" ? v : def;
};

const wsUrl = arg(2, "ws://localhost:8787");
const code = process.argv[3] && process.argv[3] !== "-" ? process.argv[3] : null;
const name = arg(4, "Bot");
const colorPref =
  process.argv[5] && process.argv[5] !== "-" ? process.argv[5] : undefined;
const mapId = arg(6, "56f40101d2720b2a4d8b45d6"); // Customs (override as needed)

const clientId = `bot-${Math.random().toString(36).slice(2, 10)}`;
const ws = new WebSocket(wsUrl);

ws.on("open", () => {
  ws.send(
    JSON.stringify(makeEnvelope("join", "", { code, name, colorPref, clientId })),
  );
});

let selfId = "";
let colorHex = "#ffffff";
let t = 0;

// Stable ids so re-sends upsert (the app keys markers/draws by id) instead of
// duplicating. Re-emitted on every peer-join so they show up no matter who
// joined first — the relay never replays anything sent before you arrived.
const markerId = `bot-marker-${clientId}`;
const drawId = `bot-draw-${clientId}`;

const sendAnnotations = (): void => {
  // A shared custom marker — the app tints it with the bot's squad color.
  ws.send(
    JSON.stringify(
      makeEnvelope("marker-add", selfId, {
        id: markerId,
        mapId,
        category: "custom",
        position: { x: 70, y: 0, z: 0 },
        label: `${name}'s stash`,
      }),
    ),
  );
  // A circle of shared "ink" so you can see drawing sync (the app renders peer
  // strokes in the author's squad color, ignoring this payload color).
  const points: Array<{ x: number; z: number }> = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    points.push({ x: -70 + Math.cos(a) * 35, z: -70 + Math.sin(a) * 35 });
  }
  ws.send(
    JSON.stringify(makeEnvelope("draw-add", selfId, { id: drawId, mapId, color: colorHex, points })),
  );
};

ws.on("message", (data) => {
  const env = decode(String(data)) as AnyEnvelope | null;
  if (!env) return;

  switch (env.kind) {
    case "joined": {
      selfId = env.payload.selfId;
      colorHex = hexForColorId(env.payload.colorId);
      console.log(
        `[${name}] joined squad ${env.payload.code} as color "${env.payload.colorId}" (${selfId})`,
      );
      console.log(`[${name}] >>> JOIN CODE for the app: ${env.payload.code}`);
      sendAnnotations(); // marker + drawing (in case a peer is already here)
      // Circle around the map origin, one step every 4s.
      setInterval(() => {
        t += 0.3;
        const x = Math.cos(t) * 40;
        const z = Math.sin(t) * 40;
        ws.send(
          JSON.stringify(
            makeEnvelope("position", selfId, {
              mapId,
              x,
              y: 0,
              z,
              rotation: ((t * 57) % 360) - 180,
            }),
          ),
        );
      }, 4000);
      // Heartbeat so the relay keeps us "fresh".
      setInterval(
        () => ws.send(JSON.stringify(makeEnvelope("heartbeat", selfId, {}))),
        20000,
      );
      break;
    }
    case "peer-join":
      console.log(`[${name}] peer joined: ${env.payload.member.name}`);
      sendAnnotations(); // re-emit so the newcomer sees the marker + drawing
      break;
    case "peer-leave":
      console.log(`[${name}] peer left: ${env.payload.id}`);
      break;
    case "error":
      console.error(`[${name}] error: ${env.payload.code} — ${env.payload.message}`);
      break;
    default:
      break;
  }
});

ws.on("close", () => console.log(`[${name}] disconnected`));
ws.on("error", (e) => console.error(`[${name}] ws error:`, e.message));
