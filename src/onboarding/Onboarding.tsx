// First-run onboarding wizard (also the "How to use" guide, reopenable from
// the spine). Five scenes: welcome → rail side → game folder → screenshot key
// → ready. Marks tc_onboarded_v1 on any close so it only auto-opens once.
//
// The rail-side choice is framed by MONITOR ARRANGEMENT (where the map screen
// sits relative to the main monitor) because that's the actual decision —
// controls should hug the edge nearest your main screen.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Crosshair,
  MapTrifold,
  Scroll,
  Binoculars,
  UsersThree,
  PencilSimple,
  CheckCircle,
  XCircle,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import { Modal, Button, Kbd, Spinner } from "../ui";
import type { RailSide } from "../App";
import "./onboarding.css";

export const ONBOARDED_KEY = "tc_onboarded_v1";

interface OnboardingProps {
  onClose: () => void;
  railSide: RailSide;
  onRailSideChange: (side: RailSide) => void;
  onSyncLogs: () => void;
  syncingLogs: boolean;
}

const STEPS = ["welcome", "side", "folder", "position", "ready"] as const;
type Step = (typeof STEPS)[number];

/** Mini monitor-pair diagram. The map screen carries a brass rail stripe. */
function MonitorDiagram({ mapOnRight }: { mapOnRight: boolean }) {
  const main = <div className="ob-mon ob-mon--main">main</div>;
  const map = (
    <div className={`ob-mon ob-mon--map ob-mon--rail-${mapOnRight ? "left" : "right"}`}>
      <span className="ob-mon-rail" />
      map
    </div>
  );
  return (
    <div className="ob-monitors">
      {mapOnRight ? (
        <>
          {main}
          {map}
        </>
      ) : (
        <>
          {map}
          {main}
        </>
      )}
    </div>
  );
}

export default function Onboarding({
  onClose,
  railSide,
  onRailSideChange,
  onSyncLogs,
  syncingLogs,
}: OnboardingProps) {
  const [step, setStep] = useState<Step>("welcome");
  const idx = STEPS.indexOf(step);

  // ---- game folder status (same backend flow as Settings) ----
  const [installRoot, setInstallRoot] = useState<string | null>(null);
  const [logsDir, setLogsDir] = useState<string | null>(null);
  const [folderErr, setFolderErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outsideTauri, setOutsideTauri] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const config = await invoke<{ install_root: string | null }>("get_eft_config");
      setInstallRoot(config.install_root);
    } catch {
      setOutsideTauri(true);
      return;
    }
    try {
      const dir = await invoke<string>("get_resolved_logs_dir");
      setLogsDir(dir);
      setFolderErr(null);
    } catch (e: unknown) {
      setFolderErr(e instanceof Error ? e.message : String(e));
      setLogsDir(null);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const pickFolder = useCallback(async () => {
    const chosen = await openDialog({
      directory: true,
      multiple: false,
      title: "Select your Escape From Tarkov game folder",
    });
    if (!chosen || Array.isArray(chosen)) return;
    setBusy(true);
    try {
      const dir = await invoke<string>("set_eft_install_root", { root: chosen });
      setInstallRoot(chosen);
      setLogsDir(dir);
      setFolderErr(null);
    } catch (e: unknown) {
      setFolderErr(e instanceof Error ? e.message : String(e));
      setLogsDir(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    onClose();
  }, [onClose]);

  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(idx - 1, 0)]);

  const detected = !!logsDir;

  return (
    <Modal size="md" onClose={finish} title={step === "welcome" ? undefined : "Setup"}>
      <div className="ob-root" data-step={step}>
        {step === "welcome" && (
          <div className="ob-scene ob-welcome">
            <div className="ob-mark">
              <Crosshair weight="duotone" />
            </div>
            <h1 className="ob-title">Tarkov MoA</h1>
            <p className="ob-tagline">
              Your live quest map for Escape from Tarkov — objectives, extracts and your
              real-time position on every map, synced straight from the game. No tabbing out,
              no manual ticking.
            </p>
            <p className="ob-disclaimer">
              Unofficial fan tool — not affiliated with Battlestate Games. Quest, map and POI
              data by{" "}
              <a href="https://tarkov.dev" target="_blank" rel="noreferrer">
                tarkov.dev
              </a>
              .
            </p>
          </div>
        )}

        {step === "side" && (
          <div className="ob-scene">
            <h2 className="ob-step-title">Where is this screen?</h2>
            <p className="ob-step-sub">
              Most people run Tarkov MoA on a second monitor. Pick your arrangement and the
              control rail will hug the edge nearest your main screen — applied instantly.
            </p>
            <div className="ob-side-cards">
              <button
                type="button"
                className={`ob-side-card${railSide === "left" ? " selected" : ""}`}
                onClick={() => onRailSideChange("left")}
                aria-pressed={railSide === "left"}
              >
                <MonitorDiagram mapOnRight={true} />
                <span className="ob-side-label">Map screen on the RIGHT</span>
                <span className="ob-side-note">controls on the left edge</span>
              </button>
              <button
                type="button"
                className={`ob-side-card${railSide === "right" ? " selected" : ""}`}
                onClick={() => onRailSideChange("right")}
                aria-pressed={railSide === "right"}
              >
                <MonitorDiagram mapOnRight={false} />
                <span className="ob-side-label">Map screen on the LEFT</span>
                <span className="ob-side-note">controls on the right edge</span>
              </button>
            </div>
            <p className="ob-hint">You can change this any time in Settings.</p>
          </div>
        )}

        {step === "folder" && (
          <div className="ob-scene">
            <h2 className="ob-step-title">Link your game folder</h2>
            <p className="ob-step-sub">
              Tarkov MoA reads EFT's log files to track your quests automatically — accepted,
              completed, failed — and to switch maps when a raid starts.
            </p>
            {outsideTauri ? (
              <div className="ob-status">
                <span className="ob-status-icon warn">
                  <XCircle weight="fill" />
                </span>
                Running in a browser — folder linking works in the desktop app.
              </div>
            ) : detected ? (
              <div className="ob-status">
                <span className="ob-status-icon ok">
                  <CheckCircle weight="fill" />
                </span>
                <div>
                  <strong>Game folder detected.</strong>
                  <div className="ob-path">{installRoot ?? logsDir}</div>
                </div>
              </div>
            ) : (
              <div className="ob-status">
                <span className="ob-status-icon bad">
                  <XCircle weight="fill" />
                </span>
                <div>
                  <strong>Not found.</strong>
                  <div className="ob-path">{folderErr ?? "Auto-detect didn't find EFT."}</div>
                </div>
              </div>
            )}
            {!outsideTauri && (
              <Button onClick={pickFolder} loading={busy}>
                {detected ? "Change folder…" : "Pick game folder…"}
              </Button>
            )}
            <p className="ob-hint">
              Find it via the EFT launcher: <em>Game settings → Browse local files</em>. Pick
              the main folder (the one with the game's <code>.exe</code>).
            </p>
          </div>
        )}

        {step === "position" && (
          <div className="ob-scene">
            <h2 className="ob-step-title">Live position on the map</h2>
            <p className="ob-step-sub">
              EFT hides your coordinates in screenshot filenames. Bind <strong>Screenshot</strong>{" "}
              to a comfortable key in the game's settings — we recommend <Kbd>M</Kbd> — and tap
              it in raid whenever you want your arrow to move.
            </p>
            <div className="ob-pos-demo">
              <span className="ob-pos-arrow" />
              <span className="ob-pos-ring" />
            </div>
            <p className="ob-hint">
              Each press saves a screenshot; Tarkov MoA reads the position instantly and deletes
              the file. Nothing piles up in your Documents.
            </p>
          </div>
        )}

        {step === "ready" && (
          <div className="ob-scene">
            <h2 className="ob-step-title">You're set. The rail runs everything:</h2>
            <ul className="ob-tour">
              <li>
                <MapTrifold weight="bold" /> <strong>Maps</strong> — switch maps; auto-follows
                your raids
              </li>
              <li>
                <Scroll weight="bold" /> <strong>Quests</strong> — what you can do on this map,
                live
              </li>
              <li>
                <Binoculars weight="bold" /> <strong>Intel</strong> — extracts, spawns, loot
                filters
              </li>
              <li>
                <UsersThree weight="bold" /> <strong>Squad</strong> — share live positions &
                markers with friends
              </li>
              <li>
                <PencilSimple weight="bold" /> <strong>Draw</strong> — sketch routes; your squad
                sees them live
              </li>
            </ul>
            <div className="ob-sync-row">
              <Button
                variant="secondary"
                icon={syncingLogs ? <Spinner size="sm" /> : <ClockCounterClockwise weight="bold" />}
                disabled={syncingLogs || outsideTauri}
                onClick={onSyncLogs}
              >
                {syncingLogs ? "Syncing…" : "Sync past logs now"}
              </Button>
              <span className="ob-hint">
                First time here? This replays your old EFT logs so your quest progress is
                accurate immediately.
              </span>
            </div>
          </div>
        )}

        <div className="ob-footer">
          <div className="ob-dots" role="tablist" aria-label="Setup progress">
            {STEPS.map((s, i) => (
              <button
                key={s}
                className={`ob-dot${i === idx ? " active" : ""}`}
                aria-label={`Step ${i + 1}`}
                onClick={() => setStep(s)}
              />
            ))}
          </div>
          <div className="ob-nav">
            {idx > 0 && (
              <Button variant="tertiary" onClick={back}>
                Back
              </Button>
            )}
            {idx === 0 && (
              <Button variant="tertiary" onClick={finish}>
                Skip
              </Button>
            )}
            {idx < STEPS.length - 1 ? (
              <Button variant="primary" onClick={next}>
                {step === "welcome" ? "Get started" : "Next"}
              </Button>
            ) : (
              <Button variant="primary" onClick={finish}>
                Enter Tarkov MoA
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
