# Architecture

Tarkov MoA keeps a map in sync with what's happening in a game that offers no API,
no plugin surface, and no way to ask it anything. Everything below follows from
that one constraint.

## Shape

Three processes, two of them on the player's machine.

```
┌─ desktop app (Tauri 2) ──────────────────────────┐
│                                                  │
│  React + TypeScript          Rust core           │
│  ├─ map, quests, POIs   ◄──► ├─ log_watcher.rs   │
│  ├─ squad UI                 ├─ screenshots.rs   │
│  └─ i18n (6 locales)         ├─ eft_config.rs    │
│                              └─ game_lang.rs     │
└────────────┬─────────────────────────┬───────────┘
             │ HTTPS                   │ WSS
             ▼                         ▼
     tarkov.dev GraphQL         squad relay (Node)
     (quests, maps, POIs)       ├─ rooms.ts
                                ├─ analytics.ts
                                └─ feedback.ts
```

The Rust core owns everything that touches the filesystem and the OS. The React
layer owns all state the user can see. They talk over Tauri's command/event
bridge — the core *emits*, the UI *subscribes*; the UI never polls the disk.

`shared/squadProtocol.ts` is the single wire contract between the client and the
relay. It imports nothing, by rule, so the relay never takes a dependency on
client internals.

## Why Tauri and not Electron

Two reasons, in order of weight.

1. **Native filesystem work is the product.** Live state comes from tailing game
   logs and watching a screenshot directory — a long-running, truncation-safe
   file watcher. That belongs in a real systems language, not behind a Node
   shim.
2. **Size.** The installer is ~12 MB. An Electron build of the same app starts
   around 80 MB. For a free utility that people download on a friend's
   recommendation, download size is a conversion problem.

## Where live state comes from

The game exposes nothing on purpose, so the app reads only what the game already
writes to disk:

- **Quest state** — `push-notifications_*.log`. Trader-dialog notifications carry
  a `message.type` (10 accepted / 11 failed / 12 completed) and a `templateId`
  whose first token is the quest id. Progress is modelled as three **grow-only
  sets** — accepted, completed, failed — so replaying old log files in any order
  converges to the same state. A removal-based model would let file ordering
  resurrect finished quests, because the game re-logs old notifications in later
  sessions.
- **Player position** — the game encodes world coordinates and a rotation
  quaternion into screenshot *filenames*. A watcher parses the name, emits a
  position, and deletes the file.

**This is deliberately passive.** The app never reads or writes game memory and
never injects anything. It only reads files the game itself produced, which is
what lets it claim to be anti-cheat-safe without hand-waving. The cost of that
choice is real and stated below.

## Squad mode: a relay, not P2P

Squad mode shares live position, custom markers, and freehand drawings between
players in the same raid.

**Decision: a small fan-out relay keyed by room code, not WebRTC.** P2P would
save the server, but NAT traversal for a handful of players in a game session is
a large amount of failure surface for a feature that moves a few hundred bytes a
second. The relay is ~300 MB of Node at a thousand concurrent squads.

The design keeps the door open: every message is a **self-describing JSON
envelope**, and the relay only parses *control* messages (join / peer-join /
error). Data messages are forwarded **opaquely** — it never inspects a payload.
Swapping WebSocket for an `RTCDataChannel` is therefore a transport change, not a
redesign.

Hard limits live in code, not in a config nobody reads: 64 KB max frame, 15
messages/sec with a burst of 40 per socket, 200 concurrent connections, 500
rooms, 8 members per squad. Room codes come from `node:crypto`, not `Math.random`.

## How the relay is operated

The relay is **self-hosted**, exposed to the public internet through **Tailscale
Funnel** — so there is no port forwarding and no residential IP in DNS. It runs
under its own tailnet identity, isolated from the host's other services.

The container is hardened rather than trusted:

- non-root, **read-only root filesystem**, `cap_drop: ALL`, `no-new-privileges`
- Tailscale in **userspace mode** — no `NET_ADMIN`, no `/dev/net/tun`
- memory and pid limits, health checks on both containers
- the runtime image carries a single bundled `.mjs` — no `node_modules`, no
  source, no dev tooling
- `/stats` returns 404 unless a token is configured

The full runbook is in [`server/deploy/README.md`](server/deploy/README.md).

## What isn't trackable, and why

Worth stating plainly, because it's the boundary of the product.

**Story and Operational quests cannot be tracked passively.** This was
investigated to a conclusion, not abandoned:

- They emit **no** log events. Across 51 log files from real sessions, only Side
  quests ever produced a notification. Story quests use no trader dialog, so they
  bypass the notification channel entirely.
- Their state lives in HTTP response *bodies* (`getMainQuestsList`), and the game
  logs headers only — the body is always empty.
- Raising the log level to capture bodies **trips the game's file-integrity
  check** and triggers a repair prompt on next launch. That route is closed.
- The community data source (tarkov.dev) doesn't carry them either.

So the app tracks Side quests only, and says so in onboarding. The remaining
routes all require an HTTP proxy against a game with anti-cheat, which is not a
trade worth making for a map utility.

## Known limits

- **Position updates on screenshot, not continuously.** That's the price of
  staying out of game memory. Players bind the screenshot key to a spare mouse
  button; stale positions fade out rather than lying.
- **Objectives within a quest aren't reliably ordered.** The upstream schema has
  no ordering field, and neither tarkov.dev's own UI nor other trackers number
  them. Rendered as bullets rather than faking a sequence.
- **Windows only.** The log and screenshot paths are Windows-specific.

## Tests

`vitest` on both sides of the wire (8 client suites, 3 relay suites) and 10
`#[test]` functions in the Rust core, covering the log-filename predicates and
the notification JSON shapes — the two places where a game patch breaks things
silently. CI runs type-check, tests, and lint on every push; all three are
required.
