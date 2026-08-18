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

const ENDPOINT = 'https://api.tarkov.dev/graphql';
const LANGS = ['en', 'pt', 'ru', 'ja', 'zh', 'es'];
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'snapshot');

const langArg = (lang) => (lang === 'en' ? '' : `(lang: ${lang})`);

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
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query(lang) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  // Partial errors are tolerated the same way the app tolerates them: a single
  // dangling reference should not discard an otherwise complete dataset.
  if (body.errors?.length && !body.data) {
    throw new Error(body.errors.map((e) => e.message ?? e).join('; '));
  }
  const { tasks, maps } = body.data ?? {};
  if (!Array.isArray(tasks) || !Array.isArray(maps)) throw new Error('unexpected shape');
  if (tasks.length === 0) throw new Error('refusing to write an empty task list');
  return { tasks, maps };
}

const generatedAt = new Date().toISOString();
await mkdir(OUT_DIR, { recursive: true });

let failures = 0;
for (const lang of LANGS) {
  try {
    const { tasks, maps } = await fetchLang(lang);
    const out = { generatedAt, lang, tasks, maps };
    const path = resolve(OUT_DIR, `${lang}.json`);
    await writeFile(path, JSON.stringify(out) + '\n', 'utf8');
    console.log(`${lang}: ${tasks.length} tasks, ${maps.length} maps`);
  } catch (err) {
    failures += 1;
    console.error(`${lang}: FAILED — ${err.message}`);
  }
}

// A total failure is an upstream outage, not a reason to commit anything. Any
// partial success still leaves the untouched languages on their previous copy.
if (failures === LANGS.length) {
  console.error('every language failed — leaving the committed snapshot untouched');
  process.exit(1);
}
