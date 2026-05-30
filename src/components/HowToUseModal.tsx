import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

interface HowToUseModalProps {
  onClose: () => void;
}

/**
 * First-run / always-on-launch guide. Three steps:
 *   1. Link the EFT game folder (powers raid + map detection via Logs).
 *   2. Bind the in-game screenshot key (powers real-time position via Screenshots).
 *   3. Attribution / disclaimer.
 *
 * Step 1 reuses the same `set_eft_install_root` flow as SettingsModal: the user
 * picks the MAIN game folder (the one "Browse Local Files" opens, e.g.
 * S:\Games\Escape From Tarkov) — the backend appends \Logs itself and rejects a
 * wrong pick. The screenshots dir is a separate, auto-detected path in Documents,
 * so step 2 is purely instructional (we can't set an in-game keybind for them).
 */
export default function HowToUseModal({ onClose }: HowToUseModalProps): React.JSX.Element {
  const [installRoot, setInstallRoot] = useState<string | null>(null);
  const [resolvedLogsDir, setResolvedLogsDir] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const config = await invoke<{ install_root: string | null }>('get_eft_config');
      setInstallRoot(config.install_root);
    } catch {
      // Running outside Tauri — leave installRoot null.
    }
    try {
      const dir = await invoke<string>('get_resolved_logs_dir');
      setResolvedLogsDir(dir);
      setResolveError(null);
    } catch (e: unknown) {
      setResolveError(e instanceof Error ? e.message : String(e));
      setResolvedLogsDir(null);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleChangeFolder = useCallback(async () => {
    const chosen = await openDialog({
      directory: true,
      multiple: false,
      title: 'Select your Escape From Tarkov game folder',
    });
    if (!chosen || Array.isArray(chosen)) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const resolvedDir = await invoke<string>('set_eft_install_root', { root: chosen });
      setInstallRoot(chosen);
      setResolvedLogsDir(resolvedDir);
      setResolveError(null);
      setStatusMsg('Game folder linked. Use "Sync past logs" to backfill quest history.');
    } catch (e: unknown) {
      setResolveError(e instanceof Error ? e.message : String(e));
      setResolvedLogsDir(null);
      setStatusMsg(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const detected = !!resolvedLogsDir;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card howto-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>How to use</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {/* ---- Step 1: game folder ---- */}
          <section className="howto-step">
            <div className="howto-step-head">
              <span className="howto-num">1</span>
              <h3>Link your game folder</h3>
            </div>

            <div className={`howto-status ${detected ? 'ok' : 'bad'}`}>
              {detected ? (
                <>
                  <span className="howto-badge ok">✓ Detected</span>
                  <code>{installRoot ?? resolvedLogsDir}</code>
                </>
              ) : (
                <>
                  <span className="howto-badge bad">✗ Not found</span>
                  <span className="howto-status-msg">
                    {resolveError ?? 'Auto-detect did not find your game folder.'}
                  </span>
                </>
              )}
            </div>

            <div className="howto-actions">
              <button className="btn-secondary" onClick={handleChangeFolder} disabled={busy}>
                {busy ? 'Linking…' : 'Change folder…'}
              </button>
            </div>
            {statusMsg && <p className="howto-note ok">{statusMsg}</p>}

            <div className="howto-info">
              <strong>How to find it:</strong> open the EFT launcher →{' '}
              <em>Game Settings</em> → <em>Browse local files</em>. Copy the folder path
              shown there (e.g. <code>S:\Games\Escape From Tarkov</code>) and pick that
              same folder here. Choose the <strong>main game folder</strong> — the one with
              the game's <code>.exe</code>, not a subfolder.
            </div>
          </section>

          {/* ---- Step 2: screenshot keybind ---- */}
          <section className="howto-step">
            <div className="howto-step-head">
              <span className="howto-num">2</span>
              <h3>Bind your screenshot button</h3>
            </div>
            <p>
              Inside the game, go to <em>Settings</em> and set the{' '}
              <strong>Screenshot</strong> action to a comfortable key (recommendation:{' '}
              <kbd>M</kbd>). This is the key that will update your map location in real time.
            </p>
            <p className="howto-info">
              Each time you press it, the game saves a screenshot to{' '}
              <code>Documents\Escape from Tarkov\Screenshots</code> — Tarkov MoA reads
              your position from it instantly and then deletes the file. (This folder is found
              automatically; it's separate from the game folder above.)
            </p>
          </section>

          {/* ---- Step 3: attribution / disclaimer ---- */}
          <section className="howto-step">
            <div className="howto-step-head">
              <span className="howto-num">3</span>
              <h3>Escape From Tarkov</h3>
            </div>
            <p className="howto-info">
              Tarkov MoA is an unofficial fan-made tool and is not affiliated with,
              endorsed by, or sponsored by Battlestate Games. Quest, map, and POI data is
              sourced from the community <a href="https://tarkov.dev" target="_blank" rel="noreferrer">tarkov.dev</a> API.
              Escape from Tarkov is a trademark of Battlestate Games.
            </p>
          </section>
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
