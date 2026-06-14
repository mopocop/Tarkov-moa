// Squad transport — a thin, framework-agnostic WebSocket client for the relay.
// Owns connection lifecycle: connect, auto-(re)join, heartbeat, and exponential
// backoff reconnect. It does NOT interpret gameplay state — it hands every
// decoded envelope to a single `onMessage` sink (the SquadProvider dispatches by
// kind). Designed so a future P2P transport can implement the same shape.

import { makeEnvelope, decode } from "../../shared/squadProtocol";
import type { AnyEnvelope, MessageKind, JoinPayload } from "../../shared/squadProtocol";

export type ConnStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface TransportHandlers {
  onStatus?: (s: ConnStatus) => void;
  onMessage?: (env: AnyEnvelope) => void;
}

export interface JoinIntent {
  code: string | null; // null => create a new squad
  name: string;
  colorId: string | null;
  clientId: string;
}

const HEARTBEAT_MS = 20_000;
const MAX_BACKOFF_MS = 30_000;
// How long an INITIAL join may spend trying before we give up and surface an
// error. A drop AFTER we've connected reconnects forever (wifi blips), but a
// join that never lands — bad relay, wrong code that the server never answers,
// no fake-squadmate running — must not spin "Reconnecting…" with no way out.
const CONNECT_DEADLINE_MS = 12_000;

export class SquadTransport {
  private ws: WebSocket | null = null;
  private intent: JoinIntent | null = null;
  private status: ConnStatus = "idle";
  private attempts = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  // Armed on connect(), cleared once we reach "connected". If it fires first the
  // initial join is declared dead.
  private connectDeadline: ReturnType<typeof setTimeout> | null = null;
  // True once we've ever reached "connected" this session — gates infinite
  // reconnect (only an established squad earns it).
  private everConnected = false;
  private closedByUser = false;
  private readonly url: string;
  private readonly handlers: TransportHandlers;

  constructor(url: string, handlers: TransportHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  /** Begin (or restart) a connection with the given join intent. */
  connect(intent: JoinIntent): void {
    this.closedByUser = false;
    this.everConnected = false;
    this.attempts = 0;
    this.intent = intent;
    this.armConnectDeadline();
    this.open();
  }

  /** Intentional disconnect — no reconnect. */
  close(): void {
    this.closedByUser = true;
    this.intent = null;
    this.clearConnectDeadline();
    if (this.reconnect) {
      clearTimeout(this.reconnect);
      this.reconnect = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.setStatus("idle");
  }

  getStatus(): ConnStatus {
    return this.status;
  }

  /** Send a framed envelope (no-op if the socket isn't open). `from` is left
   * empty — the relay re-stamps it with our member id. */
  send<K extends MessageKind, P>(kind: K, payload: P): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(makeEnvelope(kind, "", payload)));
    }
  }

  private setStatus(s: ConnStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  private open(): void {
    if (!this.intent) return;
    this.setStatus(this.attempts > 0 ? "reconnecting" : "connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      const intent = this.intent;
      if (!intent) return;
      const join: JoinPayload = {
        code: intent.code,
        name: intent.name,
        colorPref: intent.colorId ?? undefined,
        clientId: intent.clientId,
      };
      this.send("join", join);
      this.startHeartbeat();
    };

    ws.onmessage = (ev: MessageEvent) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      const env = decode(raw);
      if (!env) return;
      // Learn our squad's code from `joined` so a reconnect rejoins the SAME
      // squad (and a freshly-created squad isn't recreated on every drop).
      if (env.kind === "joined") {
        if (this.intent) this.intent = { ...this.intent, code: env.payload.code };
        this.everConnected = true;
        this.clearConnectDeadline();
        this.setStatus("connected");
      }
      this.handlers.onMessage?.(env);
    };

    ws.onclose = () => {
      this.stopHeartbeat();
      this.ws = null;
      if (this.closedByUser) {
        this.setStatus("idle");
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // An error is always followed by close; just make sure we tear down.
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || !this.intent) return;
    this.setStatus("reconnecting");
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempts);
    this.attempts += 1;
    this.reconnect = setTimeout(() => this.open(), delay);
  }

  private armConnectDeadline(): void {
    this.clearConnectDeadline();
    this.connectDeadline = setTimeout(() => {
      // Still not connected when the deadline fires → the join is dead. Tear
      // everything down and surface "error" so the UI can offer Cancel/retry
      // instead of spinning forever.
      if (this.everConnected) return;
      this.intent = null; // stops scheduleReconnect on the pending onclose
      if (this.reconnect) {
        clearTimeout(this.reconnect);
        this.reconnect = null;
      }
      this.stopHeartbeat();
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          /* ignore */
        }
        this.ws = null;
      }
      this.setStatus("error");
    }, CONNECT_DEADLINE_MS);
  }

  private clearConnectDeadline(): void {
    if (this.connectDeadline) {
      clearTimeout(this.connectDeadline);
      this.connectDeadline = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => this.send("heartbeat", {}), HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
