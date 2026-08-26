// Fetches a tarkov.dev snapshot for every supported language and writes
// data/snapshot/<lang>.json.
//
// Why this exists: tarkov.dev is the app's only upstream, and when it goes down
// (as it did for hours on 2026-08-17) a user with no local cache has nothing to
// fall back on. A committed snapshot gives every install a floor that does not
// depend on tarkov.dev being reachable right now.
//
// Run by .github/workflows/data-snapshot.yml on a schedule. Writes only; the
// workflow decides whether anything changed and is worth committing.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Overridable so the outage-vs-defect classification below can be exercised
// against a stub without waiting for tarkov.dev to actually break.
const ENDPOINT = process.env.SNAPSHOT_ENDPOINT ?? 'https://api.tarkov.dev/graphql';
const LANGS = ['en', 'pt', 'ru', 'ja', 'zh', 'es'];
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'snapshot');

const langArg = (lang) => (lang === 'en' ? '' : `(lang: ${lang})`);

// tarkov.dev being down is weather; a broken query is a defect. Only the second
// one should paint the repo red, so failures carry which kind they are.
class UpstreamOutage extends Error {}

// tarkov.dev answers an outage with 422 and a body that says so, which is
// otherwise the same status it uses for a query it refuses to parse — so the
// message, not the status alone, decides.
const OUTAGE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const OUTAGE_TEXT = /unavailable|try again later|timeout|timed out|bad gateway|overloaded/i;

// Deliberately narrower than the app's live queries: this is a fallback, not a
// mirror. Tasks and map names are what the app cannot usefully start without.
// POIs are the largest payload and the app already degrades gracefully without
// them, so they stay out to keep the snapshot small enough to commit daily.
const query = (lang) => `
  query Snapshot {
    tasks${langArg(lang)} {
      id name minPlayerLevel wikiLink
      map { id name }
      trader { name }
      taskRequirements { task { id name } status }
      objectives {
        id type description
        maps { id name }
        ... on TaskObjectiveQuestItem { possibleLocations { map { id name } positions { x y z } } }
        ... on TaskObjectiveMark { zones { id map { id name } position { x y z } } }
        ... on TaskObjectiveBasic { zones { id map { id name } position { x y z } } }
        ... on TaskObjectiveExtract { exitName exitStatus zoneNames }
      }
    }
    maps${langArg(lang)} { id name normalizedName }
  }
`;

async function fetchLang(lang) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query(lang) }),
    });
  } catch (err) {
    // DNS failure, refused connection, socket hang up: the host is not there.
    throw new UpstreamOutage(err.message);
  }

  const raw = await res.text();

  if (!res.ok) {
    const outage = OUTAGE_STATUS.has(res.status) || OUTAGE_TEXT.test(raw);
    const detail = `HTTP ${res.status} — ${raw.slice(0, 200)}`;
    throw outage ? new UpstreamOutage(detail) : new Error(detail);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    // A 200 that is not JSON is a proxy or status page in front of the API.
    throw new UpstreamOutage(`non-JSON body — ${raw.slice(0, 200)}`);
  }

  // Partial errors are tolerated the same way the app tolerates them: a single
  // dangling reference should not discard an otherwise complete dataset.
  if (body.errors?.length && !body.data) {
    const message = body.errors.map((e) => e.message ?? e).join('; ');
    throw OUTAGE_TEXT.test(message) ? new UpstreamOutage(message) : new Error(message);
  }
  const { tasks, maps } = body.data ?? {};
  if (!Array.isArray(tasks) || !Array.isArray(maps)) throw new Error('unexpected shape');
  if (tasks.length === 0) throw new Error('refusing to write an empty task list');
  return { tasks, maps };
}

const generatedAt = new Date().toISOString();
await mkdir(OUT_DIR, { recursive: true });

let outages = 0;
let defects = 0;
for (const lang of LANGS) {
  try {
    const { tasks, maps } = await fetchLang(lang);
    const out = { generatedAt, lang, tasks, maps };
    const path = resolve(OUT_DIR, `${lang}.json`);
    await writeFile(path, JSON.stringify(out) + '\n', 'utf8');
    console.log(`${lang}: ${tasks.length} tasks, ${maps.length} maps`);
  } catch (err) {
    if (err instanceof UpstreamOutage) {
      outages += 1;
      console.log(`::warning::${lang}: tarkov.dev unreachable — ${err.message}`);
    } else {
      defects += 1;
      console.error(`::error::${lang}: FAILED — ${err.message}`);
    }
  }
}

// A defect is ours and must be seen, even when other languages happened to
// succeed. An outage is not ours: the committed snapshot simply stays as it is
// and the run goes green, so a week of upstream downtime does not read as a
// week of broken CI.
// process.exitCode rather than process.exit(): the latter tears the loop down
// while undici's keep-alive sockets are still closing, which trips a libuv
// assertion on Windows and replaces this script's exit code with a crash.
if (defects > 0) {
  console.error(`${defects} language(s) failed for a reason that is not an upstream outage`);
  process.exitCode = 1;
} else if (outages === LANGS.length) {
  console.log('::warning::tarkov.dev is down for every language — committed snapshot left untouched');
}
