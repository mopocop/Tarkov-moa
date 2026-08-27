// Re-derive a squadmate's quest pins from just the active quest IDs they
// broadcast. Every client already downloads tarkov.dev's full task list, so we
// only ever send IDs over the wire — the geometry (objective positions) is
// reconstructed locally with the SAME deriveQuestState the local player uses.
//
// playerLevel used to be pinned high here to keep level-gated maps from being
// hidden for squadmates. That gate is gone — nothing reads the field any more —
// but it stays on the persisted progress shape, so a value still has to be
// passed. Zero, because it means nothing now.

import { deriveQuestState, type DerivedQuestState } from "../quests/derive";
import type { TarkovTask } from "../api/types";

export function deriveMemberQuestState(
  activeQuestIds: string[],
  tasks: TarkovTask[],
): DerivedQuestState {
  return deriveQuestState(
    {
      playerLevel: 0,
      tasksProgress: activeQuestIds.map((id) => ({
        id,
        complete: false,
        failed: false,
        invalid: false,
        accepted: true,
      })),
    },
    tasks,
  );
}
