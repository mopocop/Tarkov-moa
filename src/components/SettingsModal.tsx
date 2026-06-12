import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { getVersion } from '@tauri-apps/api/app';
import { checkForUpdate, applyUpdate, type AvailableUpdate } from '../services/updater';
import { Segmented } from '../ui';

interface SettingsModalProps {
  onClose: () => void;
  onChanged?: (resolvedLogsDir: string) => void;
  railSide: 'left' | 'right';
  onRailSideChange: (side: 'left' | 'right') => void;
}

export default function SettingsModal({
  onClose,
  onChanged,
  railSide,
  onRailSideChange,
}: SettingsModalProps): React.JSX.Element {
  const [installRoot, setInstallRoot] = useState<string | null>(null);
  const [resolvedLogsDir, setResolvedLogsDir] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [foundUpdate, setFoundUpdate] = useState<AvailableUpdate | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await invoke<{ install_root: string | null }>('get_eft_config');
        if (!cancelled) setInstallRoot(config.install_root);
      } catch {
        // Running outside Tauri — leave installRoot null
      }
      try {
        const dir = await invoke<string>('get_resolved_logs_dir');
        if (!cancelled) {
          setResolvedLogsDir(dir);
          setResolveError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setResolveError(e instanceof Error ? e.message : String(e));
          setResolvedLogsDir(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then((v) => { if (!cancelled) setAppVersion(v); })
      .catch(() => { /* outside Tauri */ });
    return () => { cancelled = true; };
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    setUpdateMsg(null);
    setFoundUpdate(null);
    const u = await checkForUpdate();
    if (u) {
      setFoundUpdate(u);
      setUpdateMsg(`Update available: v${u.version}`);
    } else {
      setUpdateMsg("You're up to date.");
    }
    setChecking(false);
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    if (!foundUpdate) return;
    setInstalling(true);
    setUpdateMsg(`Downloading v${foundUpdate.version}…`);
    try {
      await applyUpdate(foundUpdate.update, ({ downloaded, total }) => {
        if (total) {
          setUpdateMsg(`Downloading v${foundUpdate.version}… ${Math.round((downloaded / total) * 100)}%`);
        }
      });
      // relaunch() restarts the app; only reached on failure.
    } catch (e) {
      setUpdateMsg(e instanceof Error ? e.message : 'Update failed');
      setInstalling(false);
    }
  }, [foundUpdate]);

  const handleSetRoot = useCallback(
    async (root: string | null, msg: string) => {
      setBusy(true);
      try {
        const resolvedDir = await invoke<string>('set_eft_install_root', { root });
        setInstallRoot(root);
        setResolvedLogsDir(resolvedDir);
        setResolveError(null);
        setStatusMsg(msg);
        onChanged?.(resolvedDir);
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        setResolveError(err);
        setResolvedLogsDir(null);
        setStatusMsg(null);
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const handleChangeFolder = useCallback(async () => {
    const chosen = await openDialog({ directory: true, multiple: false, title: 'Select EFT install folder' });
    if (!chosen || Array.isArray(chosen)) return;
    await handleSetRoot(chosen, 'EFT folder updated. Click Sync past logs to backfill quest history.');
  }, [handleSetRoot]);

  const handleUseAutoDetect = useCallback(async () => {
    await handleSetRoot(null, 'Auto-detect re-enabled.');
  }, [handleSetRoot]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <h3>Control rail side</h3>
          <p className="muted">
            Put the rail on the side nearest your main monitor — left if this screen sits to the
            right of it, right if it sits to the left.
          </p>
          <Segmented
            fullWidth
            value={railSide}
            onChange={(v) => onRailSideChange(v as 'left' | 'right')}
            options={[
              { id: 'left', label: 'Left rail' },
              { id: 'right', label: 'Right rail' },
            ]}
          />

          <h3 style={{ marginTop: 16 }}>EFT install folder</h3>
          {installRoot === null ? (
            <p className="muted">(auto-detect)</p>
          ) : (
            <p><code>{installRoot}</code></p>
          )}
          {resolvedLogsDir ? (
            <p>Logs directory: <code>{resolvedLogsDir}</code> <span style={{ color: '#4ade80' }}>✓</span></p>
          ) : resolveError ? (
            <p className="error">✗ {resolveError}</p>
          ) : null}
          <div className="modal-actions">
            <button onClick={handleChangeFolder} disabled={busy}>Change folder…</button>
            <button onClick={handleUseAutoDetect} disabled={busy}>Use auto-detect</button>
          </div>
          {statusMsg && <p className="muted">{statusMsg}</p>}

          <h3>App updates</h3>
          <p className="muted">Current version: {appVersion ?? '—'}</p>
          <div className="modal-actions">
            <button onClick={handleCheckUpdate} disabled={checking || installing}>
              {checking ? 'Checking…' : 'Check for updates'}
            </button>
            {foundUpdate && (
              <button onClick={handleInstallUpdate} disabled={installing}>
                {installing ? 'Installing…' : 'Install & restart'}
              </button>
            )}
          </div>
          {updateMsg && <p className="muted">{updateMsg}</p>}
        </div>
      </div>
    </div>
  );
}
