import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hexForColorId, type DrawPayload } from '../../shared/squadProtocol';
import type { DrawTool } from '../map/DrawLayer';
import { newDrawId } from '../map/drawId';
import type { SquadApi } from '../squad/SquadContext';
import { TOKEN_HEX } from '../ui/tokens';
import { useLatest } from '../hooks/useLatest';

interface Options {
  selectedMapId: string | null;
  squad: SquadApi;
  notify: (message: string) => void;
}

// Freehand drawing on the map. Strokes live in memory for the session and are
// shared with the squad while you are in one.
export function useDrawing({ selectedMapId, squad, notify }: Options) {
  const { t } = useTranslation();
  const [drawTool, setDrawTool] = useState<DrawTool>(null);
  const [ownDraws, setOwnDraws] = useState<DrawPayload[]>([]);
  // Local ink: your squad color if seated, else your saved pick, else brass.
  // Picking a color in the Squad tab persists it immediately, so this updates
  // your map ink live (no more grey-forever).
  const myColorId = squad.selfColorId ?? squad.identity.colorId;
  const myDrawHex = myColorId ? hexForColorId(myColorId) : TOKEN_HEX.accent;
  // The draw callbacks stay stable (DrawLayer binds its map handlers once) and
  // read fresh map, color and squad through these.
  const squadRef = useLatest(squad);
  const selectedMapIdRef = useLatest(selectedMapId);
  const myDrawHexRef = useLatest(myDrawHex);

  const commitStroke = useCallback((points: { x: number; z: number }[]) => {
    const mid = selectedMapIdRef.current;
    if (!mid || points.length < 2) return;
    const payload: DrawPayload = {
      id: newDrawId(),
      mapId: mid,
      color: myDrawHexRef.current,
      points,
    };
    setOwnDraws((cur) => [...cur, payload]);
    if (squadRef.current.inSquad) squadRef.current.addDraw(payload);
  }, [selectedMapIdRef, myDrawHexRef, squadRef]);

  const clearOwnDraws = useCallback(() => {
    const mid = selectedMapIdRef.current;
    setOwnDraws((cur) => {
      if (squadRef.current.inSquad) {
        for (const d of cur) if (d.mapId === mid) squadRef.current.removeDraw(d.id);
      }
      return cur.filter((d) => d.mapId !== mid);
    });
    notify(t('common.drawingsCleared'));
  }, [selectedMapIdRef, squadRef, notify, t]);

  const canClear = ownDraws.some((d) => d.mapId === selectedMapId);

  return { drawTool, setDrawTool, ownDraws, myDrawHex, commitStroke, clearOwnDraws, canClear };
}
