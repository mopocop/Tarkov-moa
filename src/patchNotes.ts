// Patch notes shown in the in-app "Patch notes" modal. Newest entry first.
// To cut a release: prepend a new entry here (keep it short — a few bullets),
// then bump the version in ALL THREE of package.json, src-tauri/tauri.conf.json
// and src-tauri/Cargo.toml, and rebuild. Each has drifted at least once: the
// installer and the in-app version both come from tauri.conf.json, so a stale
// Cargo.toml is invisible to users and shows up only as a build log compiling a
// version you do not recognise.

export interface PatchNote {
  version: string;
  date: string; // ISO yyyy-mm-dd
  changes: string[];
  thanks?: string;
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: "0.9.0",
    date: "2026-08-26",
    changes: [
      "Fixed: quests load again. If the app has been showing you an empty screen and a red error bar, this update is the fix.",
      "What went wrong: every quest, map and point of interest came from one place — tarkov.dev's API — and that API stopped answering on 21 July and has not come back. One source, no backup, so when it went down the app went down with it.",
      "Quest data now comes from a copy rebuilt every day and published alongside the app, with another copy built into the install itself. Quests only change when the game patches, so a daily rebuild loses you nothing — and it means the app no longer depends on any single server being awake at the moment you open it. Map intel (extracts, spawns, loot) is still fetched live.",
      "There are now four places to look instead of one, and you only see an error if all four come up empty. When you are on saved data the header tells you how old it is instead of claiming it just synced.",
      "Fixed: Reserve now shows quest markers. It never did — the app had one wrong character in that map's internal ID, so every Reserve objective was filed against a map the app did not recognise. 22 quests were affected.",
      "Fixed: Night Factory, Ground Zero 21+ and the Ground Zero tutorial had no map intel at all. Their extracts, spawns and loot containers now show up like every other map.",
      "Fixed: Ground Zero 21+ quests were hidden from you. The app was gating them on your player level but had no way to ever learn your level, so the gate stayed shut permanently — while your squadmates' markers for the same quests showed up fine.",
      "Squad Mode: everyone in a squad needs 0.9.0. Two of the map IDs changed in this release, and a 0.8.x client and a 0.9.0 client would silently stop seeing each other on those maps. You will now get a clear version-mismatch message instead of a teammate who appears connected but invisible.",
    ],
  },
  {
    version: "0.8.1",
    date: "2026-06-15",
    changes: [
      "New: Squad Mode is now online. Create or join a squad with a code and share your live position, markers, drawings and quests with friends anywhere — no setup, no network fiddling.",
      "Your squad data is relayed over a secure connection; nothing is stored, and your home network is never exposed.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-06-14",
    changes: [
      "New: Tarkov MoA now speaks 6 languages — English, Português (Brasil), Русский, 日本語, 中文 and Español. It picks your in-game language automatically, or you can choose your own under Settings → Language (also on the first-run welcome screen).",
      "Quest, map and point-of-interest names are translated too — they follow your game's language so they read exactly like they do in Tarkov.",
      "Improved: squad mode polish and a smoother, more reliable map experience under the hood.",
    ],
  },
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
