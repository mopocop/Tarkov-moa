import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface AvailableUpdate {
  version: string;
  notes: string | null;
  update: Update;
}

export interface DownloadProgress {
  downloaded: number;
  total: number | null;
}

/**
 * Ask the configured updater endpoint whether a newer signed build exists.
 * Returns null when up to date, when running outside Tauri (plain `vite dev`),
 * or on any network/endpoint error — never throws, so callers can fire-and-forget.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  try {
    const update = await check();
    if (!update) return null;
    return { version: update.version, notes: update.body ?? null, update };
  } catch (e) {
    // Outside Tauri, offline, or endpoint not reachable — surface nothing.
    console.warn('[updater] check failed (running outside Tauri or offline?):', e);
    return null;
  }
}

/**
 * Download + install the update (Tauri verifies its signature against the
 * baked-in public key), then relaunch into the new version. The relaunch
 * terminates the current process, so code after this call only runs on failure.
 */
export async function applyUpdate(
  update: Update,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? null;
        onProgress?.({ downloaded, total });
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
        break;
      case 'Finished':
        onProgress?.({ downloaded, total });
        break;
    }
  });

  await relaunch();
}
