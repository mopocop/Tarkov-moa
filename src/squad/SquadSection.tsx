// Squad Mode as a rail section (no modal). Two modes:
//   - Not in a squad: callsign + color, then Create or Join with a code.
//   - In a squad: shareable code card, connection status, shared-objective
//     callout (≥2 members on the same quest), roster, Leave.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check, SignOut, Handshake, X } from "@phosphor-icons/react";
import { useSquad } from "./useSquad";
import { SQUAD_COLORS } from "../../shared/squadProtocol";
import SquadCard from "./SquadCard";
import { Button, Field, Input, IconButton, SectionLabel } from "../ui";


export default function SquadSection({
  sharedQuestNames,
}: {
  /** Names of quests ≥2 squad members (you included) have active. */
  sharedQuestNames: string[];
}) {
  const { t } = useTranslation();
  const squad = useSquad();

  const STATUS_LABEL: Record<string, string> = {
    idle: "",
    connecting: t('squad.connecting'),
    connected: t('squad.connected'),
    reconnecting: t('squad.reconnecting'),
    error: t('squad.connectionProblem'),
  };
  const [name, setName] = useState(squad.identity.name);
  const [colorId, setColorId] = useState<string | null>(squad.identity.colorId);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  // Which action is in flight — so ONLY that button spins (not both).
  const [pending, setPending] = useState<"create" | "join" | null>(null);

  const nameOk = name.trim().length > 0;
  const busy = squad.status === "connecting" || squad.status === "reconnecting";

  // The attempt settled (connected, gave up, or was cancelled) — drop the
  // spinner. This syncs local UI state to the squad transport's status, an
  // external system, so the reset is the effect's purpose rather than a cascade.
  useEffect(() => {
    if (squad.status === "connected" || squad.status === "error" || squad.status === "idle") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending(null);
    }
  }, [squad.status]);

  const handleCreate = () => {
    if (nameOk) {
      setPending("create");
      squad.createSquad(name.trim(), colorId);
    }
  };
  const handleJoin = () => {
    if (nameOk && joinCode.trim()) {
      setPending("join");
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
        {/* Identity — your name + color, remembered between sessions. Its own
            section, divided from the join/create actions below. */}
        <div className="squad-identity">
          <Field label={t('squad.name')}>
            <Input
              value={name}
              maxLength={24}
              placeholder={t('squad.yourNamePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label={t('squad.yourColor')}>
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
                  onClick={() => {
                    setColorId(c.id);
                    // Persist now so your map ink uses this color live — even
                    // before you create or join a squad.
                    squad.saveProfile(name.trim() || squad.identity.name, c.id);
                  }}
                />
              ))}
            </div>
          </Field>
        </div>

        <div className="squad-divider" />

        <div className="squad-actions">
          <Button
            variant="secondary"
            fullWidth
            disabled={!nameOk || busy}
            loading={pending === "create" && busy}
            onClick={handleCreate}
          >
            {t('squad.createSquad')}
          </Button>

          <SectionLabel>{t('squad.orJoinWithCode')}</SectionLabel>
          <div className="squad-join-row">
            <Input
              mono
              value={joinCode}
              maxLength={8}
              placeholder={t('squad.codePlaceholder')}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
            />
            <Button
              disabled={!nameOk || !joinCode.trim() || busy}
              loading={pending === "join" && busy}
              onClick={handleJoin}
            >
              {t('squad.join')}
            </Button>
          </div>

          {busy && (
            <div className="squad-connecting">
              <span className="squad-status">{STATUS_LABEL[squad.status]}</span>
              <Button
                variant="ghost"
                size="sm"
                icon={<X weight="bold" />}
                onClick={squad.cancelConnect}
              >
                {t('common.cancel')}
              </Button>
            </div>
          )}
        </div>

        {/* Connection error sits at the BOTTOM, beneath the create/join controls
            — it's feedback on the action you just took, not a page header. */}
        {squad.error && <div className="squad-error">{squad.error}</div>}
      </div>
    );
  }

  return (
    <div className="squad-section-root">
      {squad.error && <div className="squad-error">{squad.error}</div>}

      <div className="squad-code-card">
        <div className="squad-code-label">{t('squad.squadCode')}</div>
        <div className="squad-code-row">
          <code className="squad-code">{squad.code}</code>
          <IconButton
            icon={copied ? <Check weight="bold" /> : <Copy weight="bold" />}
            label={copied ? t('squad.copied') : t('squad.copySquadCode')}
            size="lg"
            onClick={copyCode}
          />
        </div>
        <div className={`squad-conn squad-conn-${squad.status}`}>
          <span className="squad-conn-dot" />
          {STATUS_LABEL[squad.status] || t('squad.connected')}
        </div>
      </div>

      {sharedQuestNames.length > 0 && (
        <div className="squad-shared-callout">
          <div className="squad-shared-head">
            <Handshake weight="fill" />
            {t('squad.sharedObjective', { count: sharedQuestNames.length })}
          </div>
          <ul className="squad-shared-list">
            {sharedQuestNames.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="squad-shared-hint">
            {t('squad.sharedHint')}
          </p>
        </div>
      )}

      <SectionLabel count={squad.members.length}>{t('squad.roster')}</SectionLabel>
      <SquadCard />

      <div className="squad-footer-row">
        <Button
          variant="danger"
          size="sm"
          icon={<SignOut weight="bold" />}
          onClick={squad.leaveSquad}
        >
          {t('squad.leaveSquad')}
        </Button>
      </div>
    </div>
  );
}
