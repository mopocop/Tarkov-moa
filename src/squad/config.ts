// Relay endpoint. Defaults to the local dev relay; override at build time with
// VITE_SQUAD_RELAY_URL (e.g. wss://squad.<host> once deployed behind the
// Cloudflare Tunnel — see the plan's Step 18). Read defensively so the same
// module also works under node/tsx (where import.meta.env is absent).
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

export const RELAY_URL: string = env?.VITE_SQUAD_RELAY_URL ?? "ws://localhost:8787";

// The relay also hosts the anonymous feedback intake over HTTP(S) — same host,
// ws:// → http:// (and wss:// → https:// in production).
export const FEEDBACK_URL: string = RELAY_URL.replace(/^ws/, "http") + "/feedback";

// A squadmate's dot is only as fresh as their last in-game screenshot. Past this
// age we visibly fade it; the SquadCard also shows a relative "last seen".
export const POSITION_STALE_MS = 90_000;

// How long the SquadCard flashes a member row when a fresh position lands.
export const FRESH_FLASH_MS = 1500;
