import { describe, it, expect } from 'vitest';
import en from './locales/en.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import es from './locales/es.json';

// Recursively flatten a locale object into dotted-path -> string entries.
type Json = { [k: string]: string | Json };
function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) Object.assign(out, flatten(v as Json, path));
    else out[path] = v as string;
  }
  return out;
}

// Extract i18next interpolation placeholders ({{var}}) from a string, sorted.
function placeholders(s: string): string[] {
  return (s.match(/{{\s*\w+\s*}}/g) ?? []).map((m) => m.replace(/\s/g, '')).sort();
}

const enFlat = flatten(en as Json);
const enKeys = Object.keys(enFlat).sort();

const locales: Record<string, Json> = { pt, ru, ja, zh, es } as Record<string, Json>;

describe('locale completeness', () => {
  for (const [name, data] of Object.entries(locales)) {
    const flat = flatten(data as Json);
    const keys = Object.keys(flat).sort();

    it(`${name}.json has exactly the same keys as en.json`, () => {
      const missing = enKeys.filter((k) => !(k in flat));
      const extra = keys.filter((k) => !(k in enFlat));
      expect(missing, `keys missing from ${name}.json`).toEqual([]);
      expect(extra, `unexpected extra keys in ${name}.json`).toEqual([]);
    });

    it(`${name}.json preserves every {{placeholder}} from en.json`, () => {
      const mismatches: string[] = [];
      for (const key of enKeys) {
        if (!(key in flat)) continue; // key-parity test already covers this
        const want = placeholders(enFlat[key]).join(',');
        const got = placeholders(flat[key]).join(',');
        if (want !== got) mismatches.push(`${key}: en[${want}] != ${name}[${got}]`);
      }
      expect(mismatches, `placeholder mismatches in ${name}.json`).toEqual([]);
    });
  }
});
