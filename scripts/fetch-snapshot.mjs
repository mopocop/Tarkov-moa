// Fetches a tarkov.dev snapshot in a shared-base + per-language format and
// writes data/snapshot/base.json plus data/snapshot/locale-<lang>.json.
//
// Why this exists: tarkov.dev is the app's only upstream, and when it goes down
// (as it did for hours on 2026-08-17) a user with no local cache has nothing to
// fall back on. A committed snapshot gives every install a floor that does not
// depend on tarkov.dev being reachable right now.
//
// Run by .github/workflows/data-snapshot.yml on a schedule. Writes only; the
// workflow decides whether anything changed and is worth committing.

import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Overridable so the outage-vs-defect classification below can be exercised
// against a stub without waiting for tarkov.dev to actually break.
const BASE_URL = process.env.SNAPSHOT_BASE_URL ?? 'https://json.tarkov.dev';
const GAME_MODE = 'regular';
const LANGS = ['en', 'pt', 'ru', 'ja', 'zh', 'es'];
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'snapshot');

// tarkov.dev being down is weather; a broken payload is a defect. Only the
// second one should paint the repo red, so failures carry which kind they are.
class UpstreamOutage extends Error {}

// tarkov.dev answers an outage with a 5xx (or 408/429) and usually a body that
// says so. The message, not the status alone, decides.
const OUTAGE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const OUTAGE_TEXT = /unavailable|try again later|timeout|timed out|bad gateway|overloaded/i;

async function fetchJson(path) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/${path}`);
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
  return body;
}

// A 200 carrying the wrong shape is a defect: refuse loudly rather than writing
// a snapshot the app would later misread.
function expectObject(node, path, what) {
  let cur = node;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null) {
      throw new Error(`unexpected shape for ${what}`);
    }
    cur = cur[key];
  }
  if (typeof cur !== 'object' || cur === null) {
    throw new Error(`unexpected shape for ${what}`);
  }
  return cur;
}

const isEmpty = (v) =>
  v == null ||
  v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

const copyPresent = (raw, keys) => {
  const out = {};
  for (const key of keys) {
    if (!isEmpty(raw[key])) out[key] = raw[key];
  }
  return out;
};

const TASK_KEYS = [
  'id', 'name', 'normalizedName', 'map', 'trader', 'kappaRequired', 'factionName',
  'objectives',
];
const OBJECTIVE_KEYS = [
  'id', 'type', 'description', 'maps', 'zones', 'possibleLocations', 'optional',
  'count', 'exitName', 'exitStatus', 'requiredKeys',
];

const pruneZone = (raw) => copyPresent(raw, ['map', 'position']);
const prunePossibleLocation = (raw) => copyPresent(raw, ['map', 'positions']);

function pruneObjective(raw) {
  const out = copyPresent(raw, OBJECTIVE_KEYS);
  if (Array.isArray(out.zones)) out.zones = out.zones.map(pruneZone);
  if (Array.isArray(out.possibleLocations)) {
    out.possibleLocations = out.possibleLocations.map(prunePossibleLocation);
  }
  return out;
}

function pruneTask(raw) {
  const out = copyPresent(raw, TASK_KEYS);
  if (Array.isArray(out.objectives)) out.objectives = out.objectives.map(pruneObjective);
  return out;
}

const pruneMap = (raw) => copyPresent(raw, ['id', 'name', 'normalizedName']);
const pruneTrader = (raw) => copyPresent(raw, ['id', 'name']);

function collectStrings(node, set) {
  if (typeof node === 'string') {
    set.add(node);
  } else if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, set);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectStrings(value, set);
  }
  return set;
}

function pruneLocale(dict, keys) {
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(dict, key)) out[key] = dict[key];
  }
  return out;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const generatedAt = new Date().toISOString();
await mkdir(OUT_DIR, { recursive: true });

let outages = 0;
let defects = 0;
let baseWritten = false;

// ---- base documents (one each, language independent) ------------------------
const baseJobs = [
  { key: 'tasks', path: `${GAME_MODE}/tasks` },
  { key: 'maps', path: `${GAME_MODE}/maps` },
  { key: 'traders', path: `${GAME_MODE}/traders` },
];

const baseResults = await Promise.allSettled(baseJobs.map(({ path }) => fetchJson(path)));
const baseDocs = {};
let baseFailed = false;

baseResults.forEach((result, i) => {
  const { key } = baseJobs[i];
  if (result.status === 'fulfilled') {
    baseDocs[key] = result.value;
  } else {
    baseFailed = true;
    const err = result.reason;
    if (err instanceof UpstreamOutage) {
      outages += 1;
      console.log(`::warning::${key}: tarkov.dev unreachable — ${err.message}`);
    } else {
      defects += 1;
      console.error(`::error::${key}: FAILED — ${err.message}`);
    }
  }
});

let base;
if (!baseFailed) {
  try {
    const tasksData = expectObject(baseDocs.tasks, ['data', 'tasks'], 'tasks');
    const mapsData = expectObject(baseDocs.maps, ['data', 'maps'], 'maps');
    // Unlike tasks and maps, the traders document has NO inner container: the
    // traders sit directly under `data`, keyed by id.
    const tradersData = expectObject(baseDocs.traders, ['data'], 'traders');
    if (Object.keys(tasksData).length === 0) {
      throw new Error('refusing to write an empty task list');
    }
    base = {
      generatedAt,
      gameMode: GAME_MODE,
      tasks: Object.fromEntries(Object.entries(tasksData).map(([id, raw]) => [id, pruneTask(raw)])),
      maps: Object.fromEntries(Object.entries(mapsData).map(([id, raw]) => [id, pruneMap(raw)])),
      traders: Object.fromEntries(Object.entries(tradersData).map(([id, raw]) => [id, pruneTrader(raw)])),
    };
  } catch (err) {
    defects += 1;
    console.error(`::error::base: FAILED — ${err.message}`);
  }
}

if (base) {
  const baseJson = JSON.stringify(base);
  await writeFile(resolve(OUT_DIR, 'base.json'), baseJson + '\n', 'utf8');
  baseWritten = true;
  console.log(
    `base.json: ${Object.keys(base.tasks).length} tasks, ${Object.keys(base.maps).length} maps, ` +
    `${Object.keys(base.traders).length} traders (${kb(Buffer.byteLength(baseJson))})`,
  );

  // The strings the pruned base actually references. Each language dictionary
  // keeps only these keys, which is what makes six languages affordable.
  const referenced = collectStrings(base, new Set());

  // ---- locale dictionaries (one extra request per dataset per language) -----
  const localeJobs = [];
  for (const lang of LANGS) {
    for (const dataset of ['tasks', 'maps', 'traders']) {
      localeJobs.push({ lang, dataset, path: `${GAME_MODE}/${dataset}_${lang}` });
    }
  }

  const localeResults = await Promise.allSettled(
    localeJobs.map(async ({ lang, dataset, path }) => {
      const doc = await fetchJson(path);
      const data = expectObject(doc, ['data'], `${dataset}_${lang}`);
      return { lang, dataset, data };
    }),
  );

  const rawLocales = {};
  for (const lang of LANGS) rawLocales[lang] = { tasks: null, maps: null, traders: null };

  localeResults.forEach((result, i) => {
    const { lang, dataset } = localeJobs[i];
    if (result.status === 'fulfilled') {
      rawLocales[lang][dataset] = result.value.data;
    } else {
      const err = result.reason;
      if (err instanceof UpstreamOutage) {
        outages += 1;
        console.log(`::warning::${dataset}_${lang}: tarkov.dev unreachable — ${err.message}`);
      } else {
        defects += 1;
        console.error(`::error::${dataset}_${lang}: FAILED — ${err.message}`);
      }
    }
  });

  for (const lang of LANGS) {
    const raw = rawLocales[lang];
    // Only write a language's file when all three dictionaries arrived; a
    // partial file would clobber the committed copy with gaps.
    if (raw.tasks === null || raw.maps === null || raw.traders === null) continue;
    const locale = {
      tasks: pruneLocale(raw.tasks, referenced),
      maps: pruneLocale(raw.maps, referenced),
      traders: pruneLocale(raw.traders, referenced),
    };
    const json = JSON.stringify(locale);
    await writeFile(resolve(OUT_DIR, `locale-${lang}.json`), json + '\n', 'utf8');
    console.log(`locale-${lang}.json: ${kb(Buffer.byteLength(json))}`);
  }

  // ---- extract items (fetched last; must never fail the run) ----------------
  const itemIds = new Set();
  for (const map of Object.values(baseDocs.maps?.data?.maps ?? {})) {
    for (const extract of map.extracts ?? []) {
      if (extract?.transferItem?.item) itemIds.add(extract.transferItem.item);
    }
  }

  if (itemIds.size > 0) {
    try {
      const [itemsDoc, itemsEnDoc] = await Promise.all([
        fetchJson(`${GAME_MODE}/items`),
        fetchJson(`${GAME_MODE}/items_en`),
      ]);
      const items = expectObject(itemsDoc, ['data', 'items'], 'items');
      const itemsEn = expectObject(itemsEnDoc, ['data'], 'items_en');
      const extractItems = {};
      for (const id of itemIds) {
        const nameKey = items[id]?.name;
        const name = nameKey != null ? itemsEn[nameKey] : undefined;
        if (name != null) extractItems[id] = name;
      }
      const json = JSON.stringify(extractItems);
      await writeFile(resolve(OUT_DIR, 'extract-items.json'), json + '\n', 'utf8');
      console.log(`extract-items.json: ${itemIds.size} ids, ${kb(Buffer.byteLength(json))}`);
    } catch (err) {
      // This file is a nice-to-have; the maps already carry the ids. Any failure
      // here must never fail the run, so keep the committed copy.
      const why = err instanceof Error ? err.message : String(err);
      console.log(`::warning::extract-items.json: keeping previous copy — ${why}`);
    }
  } else {
    console.log('extract-items.json: no transfer items referenced — skipping');
  }

  // ---- drop the old per-language files --------------------------------------
  for (const lang of LANGS) {
    const path = resolve(OUT_DIR, `${lang}.json`);
    try {
      await unlink(path);
      console.log(`removed stale ${lang}.json`);
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }
}

// A defect is ours and must be seen, even when other parts happened to succeed.
// An outage is not ours: the committed snapshot simply stays as it is and the
// run goes green, so a week of upstream downtime does not read as a week of
// broken CI.
// process.exitCode rather than process.exit(): the latter tears the loop down
// while undici's keep-alive sockets are still closing, which trips a libuv
// assertion on Windows and replaces this script's exit code with a crash.
if (defects > 0) {
  console.error(`${defects} failure(s) for a reason that is not an upstream outage`);
  process.exitCode = 1;
} else if (!baseWritten && outages > 0) {
  console.log('::warning::tarkov.dev is down — committed snapshot left untouched');
}
