// Persistent squad identity. Per Moacir's spec, the user sets their display
// name + color ONCE and the app remembers it across squads/sessions. We also
// mint a random, anonymous `clientId` on first use — this is the ONLY identifier
// the relay's analytics ever sees (no PII, no account).

const KEY = "tc_squad_identity_v1";

export interface SquadIdentity {
  clientId: string; // random UUID, generated once — the anonymous analytics key
  name: string; // display name (set once, remembered)
  colorId: string | null; // preferred squad color id (set once, remembered)
}

function genId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadIdentity(): SquadIdentity {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SquadIdentity>;
      const clientId =
        typeof p.clientId === "string" && p.clientId ? p.clientId : genId();
      const id: SquadIdentity = {
        clientId,
        name: typeof p.name === "string" ? p.name : "",
        colorId: typeof p.colorId === "string" ? p.colorId : null,
      };
      // Backfill a missing clientId so it stays stable from now on.
      if (clientId !== p.clientId) saveIdentity(id);
      return id;
    }
  } catch {
    // fall through to a fresh identity
  }
  const fresh: SquadIdentity = { clientId: genId(), name: "", colorId: null };
  saveIdentity(fresh);
  return fresh;
}

export function saveIdentity(id: SquadIdentity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(id));
  } catch {
    // ignore quota / unavailable storage
  }
}

/** Has the user finished one-time setup (a non-blank display name)? */
export function hasProfile(id: SquadIdentity): boolean {
  return id.name.trim().length > 0;
}
