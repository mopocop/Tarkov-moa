// Patch notes shown in the in-app "Patch notes" modal. Newest entry first.
// To cut a release: prepend a new entry here (keep it short — a few bullets),
// bump the version in src-tauri/tauri.conf.json, and rebuild.

export interface PatchNote {
  version: string;
  date: string; // ISO yyyy-mm-dd
  changes: string[];
  thanks?: string;
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: "0.5.1",
    date: "2026-05-30",
    changes: [
      "Fixed: your player marker now shows your real in-game position — it was being mirrored to the opposite side of the map.",
      "Fixed: the player arrow now points the correct way.",
      "Fixed: removed a render loop that made the app stutter and burn CPU.",
      "Changed: the map now defaults to showing only PMC extractions, active quests, and your custom markers. Everything else is off by default (toggle anything back on under “Others”).",
      "Changed: hidden the placeholder level / faction display.",
      "Renamed the app to Tarkov MoA (Map of Action).",
    ],
    thanks: "Thanks to Gui for flagging the player-position bug! 🎯",
  },
];
