// The icon spine of the Operator Rail — every control in the app hangs off
// this single 48px strip on the user's chosen screen side. Sections toggle the
// adjacent panel; tool + utility buttons act directly. See shell.css.

import type { ReactNode } from 'react';
import {
  Crosshair,
  Scroll,
  Binoculars,
  UsersThree,
  ArrowCircleUp,
  ClockCounterClockwise,
  ChatTeardropText,
  Question,
  GearSix,
} from '@phosphor-icons/react';
import { Tooltip } from '../ui';

// The map is NOT a section: it's the top-level selection, pinned above every
// section's panel body (see .rail-panel__map in App.tsx).
export type RailSection = 'quests' | 'intel' | 'squad';

export interface SpineProps {
  side: 'left' | 'right';
  activeSection: RailSection | null;
  onToggleSection: (s: RailSection) => void;
  squadCount?: number;
  /** Quest count for the selected map (badge on the Quests section). */
  questCount?: number;
  // Utilities (draw tools live in the on-map MapToolsDock now)
  updateVersion?: string | null;
  updating?: boolean;
  onUpdate?: () => void;
  onSyncLogs: () => void;
  syncingLogs: boolean;
  onFeedback: () => void;
  onHowTo: () => void;
  onSettings: () => void;
}

function SpineButton({
  label,
  hint,
  side,
  active,
  badge,
  className,
  children,
  ...rest
}: {
  label: string;
  hint?: string;
  side: 'left' | 'right';
  active?: boolean;
  badge?: number;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip content={label} hint={hint} side={side === 'left' ? 'right' : 'left'}>
      <button
        className={['spine__btn', active && 'spine__btn--active', className]
          .filter(Boolean)
          .join(' ')}
        aria-label={label}
        aria-pressed={active}
        {...rest}
      >
        {children}
        {badge !== undefined && badge > 0 && <span className="spine__badge">{badge}</span>}
      </button>
    </Tooltip>
  );
}

export default function Spine({
  side,
  activeSection,
  onToggleSection,
  squadCount,
  questCount,
  updateVersion,
  updating,
  onUpdate,
  onSyncLogs,
  syncingLogs,
  onFeedback,
  onHowTo,
  onSettings,
}: SpineProps) {
  const section = (id: RailSection, label: string, icon: ReactNode, badge?: number) => (
    <SpineButton
      label={label}
      side={side}
      active={activeSection === id}
      badge={badge}
      onClick={() => onToggleSection(id)}
    >
      {icon}
    </SpineButton>
  );

  return (
    <nav className="spine" aria-label="Main controls">
      <div className="spine__mark" title="Tarkov MoA">
        <Crosshair weight="duotone" />
      </div>

      {section(
        'quests',
        'Quests on this map',
        <Scroll weight={activeSection === 'quests' ? 'fill' : 'regular'} />,
        questCount,
      )}
      {section(
        'intel',
        'Map intel — extracts, spawns, loot',
        <Binoculars weight={activeSection === 'intel' ? 'fill' : 'regular'} />,
      )}
      {section(
        'squad',
        'Squad Mode',
        <UsersThree weight={activeSection === 'squad' ? 'fill' : 'regular'} />,
        squadCount,
      )}

      <div className="spine__spacer" />

      {updateVersion && (
        <SpineButton
          label={updating ? 'Updating…' : `Update to v${updateVersion}`}
          side={side}
          className="spine__btn--update"
          disabled={updating}
          onClick={onUpdate}
        >
          <ArrowCircleUp weight="fill" />
        </SpineButton>
      )}
      <SpineButton
        label={syncingLogs ? 'Syncing past logs…' : 'Sync past EFT logs (first launch)'}
        side={side}
        disabled={syncingLogs}
        onClick={onSyncLogs}
      >
        <ClockCounterClockwise weight="regular" />
      </SpineButton>
      <SpineButton label="Send feedback" side={side} onClick={onFeedback}>
        <ChatTeardropText weight="regular" />
      </SpineButton>
      <SpineButton label="How to use" side={side} onClick={onHowTo}>
        <Question weight="regular" />
      </SpineButton>
      <SpineButton label="Settings" side={side} onClick={onSettings}>
        <GearSix weight="regular" />
      </SpineButton>
    </nav>
  );
}
