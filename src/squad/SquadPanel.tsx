// Squad Mode panel. Two modes:
//   - Not in a squad: set your name + color (remembered), then Create or Join.
//   - In a squad: show the shareable code, the roster (SquadCard), and Leave.

import { useState } from "react";
import { useSquad } from "./SquadContext";
import { SQUAD_COLORS } from "../../shared/squadProtocol";
import SquadCard from "./SquadCard";

const STATUS_LABEL: Record<string, string> = {
  idle: "",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  error: "Connection problem",
};

export default function SquadPanel({ onClose }: { onClose: () => void }) {
  const squad = useSquad();
  const [name, setName] = useState(squad.identity.name);
  const [colorId, setColorId] = useState<string | null>(squad.identity.colorId);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  const nameOk = name.trim().length > 0;
  const busy = squad.status === "connecting" || squad.status === "reconnecting";

  const handleCreate = () => {
    if (nameOk) squad.createSquad(name.trim(), colorId);
  };
  const handleJoin = () => {
    if (nameOk && joinCode.trim()) {
      squad.joinSquad(joinCode.trim().toUpperCase(), name.trim(), colorId);
    }
  };
  const copyCode = async () => {
    if (!squad.code) return;
    try {
      await navigator.clipboard.writeText(squad.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card squad-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <i className="fa-solid fa-user-group" /> Squad Mode
          </h2>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {squad.error && <div className="squad-error">{squad.error}</div>}

          {!squad.inSquad ? (
            <>
              <section className="squad-section">
                <label className="squad-label">Your name</label>
                <input
                  className="squad-input"
                  value={name}
                  maxLength={24}
                  placeholder="Display name"
                  onChange={(e) => setName(e.target.value)}
                />
                <label className="squad-label">Your color</label>
                <div className="squad-swatches">
                  {SQUAD_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`squad-swatch${colorId === c.id ? " selected" : ""}`}
                      style={{ background: c.hex }}
                      title={c.name}
                      aria-label={c.name}
                      onClick={() => setColorId(c.id)}
                    />
                  ))}
                </div>
                <p className="squad-hint">
                  Set once — remembered next time. If your color is taken in a squad,
                  you'll get the next free one.
                </p>
              </section>

              <section className="squad-section">
                <button className="btn-primary squad-block-btn" disabled={!nameOk || busy} onClick={handleCreate}>
                  Create a squad
                </button>
                <p className="squad-hint">You'll get a code to share with teammates.</p>
              </section>

              <section className="squad-section">
                <label className="squad-label">…or join with a code</label>
                <div className="squad-join-row">
                  <input
                    className="squad-input squad-code-input"
                    value={joinCode}
                    maxLength={8}
                    placeholder="ABCD1234"
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleJoin();
                    }}
                  />
                  <button
                    className="btn-secondary"
                    disabled={!nameOk || !joinCode.trim() || busy}
                    onClick={handleJoin}
                  >
                    Join
                  </button>
                </div>
              </section>

              {busy && <p className="squad-status">{STATUS_LABEL[squad.status]}</p>}
            </>
          ) : (
            <>
              <section className="squad-section">
                <label className="squad-label">Squad code</label>
                <div className="squad-code-display">
                  <code className="squad-code">{squad.code}</code>
                  <button className="btn-secondary" onClick={copyCode}>
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="squad-hint">Share this so teammates can join your squad.</p>
              </section>

              <SquadCard />

              <section className="squad-section squad-footer-row">
                <button className="btn-tertiary squad-leave" onClick={squad.leaveSquad}>
                  Leave squad
                </button>
                <span className={`squad-conn squad-conn-${squad.status}`}>
                  {STATUS_LABEL[squad.status]}
                </span>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
