// The squad roster card: one row per member with their color, name, and a
// relative "last seen" (from their last shared position). A row flashes briefly
// when a fresh position for that member lands.

import { useEffect, useRef, useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useSquad, type MemberPosition } from "./SquadContext";
import { hexForColorId, type SquadMember } from "../../shared/squadProtocol";
import { useRelativeTime } from "../hooks/useRelativeTime";
import { FRESH_FLASH_MS } from "./config";

function MemberRow({
  member,
  isSelf,
  pos,
  hidden,
  onToggleQuests,
}: {
  member: SquadMember;
  isSelf: boolean;
  pos: MemberPosition | undefined;
  hidden: boolean;
  onToggleQuests: () => void;
}) {
  const lastSeen = useRelativeTime(pos?.ts ?? null);
  const [flash, setFlash] = useState(false);
  const prevTs = useRef<number | undefined>(pos?.ts);

  useEffect(() => {
    if (pos?.ts && pos.ts !== prevTs.current) {
      prevTs.current = pos.ts;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), FRESH_FLASH_MS);
      return () => clearTimeout(t);
    }
  }, [pos?.ts]);

  return (
    <div className={`squad-member${flash ? " flash" : ""}`}>
      <span className="squad-dot" style={{ background: hexForColorId(member.colorId) }} />
      <span className="squad-name">
        {member.name}
        {isSelf && <span className="squad-you"> you</span>}
      </span>
      <span className="squad-seen">
        {isSelf ? "" : pos ? lastSeen : "no position yet"}
      </span>
      <button
        type="button"
        className={`squad-eye${hidden ? " off" : ""}`}
        onClick={onToggleQuests}
        title={hidden ? "Show their markers & quests" : "Hide their markers & quests"}
        aria-label={hidden ? "Show on map" : "Hide on map"}
        aria-pressed={!hidden}
      >
        {hidden ? <EyeSlash weight="bold" /> : <Eye weight="bold" />}
      </button>
    </div>
  );
}

export default function SquadCard() {
  const squad = useSquad();
  // Self first, then alphabetical.
  const members = [...squad.members].sort((a, b) => {
    if (a.id === squad.selfId) return -1;
    if (b.id === squad.selfId) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <section className="squad-section squad-roster">
      <label className="squad-label">Squad · {squad.members.length}</label>
      {members.map((m) => (
        <MemberRow
          key={m.id}
          member={m}
          isSelf={m.id === squad.selfId}
          pos={squad.positions[m.id]}
          hidden={squad.hiddenQuests[m.id] ?? false}
          onToggleQuests={() => squad.toggleQuestVisibility(m.id)}
        />
      ))}
    </section>
  );
}
