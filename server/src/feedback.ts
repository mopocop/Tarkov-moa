// In-app feedback intake — POST /feedback.
//
// Treat as a hostile public endpoint: hard body-size cap, per-IP token-bucket
// rate limit, strict schema validation, whitelisted metadata keys only, and
// control-character stripping. PRIVACY: same posture as analytics.ts — the only
// identity is the client's random `clientId`; no IP is ever written to disk.
//
// Storage: append-only JSON-Lines at FEEDBACK_FILE (default ./data/feedback.jsonl;
// set to "" to keep memory-only, as the tests do).

import type { IncomingMessage, ServerResponse } from "node:http";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const MAX_BODY_BYTES = 16 * 1024;
const TEXT_MAX = 4000;
const META_STR_MAX = 64;
const CATEGORIES = new Set(["bug", "idea", "praise", "other"]);

// Per-IP token bucket: feedback is a rare, human-paced action. 4 burst,
// then one token every 30s.
const RATE_BURST = 4;
const RATE_PER_SEC = 1 / 30;
const buckets = new Map<string, { tokens: number; last: number }>();
const BUCKETS_MAX = 10_000; // hard memory cap; reset wholesale if ever hit

function allowIp(ip: string): boolean {
  const now = Date.now();
  if (buckets.size > BUCKETS_MAX) buckets.clear();
  const b = buckets.get(ip) ?? { tokens: RATE_BURST, last: now };
  b.tokens = Math.min(RATE_BURST, b.tokens + ((now - b.last) / 1000) * RATE_PER_SEC);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

// Strip C0 controls (keep \n, \t) + DEL, collapse \r\n, trim, cap.
function sanitizeText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  let out = "";
  for (const ch of raw.replace(/\r\n/g, "\n")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 10 || code === 9 || (code >= 32 && code !== 127)) out += ch;
  }
  return out.trim().slice(0, max);
}

export interface FeedbackEntry {
  ts: number;
  text: string;
  category?: string;
  meta: Record<string, string | boolean>;
}

// Whitelisted, non-PII metadata keys the client may attach. Anything else in
// the payload is silently dropped — never stored.
const META_KEYS = [
  "appVersion",
  "os",
  "osVersion",
  "locale",
  "clientId",
  "mapId",
  "squadActive",
  "channel",
] as const;

const FILE = process.env.FEEDBACK_FILE ?? "./data/feedback.jsonl";
let ensuredDir = false;
const memory: FeedbackEntry[] = []; // used when FILE is "" (tests)

async function persist(entry: FeedbackEntry): Promise<void> {
  if (!FILE) {
    memory.push(entry);
    return;
  }
  try {
    if (!ensuredDir) {
      await mkdir(dirname(FILE), { recursive: true });
      ensuredDir = true;
    }
    await appendFile(FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Feedback must never crash the relay; a lost line is acceptable.
  }
}

/** Test-only: entries captured while FEEDBACK_FILE="". */
export function __getFeedback(): FeedbackEntry[] {
  return memory;
}
/** Test-only: reset memory store + rate buckets. */
export function __resetFeedback(): void {
  memory.length = 0;
  buckets.clear();
}

function respond(res: ServerResponse, status: number, body?: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    // Anonymous, credential-less write endpoint — wildcard origin is fine and
    // lets the Tauri webview (tauri://localhost) and dev server both post.
    "access-control-allow-origin": "*",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

export function handleFeedback(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    });
    res.end();
    return;
  }
  if (req.method !== "POST") {
    respond(res, 405, { ok: false, error: "method" });
    return;
  }

  // Cloudflare Tunnel puts the real client IP in CF-Connecting-IP.
  const ip =
    (typeof req.headers["cf-connecting-ip"] === "string" && req.headers["cf-connecting-ip"]) ||
    req.socket.remoteAddress ||
    "unknown";
  if (!allowIp(ip)) {
    respond(res, 429, { ok: false, error: "rate_limited" });
    return;
  }

  let size = 0;
  const chunks: Buffer[] = [];
  let aborted = false;
  req.on("data", (chunk: Buffer) => {
    if (aborted) return;
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      aborted = true;
      respond(res, 413, { ok: false, error: "too_large" });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (aborted) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      respond(res, 400, { ok: false, error: "bad_json" });
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      respond(res, 400, { ok: false, error: "bad_body" });
      return;
    }
    const body = parsed as Record<string, unknown>;

    const text = sanitizeText(body.text, TEXT_MAX);
    if (!text) {
      respond(res, 400, { ok: false, error: "text_required" });
      return;
    }

    const entry: FeedbackEntry = { ts: Date.now(), text, meta: {} };

    if (typeof body.category === "string" && CATEGORIES.has(body.category)) {
      entry.category = body.category;
    }

    const meta = body.meta;
    if (meta && typeof meta === "object") {
      const m = meta as Record<string, unknown>;
      for (const key of META_KEYS) {
        const v = m[key];
        if (typeof v === "boolean") entry.meta[key] = v;
        else if (typeof v === "string") {
          const s = sanitizeText(v, META_STR_MAX);
          if (s) entry.meta[key] = s;
        }
      }
    }

    void persist(entry);
    console.log(
      `[feedback] ${entry.category ?? "uncategorized"} (${text.length} chars) from ${entry.meta.clientId ?? "anon"}`,
    );
    respond(res, 200, { ok: true });
  });
  req.on("error", () => {
    aborted = true;
  });
}
