# Data snapshot

A periodic copy of the tarkov.dev data the app needs to start, refreshed by
[`.github/workflows/data-snapshot.yml`](../../.github/workflows/data-snapshot.yml).

The app reads it in two ways:

- **over HTTP**, from `raw.githubusercontent.com`, when the live API is
  unreachable and the local cache is empty or also missing the language;
- **compiled in**, for English only — `en.json` is imported at build time so a
  fresh install has something to show even with no network at all.

`en.json` ships as an empty placeholder until the workflow's first successful
run populates it. Empty is treated as "no snapshot", not as "no quests".
