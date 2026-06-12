// Squad Mode as a rail section (no modal). Two modes:
//   - Not in a squad: callsign + color, then Create or Join with a code.
//   - In a squad: shareable code card, connection status, shared-objective
//     callout (≥2 members on the same quest), roster, Leave.

import { useState } from "react";
import { Copy, Check, SignOut, Handshake } from "@phosphor-icons/react";
import { useSquad } from "./SquadContext";
import { SQUAD_COLORS } from "../../shared/squadProtocol";
import SquadCard from "./SquadCard";
import { Button, Field, Input, IconButton, SectionLabel } from "../ui";

const STATUS_LABEL: Record<string, string> = {
  idle: "",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  error: "Connection problem",
};

export default function SquadSection({
  sharedQuestNames,
}: {
  /** Names of quests ≥2 squad members (you included) have active. */
  sharedQuestNames: string[];
}) {
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

  if (!squad.inSquad) {
    return (
      <div className="squad-section-root">
        {squad.error && <div className="squad-error">{squad.error}</div>}

        <Field label="Callsign" hint="Set once — remembered next time.">
          <Input
            value={name}
            maxLength={24}
            placeholder="Your name in the squad"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Your color" hint="If it's taken in a squad you'll get the next free one.">
          <div className="squad-swatches">
            {SQUAD_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`squad-swatch${colorId === c.id ? " selected" : ""}`}
                style={{ background: c.hex }}
                title={c.name}
                aria-label={c.name}
                aria-pressed={colorId === c.id}
                onClick={() => setColorId(c.id)}
              />
            ))}
          </div>
        </Field>

        <Button variant="primary" fullWidth disabled={!nameOk} loading={busy} onClick={handleCreate}>
          Create a squad
        </Button>
        <p className="squad-hint">You'll get a code to share with teammates.</p>

        <SectionLabel>or join with a code</SectionLabel>
        <div className="squad-join-row">
          <Input
            mono
            value={joinCode}
            maxLength={8}
            placeholder="ABCD1234"
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJoin();
            }}
          />
          <Button disabled={!nameOk || !joinCode.trim() || busy} onClick={handleJoin}>
            Join
          </Button>
        </div>

        {busy && <p className="squad-status">{STATUS_LABEL[squad.status]}</p>}
      </div>
    );
  }

  return (
    <div className="squad-section-root">
      {squad.error && <div className="squad-error">{squad.error}</div>}

      <div className="squad-code-card">
        <div className="squad-code-label">Squad code</div>
        <div className="squad-code-row">
          <code className="squad-code">{squad.code}</code>
          <IconButton
            icon={copied ? <Check weight="bold" /> : <Copy weight="bold" />}
            label={copied ? "Copied!" : "Copy squad code"}
            onClick={copyCode}
          />
        </div>
        <div className={`squad-conn squad-conn-${squad.status}`}>
          <span className="squad-conn-dot" />
          {STATUS_LABEL[squad.status] || "Connected"}
        </div>
      </div>

      {sharedQuestNames.length > 0 && (
        <div className="squad-shared-callout">
          <div className="squad-shared-head">
            <Handshake weight="fill" />
            Shared objective{sharedQuestNames.length > 1 ? "s" : ""}
          </div>
          <ul className="squad-shared-list">
            {sharedQuestNames.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="squad-shared-hint">
            Two or more of you have these active — their pins pulse on the map. Push together.
          </p>
        </div>
      )}

      <SectionLabel count={squad.members.length}>Roster</SectionLabel>
      <SquadCard />

      <div className="squad-footer-row">
        <Button
          variant="danger"
          size="sm"
          icon={<SignOut weight="bold" />}
          onClick={squad.leaveSquad}
        >
          Leave squad
        </Button>
      </div>
    </div>
  );
}
