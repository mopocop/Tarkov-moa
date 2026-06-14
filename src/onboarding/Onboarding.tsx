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
  Info,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Modal, Button, Kbd, Spinner, Toggle, Slider, Select } from "../ui";
import { SUPPORTED_LANGS, LANG_LABELS, changeLang, type Lang } from "../i18n";
import type { RailSide } from "../App";
import "./onboarding.css";

export const ONBOARDED_KEY = "tc_onboarded_v1";

interface OnboardingProps {
  onClose: () => void;
  railSide: RailSide;
  onRailSideChange: (side: RailSide) => void;
  onSyncLogs: () => void;
  syncingLogs: boolean;
  followCenter: boolean;
  onFollowCenterChange: (on: boolean) => void;
  followZoom: number;
  onFollowZoomChange: (zoom: number) => void;
}

const STEPS = ["welcome", "side", "folder", "position", "ready"] as const;
type Step = (typeof STEPS)[number];

/** Mini monitor-pair diagram. The map screen carries a brass rail stripe. */
function MonitorDiagram({ mapOnRight, t }: { mapOnRight: boolean; t: (key: string) => string }) {
  const main = <div className="ob-mon ob-mon--main">{t('onboarding.side.monitorMain')}</div>;
  const map = (
    <div className={`ob-mon ob-mon--map ob-mon--rail-${mapOnRight ? "left" : "right"}`}>
      <span className="ob-mon-rail" />
      {t('onboarding.side.monitorMap')}
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
  followCenter,
  onFollowCenterChange,
  followZoom,
  onFollowZoomChange,
}: OnboardingProps) {
  const { t, i18n } = useTranslation();
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

  // Fetch the EFT install/log status from the Tauri backend on mount; the result
  // drives install/error state as it resolves (external-system sync).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatus();
  }, [refreshStatus]);

  const pickFolder = useCallback(async () => {
    const chosen = await openDialog({
      directory: true,
      multiple: false,
      title: t('onboarding.folder.dialogTitle', { gameName: 'Escape From Tarkov' }),
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

  // Re-run auto-detect (clears any manual override — same backend as Settings'
  // "Use auto-detect"). Lets a user who picked the wrong folder fall back.
  const useAutoDetect = useCallback(async () => {
    setBusy(true);
    try {
      const dir = await invoke<string>("set_eft_install_root", { root: null });
      setInstallRoot(null);
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
    <Modal size="md" onClose={finish} title={step === "welcome" ? undefined : t('onboarding.setupTitle')}>
      <div className="ob-root" data-step={step}>
        {step === "welcome" && (
          <div className="ob-scene ob-welcome">
            <div className="ob-mark">
              <Crosshair weight="duotone" />
            </div>
            <h1 className="ob-title">Tarkov MoA</h1>
            <p className="ob-fullname">
              Tarkov <b>M</b>ap <b>o</b>f <b>A</b>ction
            </p>
            <p className="ob-tagline">
              {t('onboarding.welcome.tagline', { gameName: 'Escape from Tarkov' })}
            </p>
            <p className="ob-disclaimer">
              {t('onboarding.welcome.disclaimerPrefix', { developerName: 'Battlestate Games' })}
              <a href="https://tarkov.dev" target="_blank" rel="noreferrer">
                tarkov.dev
              </a>
              {t('onboarding.welcome.disclaimerSuffix')}
            </p>
            <div className="ob-lang">
              <label htmlFor="ob-lang-select">{t('settings.language')}</label>
              <Select
                id="ob-lang-select"
                aria-label={t('settings.language')}
                value={i18n.language}
                onChange={(e) => { void changeLang(e.target.value as Lang); }}
              >
                {SUPPORTED_LANGS.map((lng) => (
                  <option key={lng} value={lng}>{LANG_LABELS[lng]}</option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {step === "side" && (
          <div className="ob-scene">
            <h2 className="ob-step-title">{t('onboarding.side.title')}</h2>
            <p className="ob-step-sub">
              {t('onboarding.side.subtitle', { appName: 'Tarkov MoA' })}
            </p>
            <div className="ob-side-cards">
              <button
                type="button"
                className={`ob-side-card${railSide === "left" ? " selected" : ""}`}
                onClick={() => onRailSideChange("left")}
                aria-pressed={railSide === "left"}
              >
                <MonitorDiagram mapOnRight={true} t={t} />
                <span className="ob-side-label">{t('onboarding.side.mapOnRight')}</span>
                <span className="ob-side-note">{t('onboarding.side.controlsOnLeft')}</span>
              </button>
              <button
                type="button"
                className={`ob-side-card${railSide === "right" ? " selected" : ""}`}
                onClick={() => onRailSideChange("right")}
                aria-pressed={railSide === "right"}
              >
                <MonitorDiagram mapOnRight={false} t={t} />
                <span className="ob-side-label">{t('onboarding.side.mapOnLeft')}</span>
                <span className="ob-side-note">{t('onboarding.side.controlsOnRight')}</span>
              </button>
            </div>
            <p className="ob-hint">{t('onboarding.side.hint')}</p>
          </div>
        )}

        {step === "folder" && (
          <div className="ob-scene">
            <h2 className="ob-step-title">{t('onboarding.folder.title')}</h2>
            <p className="ob-step-sub">
              {t('onboarding.folder.subtitle', { appName: 'Tarkov MoA' })}
            </p>
            <p className="ob-limits">
              <Info weight="fill" />
              <span>
                {t('onboarding.folder.limitsPrefix')}<b>{t('onboarding.folder.limitsBold')}</b>{t('onboarding.folder.limitsSuffix')}
              </span>
            </p>
            {outsideTauri ? (
              <div className="ob-status">
                <span className="ob-status-icon warn">
                  <XCircle weight="fill" />
                </span>
                {t('onboarding.folder.browserWarning')}
              </div>
            ) : detected ? (
              <div className="ob-status">
                <span className="ob-status-icon ok">
                  <CheckCircle weight="fill" />
                </span>
                <div>
                  <strong>{t('onboarding.folder.detected')}</strong>
                  <div className="ob-path">{installRoot ?? logsDir}</div>
                </div>
              </div>
            ) : (
              <div className="ob-status">
                <span className="ob-status-icon bad">
                  <XCircle weight="fill" />
                </span>
                <div>
                  <strong>{t('onboarding.folder.notFound')}</strong>
                  <div className="ob-path">{folderErr ?? t('onboarding.folder.autoDetectFailed')}</div>
                </div>
              </div>
            )}
            {!outsideTauri && (
              <div className="ob-folder-actions">
                <Button onClick={pickFolder} loading={busy}>
                  {detected ? t('onboarding.folder.changeFolder') : t('onboarding.folder.pickGameFolder')}
                </Button>
                <Button variant="tertiary" onClick={useAutoDetect} disabled={busy}>
                  {t('onboarding.folder.autoDetect')}
                </Button>
              </div>
            )}
            <p className="ob-hint">
              {t('onboarding.folder.hintLauncher')} <em>{t('onboarding.folder.hintGameSettingsPath')}</em>. {t('onboarding.folder.hintPickFolder')} <code>.exe</code>).
            </p>
          </div>
        )}

        {step === "position" && (
          <div className="ob-scene">
            <h2 className="ob-step-title">{t('onboarding.position.title')}</h2>
            <p className="ob-step-sub">
              {t('onboarding.position.subtitle1')}<strong>Screenshot</strong>{" "}
              {t('onboarding.position.subtitle2')}<Kbd>M</Kbd>{t('onboarding.position.subtitle3')}
            </p>
            <div className="ob-pos-demo">
              <span className="ob-pos-arrow" />
              <span className="ob-pos-ring" />
            </div>
            <div className="ob-follow">
              <div className="ob-follow-row">
                <div className="ob-follow-text">
                  <strong>{t('onboarding.position.jumpToPosition')}</strong>
                  <span>{t('onboarding.position.jumpToPositionDesc')}</span>
                </div>
                <Toggle
                  checked={followCenter}
                  onChange={onFollowCenterChange}
                  label={t('onboarding.position.jumpToPositionLabel')}
                />
              </div>
              <div className="ob-follow-row">
                <div className="ob-follow-text">
                  <strong>{t('onboarding.position.followZoom')}</strong>
                  <span>{t('onboarding.position.followZoomDesc')}</span>
                </div>
                <div className="ob-follow-slider">
                  <Slider
                    label={t('onboarding.position.followZoomLabel')}
                    min={-1}
                    max={4}
                    step={0.5}
                    value={followZoom}
                    onChange={onFollowZoomChange}
                    disabled={!followCenter}
                    valueText={(followZoom >= 0 ? "+" : "") + followZoom.toFixed(1)}
                  />
                </div>
              </div>
            </div>
            <p className="ob-hint">
              {t('onboarding.position.hint', { appName: 'Tarkov MoA' })}
            </p>
          </div>
        )}

        {step === "ready" && (
          <div className="ob-scene">
            <h2 className="ob-step-title">{t('onboarding.ready.title')}</h2>
            <ul className="ob-tour">
              <li>
                <MapTrifold weight="bold" /> <strong>{t('onboarding.ready.mapPicker')}</strong> — {t('onboarding.ready.mapPickerDesc')}
              </li>
              <li>
                <Scroll weight="bold" /> <strong>{t('onboarding.ready.quests')}</strong> — {t('onboarding.ready.questsDesc')}
              </li>
              <li>
                <Binoculars weight="bold" /> <strong>{t('onboarding.ready.intel')}</strong> — {t('onboarding.ready.intelDesc')}
              </li>
              <li>
                <UsersThree weight="bold" /> <strong>{t('onboarding.ready.squad')}</strong> — {t('onboarding.ready.squadDesc')}
              </li>
              <li>
                <PencilSimple weight="bold" /> <strong>{t('onboarding.ready.draw')}</strong> — {t('onboarding.ready.drawDesc')}
              </li>
            </ul>
            <div className="ob-sync-row">
              <Button
                variant="secondary"
                icon={syncingLogs ? <Spinner size="sm" /> : <ClockCounterClockwise weight="bold" />}
                disabled={syncingLogs || outsideTauri}
                onClick={onSyncLogs}
              >
                {syncingLogs ? t('onboarding.ready.syncing') : t('onboarding.ready.syncNow')}
              </Button>
              <span className="ob-hint">
                {t('onboarding.ready.syncHint')}
              </span>
            </div>
          </div>
        )}

        <div className="ob-footer">
          <div className="ob-dots" role="tablist" aria-label={t('onboarding.progressLabel')}>
            {STEPS.map((s, i) => (
              <button
                key={s}
                className={`ob-dot${i === idx ? " active" : ""}`}
                aria-label={t('onboarding.stepIndicator', { step: i + 1 })}
                onClick={() => setStep(s)}
              />
            ))}
          </div>
          <div className="ob-nav">
            {idx > 0 && (
              <Button variant="tertiary" onClick={back}>
                {t('onboarding.back')}
              </Button>
            )}
            {idx === 0 && (
              <Button variant="tertiary" onClick={finish}>
                {t('onboarding.skip')}
              </Button>
            )}
            {idx < STEPS.length - 1 ? (
              <Button variant="primary" onClick={next}>
                {step === "welcome" ? t('onboarding.getStarted') : t('onboarding.next')}
              </Button>
            ) : (
              <Button variant="primary" onClick={finish}>
                {t('onboarding.enterApp', { appName: 'Tarkov MoA' })}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
