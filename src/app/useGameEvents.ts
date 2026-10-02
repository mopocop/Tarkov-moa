import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  subscribeRaidEnded,
  subscribeQuestEvent,
  subscribeRaidStarted,
  subscribePlayerPosition,
  replayPastLogs,
  type UnlistenFn,
} from '../services/tauriEvents';
import { mapIdFromLogLocation } from '../map/logLocationMap';
import {
  markQuestAccepted,
  markQuestComplete,
  markQuestFailed,
  type LocalProgress,
} from '../state/localProgress';

export type PlayerPos = { x: number; y: number; z: number; rotation: number; ts: number };

interface Options {
  setProgress: Dispatch<SetStateAction<LocalProgress>>;
  setSelectedMapId: Dispatch<SetStateAction<string | null>>;
}

// Live state from the game, via the Rust log/screenshot watchers: quest
// accepted/finished/failed, raid start/end, and the player's position. Returns
// the latest position (null between raids).
export function useGameEvents({ setProgress, setSelectedMapId }: Options) {
  const [playerPos, setPlayerPos] = useState<PlayerPos | null>(null);
  // Map of the raid currently being played, from the raid-started log event.
  // A ref because the position subscription (bound once) needs the live value.
  const liveRaidMapIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unlistens: UnlistenFn[] = [];
    let cancelled = false;

    void (async () => {
      try {
        const u1 = await subscribeQuestEvent((ev) => {
          setProgress((cur) => {
            switch (ev.status) {
              case 'Started':
                return markQuestAccepted(cur, ev.templateId);
              case 'Finished':
                return markQuestComplete(cur, ev.templateId);
              case 'Failed':
                return markQuestFailed(cur, ev.templateId);
              default:
                return cur;
            }
          });
        });
        const u2 = await subscribeRaidEnded((ev) => {
          const target = mapIdFromLogLocation(ev.location);
          if (target) setSelectedMapId(target);
        });
        const u3 = await subscribeRaidStarted((ev) => {
          setPlayerPos(null);
          liveRaidMapIdRef.current = ev.location
            ? mapIdFromLogLocation(ev.location) ?? null
            : null;
        });
        const u4 = await subscribePlayerPosition((ev) => {
          setPlayerPos({ ...ev, ts: Date.now() });
          // Screenshot → make sure we're LOOKING at the raid's map. The
          // follow-cam (FollowCamera) then centers if the user kept that on.
          const liveMap = liveRaidMapIdRef.current;
          if (liveMap) setSelectedMapId((cur) => (cur === liveMap ? cur : liveMap));
        });
        if (cancelled) {
          u1(); u2(); u3(); u4();
        } else {
          unlistens.push(u1, u2, u3, u4);
        }
      } catch (e) {
        // Running outside Tauri (e.g. plain `vite dev`) — listen() throws. Swallow.
        console.warn('[tauriEvents] subscribe failed (running outside Tauri?):', e);
      }
    })();

    return () => {
      cancelled = true;
      for (const u of unlistens) u();
    };
  }, [setProgress, setSelectedMapId]);

  return playerPos;
}

// "Sync past logs": replays every log file on disk through the watcher, for
// a first launch or after the app was closed during a raid.
export function useLogReplay(notify: (message: string) => void) {
  const { t } = useTranslation();
  const [replaying, setReplaying] = useState(false);

  const replay = async () => {
    setReplaying(true);
    try {
      const count = await replayPastLogs();
      notify(t('rail.replayedLogs', { count }));
    } catch (err) {
      notify(err instanceof Error ? err.message : t('errors.replayFailed'));
    } finally {
      setReplaying(false);
    }
  };

  return { replaying, replay };
}
