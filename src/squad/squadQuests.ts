// Re-derive a squadmate's quest pins from just the active quest IDs they
// broadcast. Every client already downloads tarkov.dev's full task list, so we
// only ever send IDs over the wire — the geometry (objective positions) is
// reconstructed locally with the SAME deriveQuestState the local player uses.
//
// playerLevel is pinned high so level-gated maps (Ground Zero 21+) aren't
// hidden: the broadcast IDs already reflect what that teammate has accepted, so
// anything in the list is something they can reach.

import { deriveQuestState, type DerivedQuestState } from "../quests/derive";
import type { TarkovTask } from "../api/types";

export function deriveMemberQuestState(
  activeQuestIds: string[],
  tasks: TarkovTask[],
): DerivedQuestState {
  return deriveQuestState(
    {
      playerLevel: 99,
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
