import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TarkovDevClient, type ApiLang } from '../api/tarkov-dev';
import type { TarkovTask } from '../api/types';
import { i18n } from '../i18n';
import { deriveQuestState, type DerivedQuestState } from '../quests/derive';
import {
  loadProgress,
  saveProgress,
  toTrackerProgress,
  type LocalProgress,
} from '../state/localProgress';

interface Options {
  /** Called with every freshly derived state, before it is rendered. */
  onDerived: (state: DerivedQuestState) => void;
  /** Surfaces a failed manual refresh (the initial load reports via `error`). */
  onRefreshError: (message: string) => void;
}

// The player's quest progress (persisted, fed by the log watcher) and the
// quest state derived from it against the tarkov.dev task list.
export function useQuestData({ onDerived, onRefreshError }: Options) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<LocalProgress>(() => loadProgress());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questState, setQuestState] = useState<DerivedQuestState | null>(null);
  // Full task list retained so squadmates' pins can be re-derived from the quest
  // IDs they broadcast (every client already has the same list).
  const [tasks, setTasks] = useState<TarkovTask[]>([]);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  // Set when quest data came from an expired cache because tarkov.dev was
  // unreachable; holds the timestamp of that copy. null = data is current.
  const [staleSince, setStaleSince] = useState<number | null>(null);

  const loadQuestData = useCallback(
    async (current: LocalProgress) => {
      setLoading(true);
      setError(null);
      try {
        const devClient = new TarkovDevClient(i18n.language as ApiLang);
        const tasks = await devClient.getTasks();
        const next = deriveQuestState(toTrackerProgress(current), tasks);
        setQuestState(next);
        setTasks(tasks);
        onDerived(next);
        // The client serves an expired cache rather than failing when
        // tarkov.dev is unreachable. Surface that instead of pretending we
        // just synced — the honest "last synced" is when that copy was written.
        const { stale, servedAt } = devClient.staleInfo;
        setStaleSince(stale ? servedAt : null);
        setLastSynced(stale ? servedAt : Date.now());
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.failedToLoadQuestData'));
      } finally {
        setLoading(false);
      }
    },
    [onDerived, t],
  );

  // Initial load. This is the canonical "fetch from an external system on mount"
  // effect — loadQuestData drives loading/error/result state as the request
  // resolves, which is the intended use of an effect rather than a cascade.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQuestData(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist progress whenever it changes.
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  // tarkov.dev serves quest names per language, so a language switch re-fetches.
  useEffect(() => {
    const onLangChange = (): void => {
      void loadQuestData(progress);
    };
    i18n.on('languageChanged', onLangChange);
    return () => {
      i18n.off('languageChanged', onLangChange);
    };
  }, [loadQuestData, progress]);

  // Re-derive quest state when progress changes (e.g. quest-event from log
  // watcher). Like the initial load, this re-fetches from tarkov.dev and lets
  // loadQuestData drive the resulting state — an external-system sync, not a
  // render cascade.
  useEffect(() => {
    if (!questState) return; // initial load handles first derive
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQuestData(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const devClient = new TarkovDevClient(i18n.language as ApiLang);
      const tasks = await devClient.getTasks();
      const next = deriveQuestState(toTrackerProgress(progress), tasks);
      setQuestState(next);
      setTasks(tasks);
      onDerived(next);
      setLastSynced(Date.now());
    } catch (err) {
      onRefreshError(err instanceof Error ? err.message : t('errors.refreshFailed'));
    } finally {
      setLoading(false);
    }
  };

  return {
    setProgress,
    questState,
    tasks,
    loading,
    error,
    lastSynced,
    staleSince,
    refresh,
  };
}
