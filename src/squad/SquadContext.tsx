// Squad state for the whole app. A single <SquadProvider> owns one transport +
// the live squad state (roster, per-member positions/quests/markers/draws), and
// exposes actions via useSquad(). The provider dispatches decoded envelopes by
// kind into immutable state updates.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { SquadCtx } from "./useSquad";
import { RELAY_URL } from "./config";
import { SquadTransport, type ConnStatus } from "./transport";
import { loadIdentity, saveIdentity, type SquadIdentity } from "./identity";
import type {
  AnyEnvelope,
  SquadMember,
  PositionPayload,
  WireMarker,
  DrawPayload,
} from "../../shared/squadProtocol";

export interface MemberPosition {
  payload: PositionPayload;
  ts: number; // client receive time — drives staleness + the fresh-update flash
}

interface SquadState {
  status: ConnStatus;
  code: string | null;
  selfId: string | null;
  selfColorId: string | null;
  members: SquadMember[]; // roster, including self
  positions: Record<string, MemberPosition>; // by member id (others only)
  quests: Record<string, string[]>; // active quest ids by member id
  markers: Record<string, WireMarker[]>; // shared markers by member id
  draws: Record<string, DrawPayload[]>; // shared drawings by member id
  error: string | null;
}

const EMPTY: SquadState = {
  status: "idle",
  code: null,
  selfId: null,
  selfColorId: null,
  members: [],
  positions: {},
  quests: {},
  markers: {},
  draws: {},
  error: null,
};

export interface SquadApi extends SquadState {
  inSquad: boolean;
  identity: SquadIdentity;
  createSquad: (name: string, colorId: string | null) => void;
  joinSquad: (code: string, name: string, colorId: string | null) => void;
  leaveSquad: () => void;
  /** Abort an in-flight connect/reconnect (Cancel button) and reset to idle. */
  cancelConnect: () => void;
  saveProfile: (name: string, colorId: string | null) => void;
  broadcastPosition: (p: PositionPayload) => void;
  broadcastQuests: (ids: string[]) => void;
  addMarker: (m: WireMarker) => void;
  removeMarker: (id: string) => void;
  addDraw: (d: DrawPayload) => void;
  removeDraw: (id: string) => void;
  // Local view pref (NOT synced): hide a member's quest pins on the map. Keyed
  // by member id; self id is allowed too (hides your own quest markers).
  hiddenQuests: Record<string, boolean>;
  toggleQuestVisibility: (memberId: string) => void;
}

// Errors that mean "this join attempt is dead" — stop trying and reset.
const FATAL = new Set<string>([
  "bad_code",
  "squad_full",
  "name_required",
  "protocol_mismatch",
]);

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  if (!(key in rec)) return rec;
  const next = { ...rec };
  delete next[key];
  return next;
}

export function SquadProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<SquadState>(EMPTY);
  const [identity, setIdentityState] = useState<SquadIdentity>(() => loadIdentity());
  const [hiddenQuests, setHiddenQuests] = useState<Record<string, boolean>>({});

  const transportRef = useRef<SquadTransport | null>(null);
  // identityRef mirrors the latest identity for the connect/setIdentity
  // callbacks, which read it outside render — sync it after each commit.
  const identityRef = useRef<SquadIdentity>(identity);
  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);
  // Which action is in flight, so a connect-timeout error speaks the right
  // language: a create has no code to "check", a join does.
  const lastConnectModeRef = useRef<"create" | "join">("join");

  // Our own latest broadcast state — kept so we can resync to a peer who joins
  // after us (the relay never replays anything sent before they arrived).
  const selfPos = useRef<PositionPayload | null>(null);
  const selfQuests = useRef<string[] | null>(null);
  const selfMarkers = useRef<Map<string, WireMarker>>(new Map());
  const selfDraws = useRef<Map<string, DrawPayload>>(new Map());

  const resyncSelf = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    if (selfPos.current) transport.send("position", selfPos.current);
    if (selfQuests.current) transport.send("quests", { activeQuestIds: selfQuests.current });
    for (const m of selfMarkers.current.values()) transport.send("marker-add", m);
    for (const d of selfDraws.current.values()) transport.send("draw-add", d);
  }, []);

  const resetSelf = useCallback(() => {
    selfPos.current = null;
    selfQuests.current = null;
    selfMarkers.current.clear();
    selfDraws.current.clear();
  }, []);

  const handleMessage = useCallback(
    (env: AnyEnvelope) => {
      switch (env.kind) {
        case "joined":
          setState((s) => ({
            ...s,
            status: "connected",
            code: env.payload.code,
            selfId: env.payload.selfId,
            selfColorId: env.payload.colorId,
            members: env.payload.members,
            error: null,
          }));
          resyncSelf();
          break;
        case "peer-join":
          setState((s) => ({ ...s, members: upsert(s.members, env.payload.member) }));
          // The newcomer can't see anything we sent before they arrived — resend.
          resyncSelf();
          break;
        case "peer-leave": {
          const id = env.payload.id;
          setState((s) => ({
            ...s,
            members: s.members.filter((m) => m.id !== id),
            positions: omit(s.positions, id),
            quests: omit(s.quests, id),
            markers: omit(s.markers, id),
            draws: omit(s.draws, id),
          }));
          break;
        }
        case "position": {
          const from = env.from;
          const payload = env.payload;
          setState((s) => ({
            ...s,
            positions: { ...s.positions, [from]: { payload, ts: Date.now() } },
          }));
          break;
        }
        case "quests": {
          const from = env.from;
          const ids = env.payload.activeQuestIds;
          setState((s) => ({ ...s, quests: { ...s.quests, [from]: ids } }));
          break;
        }
        case "marker-add": {
          const from = env.from;
          const marker = env.payload;
          setState((s) => ({
            ...s,
            markers: { ...s.markers, [from]: upsert(s.markers[from] ?? [], marker) },
          }));
          break;
        }
        case "marker-remove": {
          const from = env.from;
          const rid = env.payload.id;
          setState((s) => ({
            ...s,
            markers: { ...s.markers, [from]: (s.markers[from] ?? []).filter((m) => m.id !== rid) },
          }));
          break;
        }
        case "draw-add": {
          const from = env.from;
          const draw = env.payload;
          setState((s) => ({
            ...s,
            draws: { ...s.draws, [from]: upsert(s.draws[from] ?? [], draw) },
          }));
          break;
        }
        case "draw-remove": {
          const from = env.from;
          const did = env.payload.id;
          setState((s) => ({
            ...s,
            draws: { ...s.draws, [from]: (s.draws[from] ?? []).filter((d) => d.id !== did) },
          }));
          break;
        }
        case "error": {
          const { code, message } = env.payload;
          if (FATAL.has(code)) {
            transportRef.current?.close();
            resetSelf();
            setHiddenQuests({});
            setState({ ...EMPTY, error: message });
          } else {
            setState((s) => ({ ...s, error: message }));
          }
          break;
        }
      }
    },
    [resyncSelf, resetSelf],
  );

  // Create the transport once.
  useEffect(() => {
    const transport = new SquadTransport(RELAY_URL, {
      onStatus: (status) =>
        setState((s) => ({
          ...s,
          status,
          // The transport gives up to "error" when an initial join never lands —
          // surface a plain-language reason. Clear stale errors once we're
          // making progress again.
          error:
            status === "error" && !s.error
              ? lastConnectModeRef.current === "create"
                ? t('errors.squadServerOffline')
                : t('errors.squadUnreachable')
              : status === "connecting" || status === "connected"
                ? null
                : s.error,
        })),
      onMessage: handleMessage,
    });
    transportRef.current = transport;
    return () => {
      transport.close();
      transportRef.current = null;
    };
  }, [handleMessage]);

  const persist = useCallback((name: string, colorId: string | null) => {
    const next: SquadIdentity = { clientId: identityRef.current.clientId, name, colorId };
    identityRef.current = next;
    setIdentityState(next);
    saveIdentity(next);
  }, []);

  const startConnect = useCallback(
    (code: string | null, name: string, colorId: string | null) => {
      lastConnectModeRef.current = code === null ? "create" : "join";
      persist(name, colorId);
      resetSelf();
      setState({ ...EMPTY, status: "connecting" });
      transportRef.current?.connect({
        code,
        name,
        colorId,
        clientId: identityRef.current.clientId,
      });
    },
    [persist, resetSelf],
  );

  const createSquad = useCallback(
    (name: string, colorId: string | null) => startConnect(null, name, colorId),
    [startConnect],
  );

  const joinSquad = useCallback(
    (code: string, name: string, colorId: string | null) => startConnect(code, name, colorId),
    [startConnect],
  );

  const leaveSquad = useCallback(() => {
    transportRef.current?.close();
    resetSelf();
    setHiddenQuests({});
    setState(EMPTY);
  }, [resetSelf]);

  const toggleQuestVisibility = useCallback((memberId: string) => {
    setHiddenQuests((h) => ({ ...h, [memberId]: !h[memberId] }));
  }, []);

  const saveProfile = useCallback(
    (name: string, colorId: string | null) => persist(name, colorId),
    [persist],
  );

  const broadcastPosition = useCallback((p: PositionPayload) => {
    selfPos.current = p;
    transportRef.current?.send("position", p);
  }, []);

  const broadcastQuests = useCallback((ids: string[]) => {
    selfQuests.current = ids;
    transportRef.current?.send("quests", { activeQuestIds: ids });
  }, []);

  const addMarker = useCallback((m: WireMarker) => {
    selfMarkers.current.set(m.id, m);
    transportRef.current?.send("marker-add", m);
  }, []);

  const removeMarker = useCallback((id: string) => {
    selfMarkers.current.delete(id);
    transportRef.current?.send("marker-remove", { id });
  }, []);

  const addDraw = useCallback((d: DrawPayload) => {
    selfDraws.current.set(d.id, d);
    transportRef.current?.send("draw-add", d);
  }, []);

  const removeDraw = useCallback((id: string) => {
    selfDraws.current.delete(id);
    transportRef.current?.send("draw-remove", { id });
  }, []);

  const api = useMemo<SquadApi>(
    () => ({
      ...state,
      inSquad: state.code !== null,
      identity,
      createSquad,
      joinSquad,
      leaveSquad,
      cancelConnect: leaveSquad,
      saveProfile,
      broadcastPosition,
      broadcastQuests,
      addMarker,
      removeMarker,
      addDraw,
      removeDraw,
      hiddenQuests,
      toggleQuestVisibility,
    }),
    [
      state,
      identity,
      createSquad,
      joinSquad,
      leaveSquad,
      saveProfile,
      broadcastPosition,
      broadcastQuests,
      addMarker,
      removeMarker,
      addDraw,
      removeDraw,
      hiddenQuests,
      toggleQuestVisibility,
    ],
  );

  return <SquadCtx.Provider value={api}>{children}</SquadCtx.Provider>;
}
