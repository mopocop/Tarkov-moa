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
    version: "0.7.0",
    date: "2026-06-01",
    changes: [
      "New: multi-floor maps now cover Factory, Shoreline, Streets of Tarkov, Ground Zero, and The Lab — the map knows their upper floors, basements, tunnels, and garages too.",
      "New: stairs and ramps you can use to change floors are highlighted in gold on every multi-floor map.",
      "Improved: picking a floor now shows just the ground level plus that floor, cleanly — no more see-through layers stacking up and muddying the view.",
      "Improved: markers and quest points on a floor you're not viewing now fade out, so it's clearer what's actually on your level.",
      "Changed: the floor switcher reads top-to-bottom (highest floor down to basements) and drops the repeated “Floor” word for a cleaner list.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-05-31",
    changes: [
      "New: 7 more maps — Factory, Lighthouse, Shoreline, Reserve, Streets of Tarkov, The Lab, and Terminal.",
      "Fixed: Ground Zero no longer shows up multiple times in the map list (the 1-20, 21+, and tutorial versions are now one entry).",
      "New: multi-floor maps! On Interchange, Reserve, and Customs the map now knows about upper floors, tunnels, and bunkers.",
      "New: the map auto-follows your floor — take a screenshot underground and the map highlights that level, dimming the others. Markers on other floors fade so you can tell what's on your level.",
      "New: a floor switcher (top-right) with an “Auto” button — tap a floor to look around manually, tap “Auto” to snap back to following you.",
    ],
  },
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
