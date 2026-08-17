<p align="center">
  <img src=".github/banner.svg" alt="Tarkov MoA — Map of Action" width="100%">
</p>

<p align="center">
  <a href="https://github.com/mopocop/Tarkov-moa/releases/latest"><img src="https://img.shields.io/github/v/release/mopocop/Tarkov-moa?color=c9a86a&label=version" alt="Latest version"></a>
  <a href="https://github.com/mopocop/Tarkov-moa/releases"><img src="https://img.shields.io/github/downloads/mopocop/Tarkov-moa/total?color=c9a86a&label=downloads" alt="Downloads"></a>
  <img src="https://img.shields.io/badge/Windows%2010%20%2F%2011-1a1c17?logo=windows" alt="Windows 10/11">
  <img src="https://img.shields.io/badge/license-MIT-c9a86a" alt="MIT license">
</p>

<h3 align="center">A live quest map for Escape from Tarkov.<br>Your objectives, extracts and real-time position — synced straight from the game.</h3>

<p align="center">
  <a href="https://github.com/mopocop/Tarkov-moa/releases/latest">
    <img src="https://img.shields.io/badge/Download_for_Windows-c9a86a?style=for-the-badge&logo=windows&logoColor=171307" alt="Download for Windows" height="44">
  </a>
</p>

<p align="center"><sub>Free · Windows 10/11 · ~12&nbsp;MB · updates itself · no account, no sign-up</sub></p>

<p align="center"><sub>
<b>Status:</b> last release June 2026, built and verified against EFT 1.0.x.<br>
Quest, map and POI data is fetched live from tarkov.dev, so it follows the game on its own. Log parsing is version-sensitive:<br>
if a patch changes the notification format, automatic quest tracking can go quiet until the parser catches up — <a href="https://github.com/mopocop/Tarkov-moa/issues">open an issue</a> if you hit that.
</sub></p>

---

<!-- SCREENSHOTS: drop 2–3 real screenshots or a short GIF here once captured.
     Suggested: the live map with your position, squad mode with a teammate, the quest list.
     Until then this placeholder stays so the page still reads well. -->
<p align="center"><sub>📸 Screenshots coming soon.</sub></p>

## What it does

Tarkov MoA runs on a second monitor (or off to the side) and quietly keeps a map up to date while you play — no tabbing out, no manual ticking.

- **Your live position.** Your arrow moves on the map as you play. Take an in-game screenshot and the map jumps to you, on the right map, even underground.
- **Automatic quest tracking.** It reads the game's own log files and updates your objectives — accepted, completed, failed — on its own.
- **Map intel.** Extracts, spawns, loot and hazards for every map, with filters so you see only what you care about.
- **Squad mode.** Share your live position, custom markers and drawings with friends — everyone sees the same map in real time.
- **Six languages.** English, Português (Brasil), Русский, 日本語, 中文 and Español — it matches your game's language automatically.
- **Updates itself.** New versions install quietly in the background and are cryptographically signed, so you always have the latest without hunting for downloads.

## Installing — about a minute

1. Click **[Download for Windows](https://github.com/mopocop/Tarkov-moa/releases/latest)** and run the file you get.
2. Windows may show a blue **“Windows protected your PC”** box. This is normal for small independent apps. Click **More info**, then **Run anyway**. (Why this happens — and why it's safe — is just below.)
3. Open the app, point it at your Tarkov folder once when it asks, and you're set. It'll take you through the rest.

That's it. From then on it stays out of your way and updates itself.

## Is it safe? Is it a cheat?

Short answer: **yes, it's safe, and no, it's not a cheat.**

- **It only reads files the game already creates** — log files and your own screenshots. It never reads or touches the game's memory, never injects anything, and gives you nothing in a raid that you couldn't write down on paper yourself. It can't get you banned for cheating because it doesn't do anything a cheat does.
- **Why the Windows warning, then?** The app isn't signed with a paid certificate yet (those cost money every year), so Windows shows a generic “unknown publisher” caution for *any* small app without one. It's not a virus warning. The entire source code is right here on this page for anyone to read, and the automatic updates are cryptographically signed so you always get the genuine app.

---

## How it's built

A [Tauri 2](https://tauri.app) desktop app: **React + TypeScript** front end, a **Rust** core for everything that touches the filesystem, and a **Node WebSocket relay** for squad mode. Quest, map and POI data comes from the excellent [tarkov.dev](https://tarkov.dev) API.

The game exposes no API, so live state is read **passively** from files the game already writes — tailing its logs for quest events, parsing screenshot filenames for player position. Nothing reads or writes game memory.

The squad relay is **self-hosted behind [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)** — no port forwarding, no residential IP in DNS, its own isolated tailnet identity. The container runs non-root on a read-only root filesystem with all capabilities dropped; connection, room and frame limits are enforced in code. Runbook: [`server/deploy/README.md`](server/deploy/README.md).

📐 **[ARCHITECTURE.md](ARCHITECTURE.md)** — the design decisions, the trade-offs behind them, and what turned out to be impossible and why.

<details>
<summary><b>For developers — build from source &amp; contribute</b></summary>

<br>

```bash
# prerequisites: Node 20+, Rust (stable), and the Tauri prerequisites for your OS
npm install
npm run dev          # run the app in dev mode (Vite + Tauri)
npm test             # client unit tests (vitest)
```

Squad mode runs against a local relay during development:

```bash
cd server
npm install
npm start                                   # starts the relay on ws://localhost:8787
npm run bot -- ws://localhost:8787 - Pestily green <mapId> 60000   # optional: a fake teammate for testing
```

**Where things live**

| Path | What's there |
|------|--------------|
| `src/` | React UI — map, rail, onboarding, squad, settings, i18n |
| `src/i18n/` | Internationalization setup + locale files (`locales/*.json`) |
| `src-tauri/` | Rust backend (log parsing, game-folder detection, updater) |
| `server/` | Node WebSocket relay for squad mode |
| `shared/` | Types/protocol shared between app and relay |

Contributions are welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup details, branch conventions and how pull requests are reviewed.

</details>

---

<p align="center"><sub>
Unofficial fan-made tool — not affiliated with, endorsed by, or connected to Battlestate Games.<br>
Quest, map &amp; POI data by <a href="https://tarkov.dev">tarkov.dev</a> · map rendering by Leaflet · icons by Phosphor.<br>
Released under the <a href="LICENSE">MIT license</a>.
</sub></p>
