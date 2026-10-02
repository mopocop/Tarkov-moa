import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { checkForUpdate, applyUpdate, type AvailableUpdate } from '../services/updater';

// The running version and the signed self-update. Both no-op outside Tauri.
export function useAppUpdate(notify: (message: string) => void) {
  const { t } = useTranslation();
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updating, setUpdating] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  // Check for an app update once on launch. No-ops outside Tauri / when offline.
  useEffect(() => {
    void checkForUpdate().then((u) => {
      if (u) setAvailableUpdate(u);
    });
  }, []);

  // App version for the footer badge. No-ops outside Tauri.
  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const apply = useCallback(async () => {
    if (!availableUpdate) return;
    setUpdating(true);
    notify(t('settings.downloadingUpdate', { version: availableUpdate.version }));
    try {
      await applyUpdate(availableUpdate.update, ({ downloaded, total }) => {
        if (total) {
          const pct = Math.round((downloaded / total) * 100);
          notify(t('settings.downloadingUpdateProgress', { version: availableUpdate.version, pct }));
        }
      });
      // relaunch() inside applyUpdate restarts the app; code below only runs on failure.
    } catch (err) {
      notify(err instanceof Error ? err.message : t('errors.updateFailed'));
      setUpdating(false);
    }
  }, [availableUpdate, notify, t]);

  return { availableUpdate, updating, appVersion, apply };
}
