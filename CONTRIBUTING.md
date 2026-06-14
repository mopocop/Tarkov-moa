# Contributing to Tarkov MoA

Thanks for taking the time to help — bug reports, translation fixes, and pull
requests are all welcome. This guide gets you from a fresh clone to a running
app and a mergeable change.

## Quick start

You'll need:

- **Node 20+**
- **Rust** (stable) and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your OS
- A copy of Escape from Tarkov if you want to exercise the live log/screenshot features (the UI itself runs without it)

```bash
git clone https://github.com/mopocop/Tarkov-moa.git
cd Tarkov-moa
npm install
npm run dev          # runs the app (Vite + Tauri) with hot reload
```

Useful scripts:

| Command | What it does |
|---------|--------------|
| `npm run dev` | Run the desktop app in dev mode |
| `npm run build` | Type-check (`tsc -b`) and build the front-end |
| `npm test` | Client unit tests (vitest) — add `-- --run` for a single pass |
| `npm run lint` | ESLint |

## Squad mode (the relay)

Squad mode talks to a small WebSocket relay. For local development:

```bash
cd server
npm install
npm start            # relay on ws://localhost:8787
```

To test squad features without a second machine, run the bundled fake teammate.
It joins a squad, circles the map, and shares markers, drawings and quests:

```bash
# args: <wsUrl> <code|-> <name> <colorId> <mapId> <intervalMs>
# "-" for code creates a NEW squad and prints its join code
npm run bot -- ws://localhost:8787 - Pestily green 5704e3c2d2720bac5b8b4567 60000
```

## Project layout

| Path | What's there |
|------|--------------|
| `src/` | React UI — map, control rail, onboarding, squad, settings |
| `src/i18n/` | i18next setup + locale files in `locales/*.json` |
| `src/api/` | tarkov.dev GraphQL client (quests, maps, POIs) |
| `src-tauri/` | Rust backend — log parsing, game-folder detection, auto-updater |
| `server/` | Node WebSocket relay for squad mode |
| `shared/` | Types and the squad protocol shared by app + relay |

## Translations

UI strings live in `src/i18n/locales/`. `en.json` is the source of truth; every
other locale (`pt`, `ru`, `ja`, `zh`, `es`) must contain the same keys. A test
fails the build if a locale is missing keys. To improve a translation, edit the
matching `*.json` file — don't add keys that aren't in `en.json`.

Quest, map and POI names are **not** translated here — they come localized
straight from the tarkov.dev API, so they always match the player's own game.
Proper nouns and the tokens PMC / SCAV / Transit stay in English in every locale.

## Submitting changes

1. **Branch** off `main` with a short descriptive name: `fix/...`, `feat/...`, `i18n/...`, `docs/...`.
2. Keep the change focused — one logical thing per pull request.
3. Before pushing, make sure the type-check, tests, and lint all pass:
   ```bash
   npm run build && npm test -- --run && npm run lint
   ```
   Lint is a **required** CI check — a pull request with lint errors will not
   pass. `npm run lint` must report no errors (a few pre-existing
   `react-hooks/exhaustive-deps` warnings remain and are tolerated, but don't add
   new ones).
4. Open a pull request. CI re-runs the checks above automatically; the PR template will prompt you for a short description and testing notes.

### How pull requests get reviewed

The maintainer reviews contributions with the help of Claude Code (the `gh` CLI
is wired up for this). In practice that means PRs get a thorough first-pass
review quickly — please don't be surprised by detailed, friendly feedback. Small,
well-scoped PRs with a clear description are the fastest to merge.

## Reporting bugs

Open an issue using the **Bug report** template. The single most useful thing you
can include is what map/quest you were on and, if relevant, what the app's logs
showed. For anything involving the game folder or screenshots, mention your setup.

---

By contributing, you agree that your contributions are licensed under the
project's [MIT license](LICENSE).
